import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from '@aws-sdk/client-sqs';
import { TaskMessage } from '../types/queue-messages';
import { processTask, ProcessResult } from './task-processor';
import { WorkerConfig, defaultWorkerConfig, calculateBackoff } from './config';

const sqs = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.SQS_ENDPOINT && { endpoint: process.env.SQS_ENDPOINT }),
});

/**
 * Main worker polling loop.
 * Long-polls the Task Queue, processes messages, and manages lifecycle.
 */
export async function startWorker(config: WorkerConfig = defaultWorkerConfig): Promise<void> {
  console.log('Worker starting — polling Task Queue:', config.taskQueueUrl);
  console.log(`Config: maxRetries=${config.maxRetries}, maxMessages=${config.maxMessages}, waitTime=${config.waitTimeSeconds}s`);

  while (config.running) {
    try {
      await pollAndProcess(config);
    } catch (err) {
      console.error('Worker poll cycle error:', err);
      // Back off on unexpected errors to avoid tight loop
      await sleep(5000);
    }
  }

  console.log('Worker stopped gracefully.');
}

/**
 * Single poll cycle: receive messages, process each, handle results.
 */
export async function pollAndProcess(config: WorkerConfig): Promise<ProcessResult[]> {
  const receiveCommand = new ReceiveMessageCommand({
    QueueUrl: config.taskQueueUrl,
    MaxNumberOfMessages: config.maxMessages,
    WaitTimeSeconds: config.waitTimeSeconds,
    MessageAttributeNames: ['All'],
  });

  const response = await sqs.send(receiveCommand);
  const messages = response.Messages ?? [];

  if (messages.length === 0) {
    return [];
  }

  console.log(`Received ${messages.length} message(s) from queue`);

  const results: ProcessResult[] = [];

  for (const sqsMessage of messages) {
    if (!sqsMessage.Body || !sqsMessage.ReceiptHandle) {
      console.warn('Skipping malformed SQS message (no body or receipt handle)');
      continue;
    }

    let taskMessage: TaskMessage;
    try {
      taskMessage = JSON.parse(sqsMessage.Body) as TaskMessage;
      if (taskMessage.messageType !== 'PROCESS_TASK') {
        console.warn(`Skipping unexpected message type: ${taskMessage.messageType}`);
        // Delete non-task messages to avoid reprocessing
        await deleteMessage(config.taskQueueUrl, sqsMessage.ReceiptHandle);
        continue;
      }
    } catch (parseErr) {
      console.error('Failed to parse SQS message body:', parseErr);
      // Delete unparseable messages (they'll never succeed)
      await deleteMessage(config.taskQueueUrl, sqsMessage.ReceiptHandle);
      continue;
    }

    const result = await processTask(taskMessage, config);
    results.push(result);

    if (result.action === 'completed') {
      // Task done — remove from queue
      await deleteMessage(config.taskQueueUrl, sqsMessage.ReceiptHandle);
    } else if (result.action === 'failed') {
      // Permanently failed — remove from queue (it's in the DB as failed)
      await deleteMessage(config.taskQueueUrl, sqsMessage.ReceiptHandle);
    } else if (result.action === 'retrying') {
      // Extend visibility timeout for backoff delay
      const task = taskMessage;
      // retry_count was already incremented in processTask
      const backoffSeconds = Math.ceil(calculateBackoff(1, config) / 1000);
      await changeVisibility(config.taskQueueUrl, sqsMessage.ReceiptHandle, backoffSeconds);
    }
  }

  return results;
}

/**
 * Delete a message from the queue (acknowledges successful processing).
 */
async function deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
  try {
    await sqs.send(new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    }));
  } catch (err) {
    console.error('Failed to delete SQS message:', err);
  }
}

/**
 * Change message visibility timeout (for retry backoff).
 */
async function changeVisibility(queueUrl: string, receiptHandle: string, timeoutSeconds: number): Promise<void> {
  try {
    await sqs.send(new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: timeoutSeconds,
    }));
  } catch (err) {
    console.error('Failed to change message visibility:', err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Entry point when run directly ---
if (require.main === module) {
  // Graceful shutdown on SIGTERM/SIGINT
  const config = { ...defaultWorkerConfig };

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM — shutting down worker...');
    config.running = false;
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT — shutting down worker...');
    config.running = false;
  });

  startWorker(config).catch((err) => {
    console.error('Worker crashed:', err);
    process.exit(1);
  });
}
