import request from 'supertest';
import { app } from '../src/app';
import { getAccess } from '../src/services/access-control';

describe('Access control (ADR-0014)', () => {
  describe('getAccess', () => {
    it('grants upload to user-a (allow persona)', () => {
      const a = getAccess('user-a');
      expect(a.canUpload).toBe(true);
      expect(a.allowedRoutes).toContain('upload');
    });

    it('denies upload to user-b (deny persona)', () => {
      const b = getAccess('user-b');
      expect(b.canUpload).toBe(false);
      expect(b.allowedRoutes).not.toContain('upload');
    });

    it('matches by email when id is unknown', () => {
      const b = getAccess('some-sub-id', 'user-b@docbridge.local');
      expect(b.canUpload).toBe(false);
    });

    it('defaults unlisted users to upload-allowed (backward compatible)', () => {
      const d = getAccess('user-1');
      expect(d.canUpload).toBe(true);
    });
  });

  describe('/api/me exposes access', () => {
    it('returns the access entry for the authenticated user', async () => {
      const res = await request(app).get('/api/me').set('x-user-id', 'user-b');
      expect(res.status).toBe(200);
      expect(res.body.access).toBeDefined();
      expect(res.body.access.canUpload).toBe(false);
    });
  });

  describe('upload guard enforces deny server-side', () => {
    it('rejects presign for a deny-list user with 403', async () => {
      const res = await request(app)
        .post('/api/upload/presign')
        .set('x-user-id', 'user-b')
        .send({ fileName: 'x.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/denied/i);
    });

    it('allows presign for an allow-list user', async () => {
      const res = await request(app)
        .post('/api/upload/presign')
        .set('x-user-id', 'user-a')
        .send({ fileName: 'x.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 });
      expect(res.status).toBe(201);
    });
  });
});
