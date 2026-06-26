import request from 'supertest';
import { app } from '../src/app';

// Mock the S3 services since we don't have a real bucket in tests
jest.mock('../src/services/upload-service', () => ({
  generatePresignedUpload: jest.fn().mockResolvedValue({
    fileId: 'test-file-id',
    uploadUrl: 'https://s3.amazonaws.com/presigned-url',
    expiresIn: 900,
    objectKey: 'uploads/user-1/test-file-id/doc.pdf',
  }),
  confirmUpload: jest.fn().mockImplementation((objectKey: string) => {
    if (objectKey === 'uploads/user-1/test-file-id/doc.pdf') {
      return Promise.resolve({ exists: true, size: 1024 });
    }
    return Promise.resolve({ exists: false });
  }),
}));

describe('Upload API', () => {
  describe('POST /api/upload/presign', () => {
    it('returns presigned URL for valid request', async () => {
      const res = await request(app)
        .post('/api/upload/presign')
        .set('x-user-id', 'user-1')
        .send({ fileName: 'doc.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 });

      expect(res.status).toBe(201);
      expect(res.body.fileId).toBe('test-file-id');
      expect(res.body.uploadUrl).toContain('https://');
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.objectKey).toContain('user-1');
    });

    it('returns 400 when fileName is missing', async () => {
      const res = await request(app)
        .post('/api/upload/presign')
        .set('x-user-id', 'user-1')
        .send({ contentType: 'application/pdf', fileSizeBytes: 1024 });

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await request(app)
        .post('/api/upload/presign')
        .send({ fileName: 'doc.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/upload/confirm', () => {
    it('confirms existing upload', async () => {
      const res = await request(app)
        .post('/api/upload/confirm')
        .set('x-user-id', 'user-1')
        .send({ objectKey: 'uploads/user-1/test-file-id/doc.pdf' });

      expect(res.status).toBe(200);
      expect(res.body.confirmed).toBe(true);
      expect(res.body.size).toBe(1024);
    });

    it('returns 404 for non-existent file', async () => {
      const res = await request(app)
        .post('/api/upload/confirm')
        .set('x-user-id', 'user-1')
        .send({ objectKey: 'uploads/user-1/nonexistent/file.pdf' });

      expect(res.status).toBe(404);
    });

    it('returns 400 when objectKey is missing', async () => {
      const res = await request(app)
        .post('/api/upload/confirm')
        .set('x-user-id', 'user-1')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
