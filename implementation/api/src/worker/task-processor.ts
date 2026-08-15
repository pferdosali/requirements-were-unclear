import { TaskMessage } from '../types/queue-messages';
import { updateTaskStatus, incrementRetryCount, getTaskById } from '../services/task-service';
import { recalculateJobStatus } from '../services/job-service';
import { resolveDestination } from '../services/routing-service';
import { deliverFile } from '../services/delivery-service';
import { resolveUserTeam } from '../services/team-service';
import { notifyTaskStatus, notifyJobStatus, isUserListening } from '../ws/status-notifier';
import { listTasksByJob } from '../services/task-service';
import { getJobById } from '../services/job-service';
import { logger, auditLog, createChildLogger } from '../logging';
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

    // Push real-time status to connected client
    await pushStatusUpdate(message.userId, jobId, taskId, 'completed');

    return { success: true, taskId, action: 'completed' };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return await handleTaskFailure(message.userId, taskId, jobId, config, error);
  }
}

/**
 * Handle a failed task processing attempt.
 * Increments retry count and decides whether to retry or permanently fail.
 */
async function handleTaskFailure(
  userId: string,
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

    // Push failure notification
    await pushStatusUpdate(userId, jobId, taskId, 'failed', error);

    auditLog("TASK_FAILED", { taskId, jobId, retryCount: task.retry_count, error });
    return { success: false, taskId, action: 'failed', error };
  }

  // Will be retried — revert status to pending for next attempt
  await updateTaskStatus(taskId, 'pending');
  const backoff = calculateBackoff(task.retry_count, config);

  // Push retry notification
  notifyTaskStatus(userId, {
    jobId,
    taskId,
    status: 'retrying',
    retryCount: task.retry_count,
    error,
  });

  logger.warn("Task retrying", { taskId, jobId, attempt: task.retry_count, maxRetries: config.maxRetries, backoffMs: Math.round(backoff), error });

  return { success: false, taskId, action: 'retrying', error };
}

/**
 * Deliver file to the target destination.
 *
 * 1. Resolve user's tenant from team service
 * 2. Look up destination config from DynamoDB routing table
 * 3. Download file from S3 and POST to destination endpoint
 * 4. Verify checksum if provided
 */
async function deliverToDestination(message: TaskMessage): Promise<void> {
  // Resolve tenant for routing lookup
  const team = await resolveUserTeam(message.userId);
  const tenantId = team.teamId;

  // Look up destination endpoint config
  const destination = await resolveDestination(message.destinationId, tenantId);
  if (!destination) {
    throw new Error(
      `No routing config found for destination=${message.destinationId}, tenant=${tenantId}`,
    );
  }

  // Build the S3 object key from the fileId
  // Object key pattern: uploads/{userId}/{fileId}/{fileName}
  // Since we only have fileId in the message, we need to construct the path
  const objectKey = message.fileId;

  // Deliver file to destination
  const result = await deliverFile(objectKey, destination, message.checksum);

  if (!result.success) {
    throw new Error(result.error || `Delivery failed with status ${result.statusCode}`);
  }

  auditLog('TASK_DELIVERED', {
    taskId: message.taskId,
    jobId: message.jobId,
    destinationName: destination.destinationName,
    bytesSent: result.bytesSent,
    checksumValid: result.checksumValid ?? 'not verified',
  });
}

// Export processTask for testing
export { deliverToDestination };

/**
 * Push real-time status updates to the connected user via WebSocket.
 * Sends both task-level and job-level status events.
 * Silently skips if user is not connected — status is still in DB.
 */
async function pushStatusUpdate(
  userId: string,
  jobId: string,
  taskId: string,
  status: 'completed' | 'failed',
  error?: string,
): Promise<void> {
  try {
    if (!isUserListening(userId)) return;

    // Push task status
    notifyTaskStatus(userId, { jobId, taskId, status, error });

    // Fetch updated job to push job-level summary
    const job = await getJobById(jobId);
    if (!job) return;

    const tasks = await listTasksByJob(jobId);
    const summary = {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      processing: tasks.filter((t) => t.status === 'processing').length,
    };

    notifyJobStatus(userId, {
      jobId,
      status: job.status,
      tasksSummary: summary,
    });
  } catch (err) {
    // Never let notification failure break the processing pipeline
    logger.warn("Failed to push status notification", { error: (err as Error).message });
  }
}
