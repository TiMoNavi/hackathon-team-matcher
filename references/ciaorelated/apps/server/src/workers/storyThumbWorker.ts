import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

import { prisma } from "../context";
import { s3 } from "../s3";

const BUCKET = process.env.S3_BUCKET!;
const TMPROOT = process.env.TMPDIR || os.tmpdir();

/* -------------------------------- utils -------------------------------- */

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
      // Optional:
      // CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

async function existsS3(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * profiles/<pid>/stories/<uuid>.jpg
 * -> profiles/<pid>/stories/<uuid>_thumb_viewer_720x1280.jpg
 * -> profiles/<pid>/stories/<uuid>_thumb_tray_512.jpg
 */
function deriveThumbKey(
  mediaKey: string,
  variant: "viewer_720x1280" | "tray_512"
): string {
  const m = mediaKey.match(/^(.*)\.(jpg|jpeg|png|webp|heic)$/i);
  const base = m ? m[1] : mediaKey;
  return `${base}_thumb_${variant}.jpg`;
}

/**
 * Entscheidung: StoryViewer ist fullscreen => 9:16.
 * Wir nehmen 720x1280 (klein genug, aber sehr sauber im UI).
 */
const VIEWER_W = 720;
const VIEWER_H = 1280;

/* ------------------------------ job logic ------------------------------- */

async function claimJobs(limit = 2) {
  // stale PROCESSING -> PENDING
  await prisma.$executeRaw`
    UPDATE "StoryProcessingJob"
    SET status = 'PENDING', "updatedAt" = NOW()
    WHERE status = 'PROCESSING'
      AND "updatedAt" < NOW() - INTERVAL '10 minutes'
  `;

  const rows = await prisma.$queryRaw<any[]>`
    WITH cte AS (
      SELECT id
      FROM "StoryProcessingJob"
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "StoryProcessingJob" j
    SET status = 'PROCESSING',
        attempts = attempts + 1,
        "updatedAt" = NOW()
    FROM cte
    WHERE j.id = cte.id
    RETURNING j.id, j."storyId"
  `;

  return rows as Array<{ id: string; storyId: string }>;
}

async function processOne(storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      mediaKey: true,
      thumbKey: true,
      mime: true,
      // editJson: true, // ✅ wenn du später editMeta anwenden willst
    },
  });

  // Story gelöscht → Job entfernen
  if (!story) {
    await prisma.storyProcessingJob
      .delete({ where: { storyId } })
      .catch(() => {});
    return;
  }

  // Kein Media-Key → nichts zu tun
  if (!story.mediaKey) {
    await prisma.storyProcessingJob.update({
      where: { storyId },
      data: { status: "DONE", lastError: null },
    });
    return;
  }

  // Nur Images (Videos hier bewusst skip)
  if (!story.mime?.startsWith("image/")) {
    await prisma.storyProcessingJob.update({
      where: { storyId },
      data: { status: "DONE", lastError: null },
    });
    return;
  }

  const mediaKey = story.mediaKey;

  // ✅ neue Keys
  const viewerThumbKey = deriveThumbKey(mediaKey, "viewer_720x1280");
  const trayThumbKey = deriveThumbKey(mediaKey, "tray_512");

  // ✅ Wenn Viewer-Thumb schon existiert: DB fix + optional tray sicherstellen
  if (await existsS3(viewerThumbKey)) {
    await prisma.$transaction(async (tx) => {
      // DB soll auf viewerThumbKey zeigen
      if (story.thumbKey !== viewerThumbKey) {
        await tx.story.update({
          where: { id: storyId },
          data: { thumbKey: viewerThumbKey },
        });
      }
      await tx.storyProcessingJob.update({
        where: { storyId },
        data: { status: "DONE", lastError: null },
      });
    });

    // trayThumb optional: nur wenn fehlt
    if (!(await existsS3(trayThumbKey))) {
      // best-effort: wir versuchen’s ohne Job fail
      try {
        const tmpDir = fs.mkdtempSync(path.join(TMPROOT, "story-"));
        const inPath = path.join(tmpDir, "in");
        const outTray = path.join(tmpDir, "tray.jpg");

        await downloadS3(mediaKey, inPath);

        await sharp(inPath)
          .rotate() // ✅ EXIF orientation (das ist das "ausgerichtet" was sharp automatisch kann)
          .resize(512, 512, { fit: "cover" })
          .jpeg({ quality: 72, mozjpeg: true })
          .toFile(outTray);

        await uploadS3(trayThumbKey, outTray, "image/jpeg");

        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }

    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(TMPROOT, "story-"));
  const inPath = path.join(tmpDir, "in");
  const outViewer = path.join(tmpDir, "viewer.jpg");
  const outTray = path.join(tmpDir, "tray.jpg");

  try {
    await downloadS3(mediaKey, inPath);

    /**
     * ✅ Viewer Thumb (9:16) – soll im StoryViewer exakt wie das Fullscreen-Cover wirken.
     * Das ist "gleiches Framing" im Sinne von: gleicher cover-crop auf 9:16.
     *
     * Hinweis: Das ist NICHT identisch zu "512x512 cover" – sondern passend zu deinem Viewer.
     */
    await sharp(inPath)
      .rotate() // ✅ EXIF orientation
      .resize(VIEWER_W, VIEWER_H, { fit: "cover" })
      .jpeg({ quality: 72, mozjpeg: true })
      .toFile(outViewer);

    await uploadS3(viewerThumbKey, outViewer, "image/jpeg");

    // optional tray thumb (für zB Grid/Tray etc.)
    if (!(await existsS3(trayThumbKey))) {
      await sharp(inPath)
        .rotate()
        .resize(512, 512, { fit: "cover" })
        .jpeg({ quality: 72, mozjpeg: true })
        .toFile(outTray);

      await uploadS3(trayThumbKey, outTray, "image/jpeg");
    }

    // ✅ DB: thumbKey zeigt auf viewerThumbKey (StoryViewer placeholder)
    await prisma.$transaction(async (tx) => {
      await tx.story.update({
        where: { id: storyId },
        data: { thumbKey: viewerThumbKey },
      });
      await tx.storyProcessingJob.update({
        where: { storyId },
        data: { status: "DONE", lastError: null },
      });
    });

    
  } catch (e: any) {
    console.error("[story-worker] failed", {
      storyId,
      err: String(e?.message ?? e),
    });

    await prisma.storyProcessingJob.update({
      where: { storyId },
      data: {
        status: "FAILED",
        lastError: String(e?.message ?? e),
      },
    });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

/* ------------------------------- runner -------------------------------- */

export async function runStoryWorkerLoop() {
  console.log("[story-worker] loop started");
  for (;;) {
    try {
      const jobs = await claimJobs(2);
      if (!jobs.length) {
        await sleep(600);
        continue;
      }
      for (const j of jobs) {
        try {
          await processOne(j.storyId);
        } catch (e) {
          console.warn("[story-worker] job loop error", { storyId: j.storyId, err: e });
        }
      }
    } catch (e) {
      console.warn("[story-worker] loop error", e);
      await sleep(2000);
    }
  }
}
