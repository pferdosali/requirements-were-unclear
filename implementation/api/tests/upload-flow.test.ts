import request from 'supertest';
import { app } from '../src/app';

// Mock the S3 services since we don't have a real bucket in tests
jest.mock('../src/services/upload-service', () => ({
  generatePresignedUpload: jest.fn().mockResolvedValue({
    fileId: 'test-file-id',
    uploadUrl: 'https://s3.amazonaws.com/presigned-url',
    objectKey: 'uploads/user-1/test-file-id/report.pdf',
    expiresIn: 900,
  }),
  confirmUpload: jest.fn().mockImplementation((objectKey: string) => {
    if (objectKey === 'uploads/user-1/test-file-id/report.pdf') {
      return Promise.resolve({ exists: true, size: 2048 });
    }
    return Promise.resolve({ exists: false });
  }),
}));

describe('Upload Flow API', () => {
  describe('POST /api/upload/presign', () => {
    it('returns fileId, uploadUrl, objectKey, expiresIn', async () => {
      const res = await request(app)
        .post('/api/upload/presign')
        .set('x-user-id', 'user-1')
        .send({ fileName: 'report.pdf', contentType: 'application/pdf', fileSizeBytes: 2048 });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('fileId');
      expect(res.body).toHaveProperty('uploadUrl');
      expect(res.body).toHaveProperty('objectKey');
      expect(res.body).toHaveProperty('expiresIn');
      expect(res.body.fileId).toBe('test-file-id');
      expect(res.body.uploadUrl).toContain('https://');
      expect(res.body.objectKey).toContain('user-1');
      expect(typeof res.body.expiresIn).toBe('number');
    });

    it('validates required field: fileName', async () => {
      const res = await request(app)
        .post('/api/upload/presign')
        .set('x-user-id', 'user-1')
        .send({ contentType: 'application/pdf', fileSizeBytes: 2048 });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('validates required field: fileSizeBytes', async () => {
      const res = await request(app)
        .post('/api/upload/presign')
        .set('x-user-id', 'user-1')
        .send({ fileName: 'report.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 401 without x-user-id header', async () => {
      const res = await request(app)
        .post('/api/upload/presign')
        .send({ fileName: 'report.pdf', contentType: 'application/pdf', fileSizeBytes: 2048 });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/upload/confirm', () => {
    it('returns confirmed:true for existing file', async () => {
      const res = await request(app)
        .post('/api/upload/confirm')
        .set('x-user-id', 'user-1')
        .send({ objectKey: 'uploads/user-1/test-file-id/report.pdf' });

      expect(res.status).toBe(200);
      expect(res.body.confirmed).toBe(true);
    });

    it('returns error for missing file', async () => {
      const res = await request(app)
        .post('/api/upload/confirm')
        .set('x-user-id', 'user-1')
        .send({ objectKey: 'uploads/user-1/nonexistent/file.pdf' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 when objectKey is missing', async () => {
      const res = await request(app)
        .post('/api/upload/confirm')
        .set('x-user-id', 'user-1')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });
});
