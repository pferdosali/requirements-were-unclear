import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { TaskMessage, JobSubmittedMessage } from '../types/queue-messages';

const TASK_QUEUE_URL = process.env.TASK_QUEUE_URL || 'http://localhost:4566/000000000000/docbridge-task-queue';
const JOB_QUEUE_URL = process.env.JOB_QUEUE_URL || 'http://localhost:4566/000000000000/docbridge-job-queue';

const sqs = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.SQS_ENDPOINT && { endpoint: process.env.SQS_ENDPOINT }),
});

/**
 * Publish individual task messages to the Task Queue.
 * Uses batch send for efficiency (SQS supports up to 10 messages per batch).
 */
export async function publishTaskMessages(messages: TaskMessage[]): Promise<void> {
  // SQS batch limit is 10 messages
  const batches = chunk(messages, 10);

  for (const batch of batches) {
    const command = new SendMessageBatchCommand({
      QueueUrl: TASK_QUEUE_URL,
      Entries: batch.map((msg, idx) => ({
        Id: `${msg.taskId}-${idx}`,
        MessageBody: JSON.stringify(msg),
        MessageGroupId: msg.jobId, // Group by job for FIFO ordering (if FIFO queue)
      })),
    });

    const result = await sqs.send(command);

    if (result.Failed && result.Failed.length > 0) {
      const failedIds = result.Failed.map((f) => f.Id).join(', ');
      throw new Error(`Failed to publish task messages: ${failedIds}`);
    }
  }
}

/**
 * Publish a job-level notification to the Job Queue.
 * Used for audit/tracking — signals that a job has been submitted for processing.
 */
export async function publishJobSubmitted(message: JobSubmittedMessage): Promise<void> {
  const command = new SendMessageCommand({
    QueueUrl: JOB_QUEUE_URL,
    MessageBody: JSON.stringify(message),
  });

  await sqs.send(command);
}

/**
 * Split an array into chunks of a given size.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
