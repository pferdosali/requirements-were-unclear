import { TaskMessage } from '../types/queue-messages';
import { updateTaskStatus, incrementRetryCount, getTaskById } from '../services/task-service';
import { recalculateJobStatus } from '../services/job-service';
import { WorkerConfig, calculateBackoff } from './config';

export interface ProcessResult {
  success: boolean;
  taskId: string;
  action: 'completed' | 'retrying' | 'failed';
  error?: string;
}

/**
 * Process a single task message from the queue.
 *
 * Flow:
 * 1. Mark task as 'processing'
 * 2. Attempt delivery to destination (simulated for now)
 * 3. On success: mark 'completed', recalculate job status
 * 4. On failure: increment retry count, check max retries
 *    - Under max: leave for retry (message returns to queue via visibility timeout)
 *    - At max: mark 'failed', recalculate job status
 */
export async function processTask(message: TaskMessage, config: WorkerConfig): Promise<ProcessResult> {
  const { taskId, jobId } = message;

  // Mark task as processing
  await updateTaskStatus(taskId, 'processing');

  try {
    // Attempt destination delivery
    await deliverToDestination(message);

    // Success — mark completed and recalculate job
    await updateTaskStatus(taskId, 'completed');
    await recalculateJobStatus(jobId);

    return { success: true, taskId, action: 'completed' };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return await handleTaskFailure(taskId, jobId, config, error);
  }
}

/**
 * Handle a failed task processing attempt.
 * Increments retry count and decides whether to retry or permanently fail.
 */
async function handleTaskFailure(
  taskId: string,
  jobId: string,
  config: WorkerConfig,
  error: string,
): Promise<ProcessResult> {
  const task = await incrementRetryCount(taskId);

  if (!task) {
    return { success: false, taskId, action: 'failed', error: 'Task not found after increment' };
  }

  if (task.retry_count >= config.maxRetries) {
    // Max retries exhausted — permanently fail
    await updateTaskStatus(taskId, 'failed');
    await recalculateJobStatus(jobId);
    console.error(`Task ${taskId} permanently failed after ${task.retry_count} retries: ${error}`);
    return { success: false, taskId, action: 'failed', error };
  }

  // Will be retried — revert status to pending for next attempt
  await updateTaskStatus(taskId, 'pending');
  const backoff = calculateBackoff(task.retry_count, config);
  console.warn(`Task ${taskId} failed (attempt ${task.retry_count}/${config.maxRetries}), retrying in ${Math.round(backoff)}ms: ${error}`);

  return { success: false, taskId, action: 'retrying', error };
}

/**
 * Deliver file to the target destination.
 *
 * Currently simulated — in production this would:
 * 1. Download file from S3 using message.fileId
 * 2. Look up destination config from DynamoDB routing table
 * 3. POST/PUT file to destination API endpoint
 * 4. Verify delivery with checksum if provided
 *
 * For now: simulates a network call with random failure for testing.
 */
async function deliverToDestination(message: TaskMessage): Promise<void> {
  // Simulate network latency (50-200ms)
  const latency = 50 + Math.random() * 150;
  await new Promise((resolve) => setTimeout(resolve, latency));

  // Simulate ~10% failure rate for testing retry logic
  if (Math.random() < 0.1) {
    throw new Error(`Destination ${message.destinationId} temporarily unavailable`);
  }

  console.log(`Task ${message.taskId} delivered to ${message.destinationId}`);
}

/**
 * Exportable delivery function for dependency injection in tests.
 * In production, replace the simulated deliverToDestination with a real implementation.
 */
export { deliverToDestination };
