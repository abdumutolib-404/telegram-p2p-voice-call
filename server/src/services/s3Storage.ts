import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { Readable } from 'node:stream';

let s3ClientInstance: S3Client | null = null;

export function isS3Configured(): boolean {
  return Boolean(env.S3_KEY && env.S3_SECRET && env.S3_BUCKET);
}

export function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    if (!isS3Configured()) {
      throw new Error('S3 credentials are not configured in environment.');
    }

    const endpoint = env.S3_ENDPOINT?.replace(/\/+$/, '') || undefined;
    const region = env.S3_REGION || (endpoint?.includes('r2.cloudflarestorage.com') ? 'auto' : 'us-east-1');

    s3ClientInstance = new S3Client({
      region,
      credentials: {
        accessKeyId: env.S3_KEY!,
        secretAccessKey: env.S3_SECRET!,
      },
      endpoint,
      forcePathStyle: env.S3_FORCE_PATH_STYLE ?? false,
    });
  }
  return s3ClientInstance;
}

/**
 * Generates a secure, short-lived presigned URL for downloading/streaming an audio recording.
 */
export async function generatePresignedDownloadUrl(
  storageKey: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: storageKey,
    ResponseContentType: 'audio/mpeg',
  });
  return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Checks whether an object exists in S3/R2 and returns metadata.
 */
export async function checkS3ObjectExists(
  storageKey: string
): Promise<{ exists: boolean; size?: number; contentType?: string }> {
  try {
    const client = getS3Client();
    const command = new HeadObjectCommand({
      Bucket: env.S3_BUCKET!,
      Key: storageKey,
    });
    const res = await client.send(command);
    return {
      exists: true,
      size: res.ContentLength,
      contentType: res.ContentType,
    };
  } catch (err: any) {
    const httpStatus = err.$metadata?.httpStatusCode || err.statusCode || err.$response?.statusCode;
    const errorName = err.name || err.code || 'UnknownError';
    
    // Normal 404 / NotFound conditions when file is still encoding or missing
    if (
      errorName === 'NotFound' ||
      errorName === 'NoSuchKey' ||
      httpStatus === 404 ||
      err.message?.includes('NotFound') ||
      err.message?.includes('404')
    ) {
      return { exists: false };
    }

    let diagnosis = 'General S3/R2 error';
    if (errorName === 'InvalidAccessKeyId') {
      diagnosis = 'R2/S3 Access Key ID does not exist or is invalid';
    } else if (errorName === 'SignatureDoesNotMatch') {
      diagnosis = 'R2/S3 Secret Access Key is incorrect';
    } else if (errorName === 'AccessDenied' || httpStatus === 403) {
      diagnosis = 'R2/S3 API Token lacks Read/Write permission on the bucket';
    } else if (errorName === 'NoSuchBucket') {
      diagnosis = 'R2/S3 Bucket does not exist';
    }

    console.warn('[S3Storage] check_exists_failed:', {
      errorName,
      message: err.message,
      statusCode: httpStatus,
      diagnosis,
      key: storageKey,
    });
    return { exists: false };
  }
}

/**
 * Downloads the S3 object into a memory buffer for direct Telegram audio sending.
 */
export async function getS3ObjectBuffer(
  storageKey: string
): Promise<{ buffer: Buffer; contentType: string; size: number }> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: storageKey,
  });
  const res = await client.send(command);

  if (!res.Body) {
    throw new Error(`S3 object body empty for key: ${storageKey}`);
  }

  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  return {
    buffer,
    contentType: res.ContentType || 'audio/mpeg',
    size: res.ContentLength || buffer.length,
  };
}

/**
 * Deletes an expired recording from S3.
 */
export async function deleteS3Object(storageKey: string): Promise<void> {
  try {
    const client = getS3Client();
    const command = new DeleteObjectCommand({
      Bucket: env.S3_BUCKET!,
      Key: storageKey,
    });
    await client.send(command);
    console.log('[S3Storage] RECORDING_OBJECT_DELETED', { key: storageKey });
  } catch (err: any) {
    console.warn('[S3Storage] delete_failed:', err.message || err);
  }
}
