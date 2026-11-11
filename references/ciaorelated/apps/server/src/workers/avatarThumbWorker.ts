// apps/server/src/workers/avatarThumbWorker.ts
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
  return !!s && !isHttpUrl(s) && !s.startsWith("data:");
}

// ⚠️ MUSS zum Resolver passen:
// profiles/<id>/avatar-<uuid>.<ext> -> profiles/<id>/avatar-<uuid>-thumb.jpg
function deriveAvatarThumbKey(rawKey: string): string {
  return rawKey.replace(/\.(png|jpg|jpeg|webp)$/i, "-thumb.jpg");
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
      // Optional (nice, wenn du immutable Keys verwendest):
      // CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

async function claimAvatarJobs(limit = 2) {
  // stale PROCESSING -> back to PENDING (falls Worker crasht)
  await prisma.$executeRaw`
    UPDATE "AvatarProcessingJob" j
    SET status = 'PENDING', "updatedAt" = NOW()
    WHERE j.status = 'PROCESSING'
      AND j."updatedAt" < NOW() - INTERVAL '10 minutes';
  `;

  const rows = await prisma.$queryRaw<any[]>`
    WITH cte AS (
      SELECT j.id
      FROM "AvatarProcessingJob" j
      WHERE j.status = 'PENDING'
      ORDER BY j."createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "AvatarProcessingJob" j
    SET status='PROCESSING',
        attempts=attempts+1,
        "updatedAt"=NOW()
    FROM cte
    WHERE j.id = cte.id
    RETURNING j.id, j."profileId";
  `;

  return rows as Array<{ id: string; profileId: string }>;
}

async function processOne(profileId: string) {
  const prof = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { id: true, avatarUrl: true },
  });

  if (!prof) throw new Error("profile not found");

  const raw = prof.avatarUrl;

  // Wenn kein S3 Avatar gesetzt ist -> Job einfach erledigen
  if (!looksLikeS3Key(raw)) {
    await prisma.avatarProcessingJob.update({
      where: { profileId },
      data: { status: "DONE", lastError: null },
    });
    return;
  }

  const originalKey = raw!;
  const thumbKey = deriveAvatarThumbKey(originalKey);

  const tmpDir = fs.mkdtempSync(path.join(TMPROOT, "ava-"));
  const inPath = path.join(tmpDir, "in");
  const outPath = path.join(tmpDir, "thumb.jpg");

  try {
    await downloadS3(originalKey, inPath);

    // Thumb-Größe: 160x160 ist super für Listen/Comments/Story-Tray
    await sharp(inPath)
      .rotate()
      .resize(160, 160, { fit: "cover" })
      .jpeg({ quality: 72, mozjpeg: true })
      .toFile(outPath);

    await uploadS3(thumbKey, outPath, "image/jpeg");

    await prisma.avatarProcessingJob.update({
      where: { profileId },
      data: { status: "DONE", lastError: null },
    });


  } catch (e: any) {
    console.error("[avatar-worker] failed", { profileId, err: String(e?.message ?? e) });
    await prisma.avatarProcessingJob.update({
      where: { profileId },
      data: { status: "FAILED", lastError: String(e?.message ?? e) },
    });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

export async function runAvatarWorkerLoop() {
  console.log("[avatar-worker] loop started");
  for (;;) {
    try {
      const jobs = await claimAvatarJobs(2);
      if (!jobs.length) {
        await sleep(600);
        continue;
      }
      for (const j of jobs) {
        try {
          await processOne(j.profileId);
        } catch (e) {
          console.warn("[avatar-worker] job loop error", { profileId: j.profileId, err: e });
        }
      }
    } catch (e) {
      console.warn("[avatar-worker] loop error", e);
      await sleep(2000);
    }
  }
}
