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
      // optional, aber empfehlenswert für thumbs:
      // CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

// e.g. profiles/<pid>/posts/<uuid>.jpg -> profiles/<pid>/posts/<uuid>_thumb_512.jpg
function deriveThumbKey(originalKey: string) {
  const m = originalKey.match(/^(.*)\.(jpg|jpeg|png|webp|heic)$/i);
  if (!m) return `${originalKey}_thumb_512.jpg`;
  return `${m[1]}_thumb_512.jpg`;
}

async function claimImageJobs(limit = 2) {
  await prisma.$executeRaw`
    UPDATE "MediaProcessingJob" j
    SET status = 'PENDING', "updatedAt" = NOW()
    FROM "PostMedia" m
    WHERE j."mediaId" = m.id
      AND j.status = 'PROCESSING'
      AND m.kind = 'IMAGE'
      AND j."updatedAt" < NOW() - INTERVAL '10 minutes';
  `;

  const rows = await prisma.$queryRaw<any[]>`
    WITH cte AS (
      SELECT j.id
      FROM "MediaProcessingJob" j
      JOIN "PostMedia" m ON m.id = j."mediaId"
      WHERE j.status = 'PENDING'
        AND m.kind = 'IMAGE'
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
    RETURNING j.id, j."mediaId";
  `;
  return rows as Array<{ id: string; mediaId: string }>;
}

async function processOne(mediaId: string) {
  const media = await prisma.postMedia.findUnique({
    where: { id: mediaId },
    select: { id: true, postId: true, idx: true, kind: true, key: true, thumbKey: true },
  });

  if (!media) throw new Error("media not found");

  // only IMAGE and only if missing thumb
  if (media.kind !== "IMAGE") {
    await prisma.mediaProcessingJob.update({ where: { mediaId }, data: { status: "DONE", lastError: null } });
    return;
  }
  if (media.thumbKey) {
    await prisma.mediaProcessingJob.update({ where: { mediaId }, data: { status: "DONE", lastError: null } });
    return;
  }

  const originalKey = media.key;
  const thumbKey = deriveThumbKey(originalKey);

  const tmpDir = fs.mkdtempSync(path.join(TMPROOT, "img-"));
  const inPath = path.join(tmpDir, "in");
  const outPath = path.join(tmpDir, "thumb.jpg");

  try {
    await downloadS3(originalKey, inPath);

    // Explore: 3-spalten grid -> 512 cover ist perfekt
    await sharp(inPath)
      .rotate()
      .resize(512, 512, { fit: "cover" })
      .jpeg({ quality: 72, mozjpeg: true })
      .toFile(outPath);

    await uploadS3(thumbKey, outPath, "image/jpeg");

    await prisma.$transaction(async (tx) => {
      await tx.postMedia.update({
        where: { id: mediaId },
        data: { thumbKey, processStatus: "DONE" },
      });

      // optional: wenn idx=0 -> post.thumbKey setzen (dein Feed nutzt das oft)
      if (media.idx === 0) {
        await tx.post.update({ where: { id: media.postId }, data: { thumbKey } });
      }

      await tx.mediaProcessingJob.update({
        where: { mediaId },
        data: { status: "DONE", lastError: null },
      });
    });


  } catch (e: any) {
    console.error("[image-worker] failed", { mediaId, err: String(e?.message ?? e) });
    await prisma.mediaProcessingJob.update({
      where: { mediaId },
      data: { status: "FAILED", lastError: String(e?.message ?? e) },
    });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

export async function runImageWorkerLoop() {
  console.log("[image-worker] loop started");
  for (;;) {
    try {
      const jobs = await claimImageJobs(2);
      if (!jobs.length) {
        await sleep(600);
        continue;
      }
      for (const j of jobs) {
        try {
          await processOne(j.mediaId);
        } catch (e) {
          console.warn("[image-worker] job loop error", { mediaId: j.mediaId, err: e });
        }
      }
    } catch (e) {
      console.warn("[image-worker] loop error", e);
      await sleep(2000);
    }
  }
}
