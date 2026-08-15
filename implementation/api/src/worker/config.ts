/**
 * Worker configuration.
 * Centralizes retry policy, polling settings, and backoff parameters.
 */

export interface WorkerConfig {
  /** SQS Task Queue URL */
  taskQueueUrl: string;
  /** Maximum number of messages to receive per poll (1-10) */
  maxMessages: number;
  /** Long-poll wait time in seconds (0-20) */
  waitTimeSeconds: number;
  /** Maximum retries before marking a task as failed */
  maxRetries: number;
  /** Base delay for exponential backoff in milliseconds */
  backoffBaseMs: number;
  /** Maximum backoff delay in milliseconds */
  backoffMaxMs: number;
  /** Whether the worker should keep polling (set false for graceful shutdown) */
  running: boolean;
}

export const defaultWorkerConfig: WorkerConfig = {
  taskQueueUrl: process.env.TASK_QUEUE_URL || 'http://localhost:4566/000000000000/docbridge-task-queue',
  maxMessages: 5,
  waitTimeSeconds: 20,
  maxRetries: 3,
  backoffBaseMs: 1000,
  backoffMaxMs: 30000,
  running: true,
};

/**
 * Calculate exponential backoff delay with jitter.
 * Formula: min(base * 2^attempt + jitter, max)
 */
export function calculateBackoff(attempt: number, config: Pick<WorkerConfig, 'backoffBaseMs' | 'backoffMaxMs'>): number {
  const exponentialDelay = config.backoffBaseMs * Math.pow(2, attempt);
  const jitter = Math.random() * config.backoffBaseMs;
  return Math.min(exponentialDelay + jitter, config.backoffMaxMs);
}
