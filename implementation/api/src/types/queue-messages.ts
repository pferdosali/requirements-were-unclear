/**
 * Message types for SQS queue communication.
 * These define the contract between the API (producer) and Worker (consumer).
 */

export interface TaskMessage {
  messageType: 'PROCESS_TASK';
  taskId: string;
  jobId: string;
  fileId: string;
  destinationId: string;
  userId: string;
  checksum: string | null;
  submittedAt: string; // ISO 8601
}

export interface JobSubmittedMessage {
  messageType: 'JOB_SUBMITTED';
  jobId: string;
  userId: string;
  taskCount: number;
  submittedAt: string; // ISO 8601
}

export type QueueMessage = TaskMessage | JobSubmittedMessage;
