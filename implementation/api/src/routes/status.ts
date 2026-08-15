import { logger } from '../logging';
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { getJobById } from '../services/job-service';
import { listTasksByJob } from '../services/task-service';

export const statusRouter = Router();

/**
 * GET /api/jobs/:jobId/status
 * REST fallback for status polling. Returns current job status with task summary.
 * Use this when WebSocket is unavailable or for one-off status checks.
 */
statusRouter.get('/jobs/:jobId/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = await getJobById(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    if (job.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const tasks = await listTasksByJob(job.job_id);

    const tasksSummary = {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      processing: tasks.filter((t) => t.status === 'processing').length,
    };

    const taskDetails = tasks.map((t) => ({
      taskId: t.task_id,
      fileId: t.file_id,
      destinationId: t.destination_id,
      status: t.status,
      retryCount: t.retry_count,
      updatedAt: t.updated_at,
    }));

    res.json({
      jobId: job.job_id,
      status: job.status,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      tasksSummary,
      tasks: taskDetails,
      _links: {
        websocket: `ws://${req.headers.host}/ws?userId=${req.user!.userId}`,
      },
    });
  } catch (err) {
    logger.error('Error getting job status', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to get job status' });
  }
});
