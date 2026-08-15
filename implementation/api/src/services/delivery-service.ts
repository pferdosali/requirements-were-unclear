import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { DestinationConfig } from './routing-service';

const BUCKET_NAME = process.env.BUCKET_NAME || 'docbridge-blob-local';
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB buffer limit

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }),
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  checksumValid?: boolean;
  bytesSent?: number;
}

/**
 * Download file from S3, verify checksum (if provided), and POST to destination.
 *
 * Strategy: Memory buffer (download full file, then send).
 * - Pro: Enables checksum verification before sending, simple retry logic
 * - Con: Limited to files ≤ 100MB (Fargate memory constraint)
 * - Future: Implement streaming for files > 100MB
 */
export async function deliverFile(
  objectKey: string,
  destination: DestinationConfig,
  expectedChecksum: string | null,
): Promise<DeliveryResult> {
  // 1. Download file from S3 into memory
  const fileBuffer = await downloadFromS3(objectKey);

  if (!fileBuffer) {
    return { success: false, error: 'File not found in S3' };
  }

  if (fileBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      error: `File too large for memory delivery (${fileBuffer.byteLength} bytes, max ${MAX_FILE_SIZE_BYTES})`,
    };
  }

  // 2. Verify checksum if provided
  if (expectedChecksum) {
    const actualChecksum = computeSha256(fileBuffer);
    if (actualChecksum !== expectedChecksum) {
      return {
        success: false,
        error: `Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`,
        checksumValid: false,
      };
    }
  }

  // 3. POST file to destination endpoint
  const result = await postToDestination(fileBuffer, objectKey, destination);
  return {
    ...result,
    checksumValid: expectedChecksum ? true : undefined,
    bytesSent: fileBuffer.byteLength,
  };
}

/**
 * Download an object from S3 into a Buffer.
 */
async function downloadFromS3(objectKey: string): Promise<Buffer | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
    });
    const response = await s3.send(command);

    if (!response.Body) {
      return null;
    }

    // Convert readable stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * POST file to the destination endpoint with appropriate auth headers.
 */
async function postToDestination(
  fileBuffer: Buffer,
  objectKey: string,
  destination: DestinationConfig,
): Promise<DeliveryResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Length': fileBuffer.byteLength.toString(),
    'X-DocBridge-Object-Key': objectKey,
    'X-DocBridge-Checksum': computeSha256(fileBuffer),
  };

  // Add auth headers based on destination config
  switch (destination.authType) {
    case 'bearer':
      if (destination.authToken) {
        headers['Authorization'] = `Bearer ${destination.authToken}`;
      }
      break;
    case 'api-key':
      if (destination.authToken) {
        headers['X-API-Key'] = destination.authToken;
      }
      break;
    case 'none':
      break;
  }

  try {
    const response = await fetch(destination.endpointUrl, {
      method: 'POST',
      headers,
      body: fileBuffer,
    });

    if (response.ok) {
      return { success: true, statusCode: response.status };
    }

    const errorBody = await response.text().catch(() => 'Unable to read response body');
    return {
      success: false,
      statusCode: response.status,
      error: `Destination returned ${response.status}: ${errorBody}`,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown network error';
    return { success: false, error: `Network error delivering to ${destination.endpointUrl}: ${error}` };
  }
}

/**
 * Compute SHA-256 checksum of a buffer, returned as hex string.
 */
function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// Export for testing
export { downloadFromS3, postToDestination, computeSha256 };
