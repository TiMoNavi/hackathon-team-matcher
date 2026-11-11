// apps/server/src/workers/videoRenderWorker.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../s3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

let shuttingDown = false;
let currentChild: import("node:child_process").ChildProcess | null = null;

const prisma = new PrismaClient();

const BUCKET = process.env.S3_BUCKET!;
const TMPROOT = process.env.TMPDIR || os.tmpdir();

// ✅ Wichtig: in Prod am besten absolute Pfade setzen (weil PATH bei pm2/systemd manchmal anders ist)
const FFMPEG = process.env.FFMPEG_PATH || "/usr/local/bin/ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "/usr/local/bin/ffprobe";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    if (shuttingDown) {
      clearTimeout(t);
      resolve();
    }
  });
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("[video-worker] shutting down…");

  try {
    currentChild?.kill("SIGTERM");
  } catch {}

  try {
    await prisma.$disconnect();
  } catch {}

  console.log("[video-worker] shutdown complete");
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

type EditMeta = {
  align: { scale: number; tx: number; ty: number };
  fit: "cover" | "contain";
  baseSize: number; // W (Step1/2)
  srcW: number;
  srcH: number;
  outSize: number; // 1080
  coverTimeMs?: number;
};

function baseSize(S: number, srcW: number, srcH: number, fit: "cover" | "contain") {
  const r = srcW / srcH;
  if (fit === "cover") {
    if (r >= 1) return { w: S * r, h: S };
    return { w: S, h: S / r };
  } else {
    if (r >= 1) return { w: S, h: S / r };
    return { w: S * r, h: S };
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ✅ Cover-Crop: exakt AlignableSquare-Mathe → crop rect in Source-Pixeln
function computeCoverCrop(edit: EditMeta) {
  const S = edit.baseSize;
  const srcW = edit.srcW;
  const srcH = edit.srcH;

  const base = baseSize(S, srcW, srcH, "cover");
  const baseScale = base.w / srcW;
  const totalScale = baseScale * edit.align.scale;

  const cropSide = S / totalScale;

  const cx = srcW / 2 - edit.align.tx / totalScale;
  const cy = srcH / 2 - edit.align.ty / totalScale;

  let x = cx - cropSide / 2;
  let y = cy - cropSide / 2;

  x = clamp(x, 0, srcW - cropSide);
  y = clamp(y, 0, srcH - cropSide);

  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(cropSide),
    h: Math.round(cropSide),
  };
}

async function streamToFile(body: any, outPath: string) {
  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(outPath);
    body.pipe(ws);
    body.on("error", reject);
    ws.on("finish", () => resolve());
    ws.on("error", reject);
  });
}

async function downloadS3(key: string, outPath: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!res.Body) throw new Error("S3 getObject: empty body");
  await streamToFile(res.Body as any, outPath);
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    if (shuttingDown) return reject(new Error("Worker shutting down"));

    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    currentChild = p;

    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));

    p.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (currentChild === p) currentChild = null;

      if (shuttingDown) return reject(new Error(`aborted (${signal ?? code})`));
      if (code === 0) return resolve();

      reject(new Error(`${cmd} failed (${code ?? "?"}/${signal ?? ""}): ${err.slice(-3000)}`));
    });

    if (shuttingDown) {
      try {
        p.kill("SIGTERM");
      } catch {}
    }
  });
}

