/**
 * Upload API: presign → S3 PUT (with XHR progress) → confirm
 */
import { api } from './client';

export interface PresignResponse {
  fileId: string;
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
}

export interface ConfirmResponse {
  confirmed: boolean;
  size: number;
}

/**
 * Get a presigned S3 URL for uploading a file.
 */
export async function presignUpload(file: File): Promise<PresignResponse> {
  return api.post<PresignResponse>('/upload/presign', {
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    fileSizeBytes: file.size,
  });
}

/**
 * Upload file directly to S3 via presigned URL.
 * Uses XHR for progress tracking (fetch doesn't support upload progress).
 */
export function uploadToS3(
  file: File,
  uploadUrl: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`S3 upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during S3 upload'));
    xhr.ontimeout = () => reject(new Error('S3 upload timed out'));

    xhr.send(file);
  });
}

/**
 * Confirm that an uploaded file exists in S3.
 */
export async function confirmUpload(objectKey: string): Promise<ConfirmResponse> {
  return api.post<ConfirmResponse>('/upload/confirm', { objectKey });
}

/**
 * Full upload flow for a single file: presign → upload → confirm.
 * Returns the fileId and objectKey on success.
 */
export async function uploadFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ fileId: string; objectKey: string }> {
  // Step 1: Get presigned URL
  const presign = await presignUpload(file);

  // Step 2: Upload to S3
  await uploadToS3(file, presign.uploadUrl, onProgress);

  // Step 3: Confirm
  await confirmUpload(presign.objectKey);

  return { fileId: presign.fileId, objectKey: presign.objectKey };
}
