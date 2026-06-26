import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { resolveUserTeam } from '../services/team-service';
import { generatePresignedUpload, confirmUpload, UploadRequest } from '../services/upload-service';

export const uploadRouter = Router();

uploadRouter.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const team = await resolveUserTeam(user.userId);
  res.json({ user, team });
});

/**
 * POST /api/upload/presign
 * Request a presigned S3 URL for direct file upload.
 * Body: { fileName, contentType, fileSizeBytes }
 */
uploadRouter.post('/upload/presign', async (req: AuthenticatedRequest, res: Response) => {
  const { fileName, contentType, fileSizeBytes } = req.body as UploadRequest;

  if (!fileName || !contentType || !fileSizeBytes) {
    res.status(400).json({ error: 'fileName, contentType, and fileSizeBytes are required' });
    return;
  }

  const result = await generatePresignedUpload(req.user!.userId, { fileName, contentType, fileSizeBytes });
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
