import { query } from '../db/pool';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Task {
  task_id: string;
  job_id: string;
  file_id: string;
  destination_id: string;
  status: TaskStatus;
  retry_count: number;
  checksum: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaskInput {
  jobId: string;
  fileId: string;
  destinationId: string;
  checksum?: string;
}

/**
 * Create a new task within a job.
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const rows = await query<Task>(
    `INSERT INTO tasks (job_id, file_id, destination_id, checksum)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.jobId, input.fileId, input.destinationId, input.checksum ?? null],
  );
  return rows[0];
}

/**
 * Create multiple tasks in a single batch insert.
 */
export async function createTasksBatch(tasks: CreateTaskInput[]): Promise<Task[]> {
  if (tasks.length === 0) return [];

  const values: any[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const task of tasks) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3})`);
    values.push(task.jobId, task.fileId, task.destinationId, task.checksum ?? null);
    idx += 4;
  }

  return query<Task>(
    `INSERT INTO tasks (job_id, file_id, destination_id, checksum)
     VALUES ${placeholders.join(', ')} RETURNING *`,
    values,
  );
}

/**
 * Get a single task by ID.
 */
export async function getTaskById(taskId: string): Promise<Task | null> {
  const rows = await query<Task>(
    `SELECT * FROM tasks WHERE task_id = $1`,
    [taskId],
  );
  return rows[0] ?? null;
}

/**
 * List all tasks for a job.
 */
export async function listTasksByJob(jobId: string): Promise<Task[]> {
  return query<Task>(
    `SELECT * FROM tasks WHERE job_id = $1 ORDER BY created_at ASC`,
    [jobId],
  );
}

/**
 * Update task status.
 */
export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task | null> {
  const rows = await query<Task>(
    `UPDATE tasks SET status = $1 WHERE task_id = $2 RETURNING *`,
    [status, taskId],
  );
  return rows[0] ?? null;
}

/**
 * Increment retry count for a task.
 */
export async function incrementRetryCount(taskId: string): Promise<Task | null> {
  const rows = await query<Task>(
    `UPDATE tasks SET retry_count = retry_count + 1 WHERE task_id = $1 RETURNING *`,
    [taskId],
  );
  return rows[0] ?? null;
}
