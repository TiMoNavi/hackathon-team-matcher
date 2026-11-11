// apps/server/src/lib/s3.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BUCKET } from "./s3Client"; 
const {
  S3_BUCKET,
  S3_REGION,
  S3_ENDPOINT,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE,
  SIGNED_URL_TTL_SECONDS,
} = process.env;

export const s3 = new S3Client({
  region: S3_REGION!,
  endpoint: S3_ENDPOINT || undefined,
  forcePathStyle: S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID!,
    secretAccessKey: S3_SECRET_ACCESS_KEY!,
  },
});

// Längere Default-Gültigkeit (z. B. 15 Minuten). Per Argument übersteuerbar.
const DEFAULT_EXPIRES = Number(SIGNED_URL_TTL_SECONDS ?? 900);

type PutOpts = {
  expiresIn?: number;
  cacheControl?: string;
  contentDisposition?: string; // z.B. 'inline' oder 'attachment; filename="xyz.mp4"'
};

type PutObjectOpts = {
  cacheControl?: string;
  contentDisposition?: string;
};

export async function getSignedPutUrl(key: string, mime: string, opts: PutOpts = {}) {
  const cmd = new PutObjectCommand({
    Bucket: S3_BUCKET!,
    Key: key,
    ContentType: mime,
    CacheControl: opts.cacheControl,
    ContentDisposition: opts.contentDisposition,
  });
  return getSignedUrl(s3, cmd, { expiresIn: opts.expiresIn ?? DEFAULT_EXPIRES });
}

export async function ensureBrowserUploadCors() {
  if (!S3_BUCKET) return;

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: S3_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [
              "http://localhost:3000",
              "http://localhost:3001",
              "http://localhost:8081",
              "http://localhost:4173",
              "http://localhost:4174",
              "http://localhost:5173",
              "http://localhost:5174",
              "http://127.0.0.1:3000",
              "http://127.0.0.1:3001",
              "http://127.0.0.1:8081",
              "http://127.0.0.1:4173",
              "http://127.0.0.1:4174",
              "http://127.0.0.1:5173",
              "http://127.0.0.1:5174",
            ],
            AllowedMethods: ["GET", "HEAD", "PUT", "POST"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag", "Accept-Ranges", "Content-Range", "Content-Length"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    })
  );
}

export async function putObject(key: string, mime: string, body: Buffer, opts: PutObjectOpts = {}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET!,
      Key: key,
      Body: body,
      ContentType: mime,
      CacheControl: opts.cacheControl,
      ContentDisposition: opts.contentDisposition,
    })
  );
}

export async function getSignedGetUrl(key: string, expiresIn?: number) {
  const cmd = new GetObjectCommand({ Bucket: S3_BUCKET!, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: expiresIn ?? DEFAULT_EXPIRES });
}

// Optional nützlich, um nur Metadaten zu prüfen (Ablaufzeit separat setzbar)
export async function getSignedHeadUrl(key: string, expiresIn?: number) {
  const cmd = new HeadObjectCommand({ Bucket: S3_BUCKET!, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: expiresIn ?? DEFAULT_EXPIRES });
}

export async function deleteObject(key: string) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET!, Key: key }));
  } catch (err: any) {
    if (err?.name !== "NoSuchKey") throw err;
  }
}

export async function deleteObjects(keys: string[]) {
  if (keys.length === 0) return;

  const chunks = Array.from({ length: Math.ceil(keys.length / 1000) }, (_, i) =>
    keys.slice(i * 1000, (i + 1) * 1000)
  );

  for (const chunk of chunks) {
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: S3_BUCKET!,
        Delete: { Objects: chunk.map((Key) => ({ Key })) },
      })
    );

    if (res.Errors?.length) {
      const msgs = res.Errors.map((e) => `${e.Key}: ${e.Code} ${e.Message ?? ""}`).join("; ");
      console.warn("S3 deleteObjects: partial errors:", msgs);
    }
  }
}

// ---------- Chat-Helpers: öffentliche URL + Presign-Payload ----------

/** Öffentliche URL des Objekts – berücksichtigt AWS vs. Custom Endpoint + Path-Style */
export function buildPublicUrl(key: string): string {
  if (!S3_ENDPOINT) {
    // Reines AWS
    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${encodeURI(key)}`;
  }
  // Custom Endpoint (MinIO/Supabase o.ä.)
  const base = S3_ENDPOINT.replace(/\/+$/, "");
  if (S3_FORCE_PATH_STYLE === "true") {
    // https://endpoint/bucket/key
    return `${base}/${S3_BUCKET}/${encodeURI(key)}`;
  }
  // virtual-host-style: https://bucket.endpoint/key
  const host = base.replace(/^https?:\/\//, "");
  return `https://${S3_BUCKET}.${host}/${encodeURI(key)}`;
}

/**
 * Für Chat-Uploads: Presigned PUT + finale öffentliche URL + nötige Header.
 * Client kann damit direkt mit fetch()/axios hochladen.
 */
// server/s3.ts
export async function signPutForChat(key: string, mime: string) {
  const Bucket = process.env.S3_BUCKET!;
  const putCmd = new PutObjectCommand({ Bucket, Key: key, ContentType: mime });
  const getCmd = new GetObjectCommand({ Bucket, Key: key });

  const putUrl = await getSignedUrl(s3, putCmd, { expiresIn: 15 * 60 });
  const getUrl = await getSignedUrl(s3, getCmd, { expiresIn: 15 * 60 });

  return { putUrl, getUrl, key, mime };
}


export async function s3ObjectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (e: any) {
    // 404 / NotFound => existiert nicht
    const name = e?.name;
    const http = e?.$metadata?.httpStatusCode;

    if (name === "NotFound" || http === 404) return false;

    // bei Auth/Netzwerk lieber hochwerfen, damit du es merkst
    throw e;
  }
}
