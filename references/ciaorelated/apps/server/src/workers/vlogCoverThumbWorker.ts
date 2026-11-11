import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "../context";
import { s3 } from "../s3";

const BUCKET = process.env.S3_BUCKET!;
const TMPROOT = process.env.TMPDIR || os.tmpdir();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isHttpUrl(s?: string | null) {
  return !!s && /^https?:\/\//i.test(s);
}
function looksLikeS3Key(s?: string | null) {
  if (!s) return false;
  if (isHttpUrl(s)) return false;
  if (s.startsWith("data:")) return false;
  return s.includes("/") && !s.includes(" ");
}

function coverKeyToThumb(key: string) {
  // original: covers/<id>.jpg  → thumb: covers/<id>_320.jpg
  return key.replace(/(\.\w+)$/, "_320$1");
}

async function streamToFile(body: any, outPath: string) {
  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(outPath);
    body.pipe(ws);
    body.on("error", reject);
    ws.on("finish", resolve);
    ws.on("error", reject);
  });
}

async function downloadS3(key: string, outPath: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!res.Body) throw new Error("S3 getObject: empty body");
  await streamToFile(res.Body as any, outPath);
}

async function uploadS3(key: string, filePath: string, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
      // optional:
      // CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

async function claimJobs(limit = 2) {
  await prisma.$executeRaw`
    UPDATE "VlogCoverProcessingJob" j
    SET status = 'PENDING', "updatedAt" = NOW()
    WHERE j.status = 'PROCESSING'
      AND j."updatedAt" < NOW() - INTERVAL '10 minutes';
  `;

  const rows = await prisma.$queryRaw<any[]>`
    WITH cte AS (
      SELECT j.id
      FROM "VlogCoverProcessingJob" j
      WHERE j.status = 'PENDING'
      ORDER BY j."createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "VlogCoverProcessingJob" j
    SET status='PROCESSING',
        attempts=attempts+1,
        "updatedAt"=NOW()
    FROM cte
    WHERE j.id = cte.id
    RETURNING j.id, j."vlogId";
  `;

  return rows as Array<{ id: string; vlogId: string }>;
}

async function processOne(vlogId: string) {
  const v = await prisma.vlog.findUnique({
    where: { id: vlogId },
    select: { id: true, coverKey: true },
  });
  if (!v) throw new Error("vlog not found");

  const raw = v.coverKey;

  // Kein Cover oder nicht S3 -> DONE (idempotent)
  if (!looksLikeS3Key(raw)) {
    await prisma.vlogCoverProcessingJob.update({
      where: { vlogId },
      data: { status: "DONE", lastError: null },
    });
    return;
  }

  const originalKey = raw!;
  const thumbKey = coverKeyToThumb(originalKey);

  const tmpDir = fs.mkdtempSync(path.join(TMPROOT, "vlogcover-"));
  const inPath = path.join(tmpDir, "in");
  const outPath = path.join(tmpDir, "cover_320.jpg");

  try {
    await downloadS3(originalKey, inPath);

    // 320px breite, Seitenverhältnis beibehalten
    await sharp(inPath)
      .rotate()
      .resize({ width: 320 }) // height auto
      .jpeg({ quality: 75, mozjpeg: true })
      .toFile(outPath);

    await uploadS3(thumbKey, outPath, "image/jpeg");

    await prisma.vlogCoverProcessingJob.update({
      where: { vlogId },
      data: { status: "DONE", lastError: null },
    });


  } catch (e: any) {
    console.error("[vlog-cover-worker] failed", { vlogId, err: String(e?.message ?? e) });
    await prisma.vlogCoverProcessingJob.update({
      where: { vlogId },
      data: { status: "FAILED", lastError: String(e?.message ?? e) },
    });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

export async function runVlogCoverWorkerLoop() {
  console.log("[vlog-cover-worker] loop started");
  for (;;) {
    try {
      const jobs = await claimJobs(2);
      if (!jobs.length) {
        await sleep(600);
        continue;
      }
      for (const j of jobs) {
        try {
          await processOne(j.vlogId);
        } catch (e) {
          console.warn("[vlog-cover-worker] job loop error", { vlogId: j.vlogId, err: e });
        }
      }
    } catch (e) {
      console.warn("[vlog-cover-worker] loop error", e);
      await sleep(2000);
    }
  }
}
