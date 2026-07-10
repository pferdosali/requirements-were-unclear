import { query } from '../db/pool';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'partial_success' | 'failed';

export interface Job {
  job_id: string;
  user_id: string;
  status: JobStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CreateJobInput {
  userId: string;
}

/**
 * Create a new job for a user.
 */
export async function createJob(input: CreateJobInput): Promise<Job> {
  const rows = await query<Job>(
    `INSERT INTO jobs (user_id) VALUES ($1) RETURNING *`,
    [input.userId],
  );
  return rows[0];
}

/**
 * Get a single job by ID.
 */
export async function getJobById(jobId: string): Promise<Job | null> {
  const rows = await query<Job>(
    `SELECT * FROM jobs WHERE job_id = $1`,
    [jobId],
  );
  return rows[0] ?? null;
}

/**
 * List all jobs for a user, ordered by most recent first.
 */
export async function listJobsByUser(userId: string): Promise<Job[]> {
  return query<Job>(
    `SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
}

/**
 * Update job status. Recalculates based on task statuses when appropriate.
 */
export async function updateJobStatus(jobId: string, status: JobStatus): Promise<Job | null> {
  const rows = await query<Job>(
    `UPDATE jobs SET status = $1 WHERE job_id = $2 RETURNING *`,
    [status, jobId],
  );
  return rows[0] ?? null;
}

/**
 * Recalculate job status from its tasks.
 * - All tasks completed → completed
 * - Any task failed + any completed → partial_success
 * - All tasks failed → failed
 * - Any task processing → processing
 * - Otherwise → pending
 */
export async function recalculateJobStatus(jobId: string): Promise<Job | null> {
  const statusCounts = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text as count FROM tasks WHERE job_id = $1 GROUP BY status`,
    [jobId],
  );

  if (statusCounts.length === 0) return getJobById(jobId);

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of statusCounts) {
    counts[row.status] = parseInt(row.count, 10);
    total += counts[row.status];
  }

  let newStatus: JobStatus;
  if (counts['completed'] === total) {
    newStatus = 'completed';
  } else if ((counts['failed'] ?? 0) > 0 && (counts['completed'] ?? 0) > 0) {
    newStatus = 'partial_success';
  } else if (counts['failed'] === total) {
    newStatus = 'failed';
  } else if ((counts['processing'] ?? 0) > 0) {
    newStatus = 'processing';
  } else {
    newStatus = 'pending';
  }

  return updateJobStatus(jobId, newStatus);
}