async function uploadS3(key: string, filePath: string, contentType: string) {
  const body = fs.createReadStream(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

async function ensureTmpDir() {
  const dir = fs.mkdtempSync(path.join(TMPROOT, "vid-"));
  return dir;
}

async function claimVideoJobs(limit = 2) {
  await prisma.$executeRaw`
    UPDATE "MediaProcessingJob" j
    SET status = 'PENDING', "updatedAt" = NOW()
    FROM "PostMedia" m
    WHERE j."mediaId" = m.id
      AND j.status = 'PROCESSING'
      AND m.kind = 'VIDEO'
      AND j."updatedAt" < NOW() - INTERVAL '10 minutes';
  `;

  const rows = await prisma.$queryRaw<any[]>`
    WITH cte AS (
      SELECT j.id
      FROM "MediaProcessingJob" j
      JOIN "PostMedia" m ON m.id = j."mediaId"
      WHERE j.status = 'PENDING'
        AND m.kind = 'VIDEO'
      ORDER BY j."createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "MediaProcessingJob" j
    SET status='PROCESSING',
        attempts=attempts+1,
        "updatedAt"=NOW()
    FROM cte
    WHERE j.id = cte.id
    RETURNING j.id, j."mediaId", j.attempts;
  `;
  return rows as Array<{ id: string; mediaId: string; attempts: number }>;
}

async function processOne(mediaId: string) {
  const media = await prisma.postMedia.findUnique({
    where: { id: mediaId },
    select: {
      id: true,
      key: true,
      thumbKey: true,
      kind: true,
      mime: true,
      edit: true,
      postId: true,
      idx: true,
    },
  });

  if (!media) throw new Error("media not found");

  // Nur Video + EditMeta
  if (media.kind !== "VIDEO") {
    await prisma.postMedia.update({
      where: { id: mediaId },
      data: { processStatus: "DONE", processError: null },
    });
    await prisma.mediaProcessingJob.update({
      where: { mediaId },
      data: { status: "DONE", lastError: null },
    });
    return;
  }

  const edit = media.edit as unknown as EditMeta | null;
  if (!edit) {
    await prisma.postMedia.update({
      where: { id: mediaId },
      data: { processStatus: "DONE", processError: null },
    });
    await prisma.mediaProcessingJob.update({
      where: { mediaId },
      data: { status: "DONE", lastError: null },
    });
    return;
  }

  // ✅ Original-Key merken, damit wir Post.videoKey sicher swapen können
  const originalKey = media.key;
  const originalThumbKey = media.thumbKey;

  const tmpDir = await ensureTmpDir();
  const jobId = randomUUID();

  const inPath = path.join(tmpDir, `in_${jobId}.mp4`);
  const outPath = path.join(tmpDir, `out_${jobId}.mp4`);
  const outJpg = path.join(tmpDir, `thumb_${jobId}.jpg`);

  try {
    // 1) Download original
    await downloadS3(originalKey, inPath);

    // 2) Compute crop (cover)
    const crop = computeCoverCrop(edit);
    const outSize = edit.outSize || 1080;
    

    // 3) Render square video
    await run(FFMPEG, [
      "-y",
      "-i",
      inPath,
      "-vf",
      `crop=w=${crop.w}:h=${crop.h}:x=${crop.x}:y=${crop.y},scale=${outSize}:${outSize}`,
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outPath,
    ]);

    console.log("[video-worker] editMeta", {
      mediaId,
      coverTimeMs: (edit as any)?.coverTimeMs,
      edit,
    });


    const coverSec = Math.max(0, (edit.coverTimeMs ?? 1000) / 1000);


    // 4) Thumb (1s)
    await run(FFMPEG, [
      "-y",
      "-i",
      outPath,
      "-ss",
      String(coverSec),
      "-vframes",
      "1",
      "-vf",
      `scale=${outSize}:${outSize}`,
      outJpg,
    ]);

    // 5) Upload rendered (immer neuer Key => kein Cache/Overwrite-Problem)
    const renderedKey = `posts/rendered/${media.postId}/${media.id}-${jobId}.mp4`;
    const renderedThumbKey = `posts/rendered/${media.postId}/${media.id}-${jobId}.jpg`;

    await uploadS3(renderedKey, outPath, "video/mp4");
    await uploadS3(renderedThumbKey, outJpg, "image/jpeg");

    // 6) DB updates:
    //    a) PostMedia auf neue Keys setzen
    await prisma.postMedia.update({
      where: { id: mediaId },
      data: {
        processStatus: "DONE",
        processError: null,
        key: renderedKey,
        thumbKey: renderedThumbKey,
      },
    });

    //    b) Post.videoKey / Post.thumbKey nur dann swapen,
    //       wenn der Post aktuell noch auf das Original zeigt (damit nix kaputt überschrieben wird)
    // b1) Post.videoKey immer swapen (wenn Post noch auf original zeigt)
    await prisma.post.updateMany({
      where: { id: media.postId, videoKey: originalKey },
      data: { videoKey: renderedKey },
    });

    // b2) Post.thumbKey NUR setzen, wenn noch keiner existiert
    await prisma.post.updateMany({
      where: { id: media.postId, videoKey: renderedKey },
      data: { thumbKey: renderedThumbKey },
    });




    // ✅ Falls du auch die Download-Variante über imageKey/videoKey nutzt: imageKey nicht anfassen.

    await prisma.mediaProcessingJob.update({
      where: { mediaId },
      data: { status: "DONE", lastError: null },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    await prisma.postMedia.update({
      where: { id: mediaId },
      data: { processStatus: "FAILED", processError: msg },
    });

    await prisma.mediaProcessingJob.update({
      where: { mediaId },
      data: { status: "FAILED", lastError: msg },
    });

    throw e;
  } finally {
    // cleanup tmp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

export async function runVideoWorkerLoop() {
  console.log("[video-worker] started");
  console.log("[video-worker] ffmpeg:", FFMPEG, "ffprobe:", FFPROBE);

  while (!shuttingDown) {
    try {
      const jobs = await claimVideoJobs(2);

      if (!jobs.length) {
        await sleep(1500);
        continue;
      }

      for (const j of jobs) {
        if (shuttingDown) break;

        try {
          // PostMedia auf PROCESSING setzen
          await prisma.postMedia.update({
            where: { id: j.mediaId },
            data: { processStatus: "PROCESSING" },
          });

          await processOne(j.mediaId);
        } catch (err) {
          console.warn("[video-worker] job failed", j.mediaId, err);
        }
      }
    } catch (e) {
      console.warn("[video-worker] loop error", e);
      await sleep(2000);
    }
  }

  await shutdown();
}
