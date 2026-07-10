import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { createJob, getJobById, listJobsByUser } from '../services/job-service';
import { createTask, createTasksBatch, listTasksByJob, getTaskById } from '../services/task-service';

export const jobsRouter = Router();

/**
 * POST /api/jobs
 * Create a new upload job. Optionally include tasks in the same request.
 * Body: { tasks?: [{ fileId, destinationId, checksum? }] }
 */
jobsRouter.post('/jobs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { tasks } = req.body as { tasks?: Array<{ fileId: string; destinationId: string; checksum?: string }> };

    const job = await createJob({ userId });

    let createdTasks: any[] = [];
    if (tasks && tasks.length > 0) {
      const taskInputs = tasks.map((t) => ({
        jobId: job.job_id,
        fileId: t.fileId,
        destinationId: t.destinationId,
        checksum: t.checksum,
      }));
      createdTasks = await createTasksBatch(taskInputs);
    }

    res.status(201).json({ job, tasks: createdTasks });
  } catch (err) {
    console.error('Error creating job:', err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

/**
 * GET /api/jobs
 * List all jobs for the authenticated user.
 */
jobsRouter.get('/jobs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const jobs = await listJobsByUser(userId);
    res.json({ jobs });
  } catch (err) {
    console.error('Error listing jobs:', err);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

/**
 * GET /api/jobs/:jobId
 * Get a single job by ID (only if owned by the authenticated user).
 */
jobsRouter.get('/jobs/:jobId', async (req: AuthenticatedRequest, res: Response) => {
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
    res.json({ job });
  } catch (err) {
    console.error('Error getting job:', err);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

/**
 * GET /api/jobs/:jobId/tasks
 * List all tasks for a job (only if the job is owned by the authenticated user).
 */
jobsRouter.get('/jobs/:jobId/tasks', async (req: AuthenticatedRequest, res: Response) => {
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
    const tasks = await listTasksByJob(req.params.jobId);
    res.json({ tasks });
  } catch (err) {
    console.error('Error listing tasks:', err);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

/**
 * POST /api/jobs/:jobId/tasks
 * Add tasks to an existing job.
 * Body: { tasks: [{ fileId, destinationId, checksum? }] }
 */
jobsRouter.post('/jobs/:jobId/tasks', async (req: AuthenticatedRequest, res: Response) => {
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

    const { tasks } = req.body as { tasks: Array<{ fileId: string; destinationId: string; checksum?: string }> };
    if (!tasks || tasks.length === 0) {
      res.status(400).json({ error: 'At least one task is required' });
      return;
    }

    const taskInputs = tasks.map((t) => ({
      jobId: job.job_id,
      fileId: t.fileId,
      destinationId: t.destinationId,
      checksum: t.checksum,
    }));
    const createdTasks = await createTasksBatch(taskInputs);
    res.status(201).json({ tasks: createdTasks });
  } catch (err) {
    console.error('Error creating tasks:', err);
    res.status(500).json({ error: 'Failed to create tasks' });
  }
});

/**
 * GET /api/tasks/:taskId
 * Get a single task by ID.
 */
jobsRouter.get('/tasks/:taskId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const task = await getTaskById(req.params.taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    // Verify ownership via the parent job
    const job = await getJobById(task.job_id);
    if (!job || job.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    res.json({ task });
  } catch (err) {
    console.error('Error getting task:', err);
    res.status(500).json({ error: 'Failed to get task' });
  }
});
