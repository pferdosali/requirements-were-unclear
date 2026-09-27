import { Router, Response } from 'express';
import { AuthenticatedRequest, requireUploadAccess } from '../middleware/auth';
import { resolveUserTeam } from '../services/team-service';
import { generatePresignedUpload, confirmUpload, UploadRequest } from '../services/upload-service';

export const uploadRouter = Router();

uploadRouter.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const team = await resolveUserTeam(user.userId);
  // Expose the resolved access so the SPA can gate navigation/upload (ADR-0014).
  res.json({ user: { userId: user.userId, email: user.email }, team, access: user.access });
});

/**
 * POST /api/upload/presign
 * Request a presigned S3 URL for direct file upload. Requires upload access.
 * Body: { fileName, contentType, fileSizeBytes }
 */
uploadRouter.post('/upload/presign', requireUploadAccess, async (req: AuthenticatedRequest, res: Response) => {
  const { fileName, contentType, fileSizeBytes } = req.body as UploadRequest;

  if (!fileName || !fileSizeBytes) {
    res.status(400).json({ error: 'fileName and fileSizeBytes are required' });
    return;
  }

  const result = await generatePresignedUpload(req.user!.userId, {
    fileName,
    contentType: contentType || 'application/octet-stream',
    fileSizeBytes,
  });
  res.status(201).json(result);
});

/**
 * POST /api/upload/confirm
 * Confirm that a file upload completed successfully.
 * Body: { objectKey }
 */
uploadRouter.post('/upload/confirm', async (req: AuthenticatedRequest, res: Response) => {
  const { objectKey } = req.body as { objectKey: string };

  if (!objectKey) {
    res.status(400).json({ error: 'objectKey is required' });
    return;
  }

  const result = await confirmUpload(objectKey);
  if (!result.exists) {
    res.status(404).json({ error: 'File not found in storage' });
    return;
  }

  res.json({ confirmed: true, size: result.size });
});
