import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const BUCKET_NAME = process.env.BUCKET_NAME || 'docbridge-blob-local';
const PRESIGN_EXPIRY = 900; // 15 minutes

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }),
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export interface UploadRequest {
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}

export interface PresignedUploadResponse {
  fileId: string;
  uploadUrl: string;
  expiresIn: number;
  objectKey: string;
}

/**
 * Generate a presigned PUT URL so the client can upload directly to S3.
 * This avoids proxying large files through the API service.
 */
export async function generatePresignedUpload(
  userId: string,
  req: UploadRequest,
): Promise<PresignedUploadResponse> {
  const fileId = uuidv4();
  const objectKey = `uploads/${userId}/${fileId}/${req.fileName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: objectKey,
    ContentType: req.contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: PRESIGN_EXPIRY,
    unhoistableHeaders: new Set(['content-type']),
  });

  return { fileId, uploadUrl, expiresIn: PRESIGN_EXPIRY, objectKey };
}

/**
 * Confirm that a file was uploaded successfully by checking S3 metadata.
 */
export async function confirmUpload(objectKey: string): Promise<{ exists: boolean; size?: number }> {
  try {
    const command = new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: objectKey });
    const response = await s3.send(command);
    return { exists: true, size: response.ContentLength };
  } catch {
    return { exists: false };
  }
}
