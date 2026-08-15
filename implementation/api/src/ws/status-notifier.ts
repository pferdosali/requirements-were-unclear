import { connectionManager } from './connection-manager';

/**
 * Status event types pushed to connected clients.
 */
export interface TaskStatusEvent {
  type: 'task_status';
  jobId: string;
  taskId: string;
  status: 'processing' | 'completed' | 'failed' | 'retrying';
  retryCount?: number;
  error?: string;
  timestamp: string;
}

export interface JobStatusEvent {
  type: 'job_status';
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'partial_success' | 'failed';
  tasksSummary: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    processing: number;
  };
  timestamp: string;
}

export type StatusEvent = TaskStatusEvent | JobStatusEvent;

/**
 * Push a task status update to the owning user.
 * Returns the number of clients that received the message.
 */
export function notifyTaskStatus(
  userId: string,
  event: Omit<TaskStatusEvent, 'type' | 'timestamp'>,
): number {
  const message: TaskStatusEvent = {
    type: 'task_status',
    ...event,
    timestamp: new Date().toISOString(),
  };

  return connectionManager.sendToUser(userId, message);
}

/**
 * Push a job status update to the owning user.
 * Returns the number of clients that received the message.
 */
export function notifyJobStatus(
  userId: string,
  event: Omit<JobStatusEvent, 'type' | 'timestamp'>,
): number {
  const message: JobStatusEvent = {
    type: 'job_status',
    ...event,
    timestamp: new Date().toISOString(),
  };

  return connectionManager.sendToUser(userId, message);
}

/**
 * Check if a user is currently connected via WebSocket.
 * Useful for deciding whether to bother computing status summaries.
 */
export function isUserListening(userId: string): boolean {
  return connectionManager.isUserConnected(userId);
}
