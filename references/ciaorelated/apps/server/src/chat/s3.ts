import { S3Client, PutObjectCommand,GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'


const BUCKET  = process.env.S3_BUCKET!;
const REGION  = process.env.S3_REGION || 'eu-north-1';
const ENDPOINT = process.env.S3_ENDPOINT || undefined;      // leer = AWS
const FORCE_PATH_STYLE = String(process.env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true';
const TTL = Number(process.env.SIGNED_URL_TTL_SECONDS || 900); // 15 min default

// Falls du *keinen* CloudFront hast, nehmen wir die Standard-HTTPS-Form für AWS:
function buildPublicGetUrl(key: string) {
  // virtual host style (bei AWS üblich): https://<bucket>.s3.<region>.amazonaws.com/<key>
  if (!ENDPOINT && !FORCE_PATH_STYLE) {
    return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURI(key)}`;
  }
  // path-style oder eigener Endpoint (MinIO etc.)
  const base = ENDPOINT?.replace(/\/+$/, '') || `https://s3.${REGION}.amazonaws.com`;
  if (FORCE_PATH_STYLE) {
    return `${base}/${BUCKET}/${encodeURI(key)}`;
  }
  // vhost mit custom endpoint
  const host = base.replace(/^https?:\/\//, '');
  return `https://${BUCKET}.${host}/${encodeURI(key)}`;
}

export const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT || undefined,
  forcePathStyle: FORCE_PATH_STYLE || false,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export async function signUpload(mime: string, filename?: string) {
  const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}-${filename ?? 'file'}`
  const command = new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, ContentType: mime })
  const putUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 5 })
  const url = `${process.env.S3_PUBLIC_BASE}/${key}`
  return { putUrl, url, headers: [{ key: 'Content-Type', value: mime }] }
}


// s3.ts
export async function signPutForChat(key: string, mime: string) {
  const Bucket = process.env.S3_BUCKET!;
  const putCmd = new PutObjectCommand({ Bucket, Key: key, ContentType: mime });
  const putUrl = await getSignedUrl(s3, putCmd, { expiresIn: 15 * 60 });

  const getCmd = new GetObjectCommand({ Bucket, Key: key });
  const getUrl = await getSignedUrl(s3, getCmd, { expiresIn: 15 * 60 });

  const publicUrl = `https://${Bucket}.s3.${process.env.S3_REGION}.amazonaws.com/${encodeURI(key)}`;
  return { putUrl, getUrl, publicUrl, key, mime };
}
