import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const {
  S3_BUCKET,
  S3_REGION,
  S3_ENDPOINT,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE,
  SIGNED_URL_TTL_SECONDS = "120",
} = process.env;

export const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT || undefined,
  forcePathStyle: S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID!,
    secretAccessKey: S3_SECRET_ACCESS_KEY!,
  },
});

export async function getSignedPutUrl(key: string, mime: string) {
  const cmd = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: mime,
    // Server-Side-Encryption falls gewünscht:
    // ServerSideEncryption: "AES256",
  });
  return getSignedUrl(s3, cmd, { expiresIn: Number(SIGNED_URL_TTL_SECONDS) });
}

export async function getSignedGetUrl(key: string) {
  const cmd = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, cmd, { expiresIn: Number(SIGNED_URL_TTL_SECONDS) });
}
