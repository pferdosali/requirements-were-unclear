/**
 * Mock Destination Lambda
 *
 * Simulates an external document receiver endpoint.
 * Accepts file uploads via POST, logs metadata to CloudWatch,
 * and COPIES the file to the S3 destination folder structure.
 *
 * S3 destination path: destinations/{region}/{objectKey filename}
 *
 * Environment variables:
 * - DESTINATION_REGION: e.g., "region-a"
 * - DESTINATION_NAME: e.g., "US Clinical Ops"
 * - DESTINATION_BUCKET: S3 bucket to copy files to
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET || '';
const DESTINATION_REGION = process.env.DESTINATION_REGION || 'unknown';
const DESTINATION_NAME = process.env.DESTINATION_NAME || 'unknown';

// Map region IDs to folder paths
const REGION_PATHS: Record<string, string> = {
  'region-a': 'us-east/team-alpha',
  'region-b': 'eu-west/team-beta',
  'region-c': 'ap-southeast/team-gamma',
};

interface DeliveryMetadata {
  timestamp: string;
  objectKey: string | null;
  checksum: string | null;
  contentLength: number;
  contentType: string | null;
  authPresent: boolean;
  authType: string | null;
  sourceIp: string | null;
  userAgent: string | null;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = event.headers ?? {};
  const bodyLength = event.body ? Buffer.byteLength(event.body, event.isBase64Encoded ? 'base64' : 'utf-8') : 0;

  // Extract metadata from request
  const metadata: DeliveryMetadata = {
    timestamp: new Date().toISOString(),
    objectKey: headers['x-docbridge-object-key'] || headers['X-DocBridge-Object-Key'] || null,
    checksum: headers['x-docbridge-checksum'] || headers['X-DocBridge-Checksum'] || null,
    contentLength: bodyLength,
    contentType: headers['content-type'] || headers['Content-Type'] || null,
    authPresent: !!(headers['authorization'] || headers['Authorization'] || headers['x-api-key'] || headers['X-API-Key']),
    authType: headers['authorization'] || headers['Authorization']
      ? 'bearer'
      : headers['x-api-key'] || headers['X-API-Key']
        ? 'api-key'
        : null,
    sourceIp: event.requestContext?.identity?.sourceIp || null,
    userAgent: headers['user-agent'] || headers['User-Agent'] || null,
  };

  // Log to CloudWatch — structured JSON for easy querying
  console.log(JSON.stringify({
    event: 'DOCUMENT_RECEIVED',
    destinationRegion: DESTINATION_REGION,
    destinationName: DESTINATION_NAME,
    ...metadata,
  }));

  // Simulate occasional failures for testing retry logic (controlled via query param)
  const simulateFailure = event.queryStringParameters?.['simulate_failure'];
  if (simulateFailure === 'true') {
    console.log(JSON.stringify({
      event: 'SIMULATED_FAILURE',
      objectKey: metadata.objectKey,
    }));
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Service temporarily unavailable (simulated)',
        retryAfter: 5,
      }),
    };
  }

  // Save file to S3 destination folder
  let s3Saved = false;
  let s3Key = '';
  if (DESTINATION_BUCKET && event.body) {
    try {
      const regionPath = REGION_PATHS[DESTINATION_REGION] || DESTINATION_REGION;
      const fileName = metadata.objectKey
        ? metadata.objectKey.split('/').pop() || 'unnamed'
        : `file-${Date.now()}`;

      s3Key = `destinations/${regionPath}/delivered/${fileName}`;

      const fileBuffer = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : Buffer.from(event.body, 'utf-8');

      await s3.send(new PutObjectCommand({
        Bucket: DESTINATION_BUCKET,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: metadata.contentType || 'application/octet-stream',
        Metadata: {
          'source-object-key': metadata.objectKey || '',
          'checksum': metadata.checksum || '',
          'delivered-at': metadata.timestamp,
          'destination-region': DESTINATION_REGION,
        },
      }));

      s3Saved = true;
      console.log(JSON.stringify({
        event: 'FILE_SAVED_TO_S3',
        bucket: DESTINATION_BUCKET,
        key: s3Key,
        bytes: fileBuffer.byteLength,
      }));
    } catch (err: any) {
      console.error(JSON.stringify({
        event: 'S3_SAVE_ERROR',
        error: err.message,
        bucket: DESTINATION_BUCKET,
        key: s3Key,
      }));
      // Don't fail the delivery — the file was received successfully
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      received: true,
      objectKey: metadata.objectKey,
      bytesReceived: metadata.contentLength,
      checksum: metadata.checksum,
      timestamp: metadata.timestamp,
      s3Destination: s3Saved ? { bucket: DESTINATION_BUCKET, key: s3Key } : null,
    }),
  };
}
