import { resolveDestination } from '../src/services/routing-service';
import { deliverFile } from '../src/services/delivery-service';

// Mock DynamoDB client
jest.mock('@aws-sdk/client-dynamodb', () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
    GetItemCommand: jest.fn().mockImplementation((input) => ({ input })),
    __mockSend: mockSend,
  };
});

// Mock S3 client
jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
    GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    __mockSend: mockSend,
  };
});

// Mock fetch for HTTP delivery
const mockFetch = jest.fn();
global.fetch = mockFetch;

const { __mockSend: mockDynamoSend } = jest.requireMock('@aws-sdk/client-dynamodb');
const { __mockSend: mockS3Send } = jest.requireMock('@aws-sdk/client-s3');

describe('Routing Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveDestination', () => {
    it('returns destination config when found', async () => {
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          destination_region: { S: 'region-a' },
          tenant_id: { S: 'team-a' },
          endpoint_url: { S: 'https://api.destination-a.com/upload' },
          auth_type: { S: 'bearer' },
          auth_token: { S: 'secret-token-123' },
          destination_name: { S: 'US Clinical Portal' },
        },
      });

      const result = await resolveDestination('region-a', 'team-a');

      expect(result).not.toBeNull();
      expect(result!.endpointUrl).toBe('https://api.destination-a.com/upload');
      expect(result!.authType).toBe('bearer');
      expect(result!.authToken).toBe('secret-token-123');
      expect(result!.destinationName).toBe('US Clinical Portal');
    });

    it('returns null when destination not found', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: undefined });

      const result = await resolveDestination('nonexistent-region', 'team-a');

      expect(result).toBeNull();
    });

    it('handles api-key auth type', async () => {
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          destination_region: { S: 'region-b' },
          tenant_id: { S: 'team-b' },
          endpoint_url: { S: 'https://api.destination-b.com/receive' },
          auth_type: { S: 'api-key' },
          auth_token: { S: 'api-key-xyz' },
          destination_name: { S: 'EU Clinical Portal' },
        },
      });

      const result = await resolveDestination('region-b', 'team-b');

      expect(result!.authType).toBe('api-key');
      expect(result!.authToken).toBe('api-key-xyz');
    });

    it('handles no-auth destinations', async () => {
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          destination_region: { S: 'region-c' },
          tenant_id: { S: 'team-c' },
          endpoint_url: { S: 'https://open.destination.com/upload' },
          auth_type: { S: 'none' },
          destination_name: { S: 'Public Endpoint' },
        },
      });

      const result = await resolveDestination('region-c', 'team-c');

      expect(result!.authType).toBe('none');
      expect(result!.authToken).toBeNull();
    });
  });
});

describe('Delivery Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockDestination = {
    endpointUrl: 'https://api.destination.com/upload',
    authType: 'bearer' as const,
    authToken: 'token-123',
    destinationName: 'Test Destination',
  };

  describe('deliverFile', () => {
    it('successfully delivers a file', async () => {
      // Mock S3 download
      const fileContent = Buffer.from('Hello, DocBridge!');
      mockS3Send.mockResolvedValueOnce({
        Body: (async function* () { yield fileContent; })(),
      });

      // Mock HTTP POST
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });

      const result = await deliverFile('uploads/user-1/file-1/doc.pdf', mockDestination, null);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.bytesSent).toBe(fileContent.byteLength);
    });

    it('returns error when file not found in S3', async () => {
      mockS3Send.mockRejectedValueOnce(
        Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } }),
      );

      const result = await deliverFile('uploads/nonexistent/file.pdf', mockDestination, null);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found in S3');
    });

    it('verifies checksum when provided', async () => {
      const fileContent = Buffer.from('test content');
      const { createHash } = require('crypto');
      const correctChecksum = createHash('sha256').update(fileContent).digest('hex');

      mockS3Send.mockResolvedValueOnce({
        Body: (async function* () { yield fileContent; })(),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });

      const result = await deliverFile('uploads/user-1/file-1/doc.pdf', mockDestination, correctChecksum);

      expect(result.success).toBe(true);
      expect(result.checksumValid).toBe(true);
    });

    it('fails on checksum mismatch', async () => {
      const fileContent = Buffer.from('test content');
      mockS3Send.mockResolvedValueOnce({
        Body: (async function* () { yield fileContent; })(),
      });

      const result = await deliverFile('uploads/user-1/file-1/doc.pdf', mockDestination, 'wrong-checksum');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Checksum mismatch');
      expect(result.checksumValid).toBe(false);
      // Should NOT have called fetch — checksum fail prevents delivery
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns error on destination HTTP failure', async () => {
      const fileContent = Buffer.from('test file');
      mockS3Send.mockResolvedValueOnce({
        Body: (async function* () { yield fileContent; })(),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service unavailable'),
      });

      const result = await deliverFile('uploads/user-1/file-1/doc.pdf', mockDestination, null);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error).toContain('503');
    });

    it('returns error on network failure', async () => {
      const fileContent = Buffer.from('test file');
      mockS3Send.mockResolvedValueOnce({
        Body: (async function* () { yield fileContent; })(),
      });

      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await deliverFile('uploads/user-1/file-1/doc.pdf', mockDestination, null);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('sends correct auth headers for bearer auth', async () => {
      const fileContent = Buffer.from('auth test');
      mockS3Send.mockResolvedValueOnce({
        Body: (async function* () { yield fileContent; })(),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });

      await deliverFile('uploads/user-1/file-1/doc.pdf', mockDestination, null);

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].headers['Authorization']).toBe('Bearer token-123');
    });

    it('sends correct auth headers for api-key auth', async () => {
      const fileContent = Buffer.from('apikey test');
      mockS3Send.mockResolvedValueOnce({
        Body: (async function* () { yield fileContent; })(),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });

      const apiKeyDest = { ...mockDestination, authType: 'api-key' as const, authToken: 'key-abc' };
      await deliverFile('uploads/user-1/file-1/doc.pdf', apiKeyDest, null);

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].headers['X-API-Key']).toBe('key-abc');
    });
  });
});
