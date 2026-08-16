/**
 * Mock Destination Lambda
 *
 * Simulates an external document receiver endpoint.
 * Accepts file uploads via POST, logs metadata to CloudWatch, and returns 200.
 *
 * This gives visibility into what the worker sends — useful for:
 * - Verifying delivery payloads
 * - Checking auth headers
 * - Monitoring file sizes and checksums
 * - End-to-end integration testing
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

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
    destinationRegion: process.env.DESTINATION_REGION || 'unknown',
    destinationName: process.env.DESTINATION_NAME || 'unknown',
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

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      received: true,
      objectKey: metadata.objectKey,
      bytesReceived: metadata.contentLength,
      checksum: metadata.checksum,
      timestamp: metadata.timestamp,
    }),
  };
}
