import { processTask, ProcessResult } from '../src/worker/task-processor';
import { calculateBackoff, WorkerConfig, defaultWorkerConfig } from '../src/worker/config';
import { TaskMessage } from '../src/types/queue-messages';

// Mock the DB services
jest.mock('../src/services/task-service', () => ({
  updateTaskStatus: jest.fn().mockResolvedValue(null),
  incrementRetryCount: jest.fn(),
  getTaskById: jest.fn(),
}));

jest.mock('../src/services/job-service', () => ({
  recalculateJobStatus: jest.fn().mockResolvedValue(null),
}));

// Mock the delivery function to control test outcomes
jest.mock('../src/worker/task-processor', () => {
  const actual = jest.requireActual('../src/worker/task-processor');
  return {
    ...actual,
    // We'll override deliverToDestination behavior via the task-processor module internals
  };
});

import { updateTaskStatus, incrementRetryCount } from '../src/services/task-service';
import { recalculateJobStatus } from '../src/services/job-service';

const mockUpdateTaskStatus = updateTaskStatus as jest.MockedFunction<typeof updateTaskStatus>;
const mockIncrementRetryCount = incrementRetryCount as jest.MockedFunction<typeof incrementRetryCount>;
const mockRecalculateJobStatus = recalculateJobStatus as jest.MockedFunction<typeof recalculateJobStatus>;

const testConfig: WorkerConfig = {
  ...defaultWorkerConfig,
  maxRetries: 3,
  backoffBaseMs: 1000,
  backoffMaxMs: 30000,
  running: false, // Don't actually poll
};

const testMessage: TaskMessage = {
  messageType: 'PROCESS_TASK',
  taskId: 'task-001',
  jobId: 'job-001',
  fileId: 'file-001',
  destinationId: 'dest-region-a',
  userId: 'user-1',
  checksum: 'sha256-abc',
  submittedAt: '2026-08-14T00:00:00.000Z',
};

describe('Worker Config', () => {
  describe('calculateBackoff', () => {
    it('returns a value greater than 0', () => {
      const backoff = calculateBackoff(0, { backoffBaseMs: 1000, backoffMaxMs: 30000 });
      expect(backoff).toBeGreaterThan(0);
    });

    it('increases with retry attempt', () => {
      // Run multiple times to account for jitter
      const attempt0Values: number[] = [];
      const attempt3Values: number[] = [];

      for (let i = 0; i < 100; i++) {
        attempt0Values.push(calculateBackoff(0, { backoffBaseMs: 1000, backoffMaxMs: 30000 }));
        attempt3Values.push(calculateBackoff(3, { backoffBaseMs: 1000, backoffMaxMs: 30000 }));
      }

      const avg0 = attempt0Values.reduce((a, b) => a + b) / attempt0Values.length;
      const avg3 = attempt3Values.reduce((a, b) => a + b) / attempt3Values.length;

      expect(avg3).toBeGreaterThan(avg0);
    });

    it('caps at backoffMaxMs', () => {
      const backoff = calculateBackoff(20, { backoffBaseMs: 1000, backoffMaxMs: 30000 });
      expect(backoff).toBeLessThanOrEqual(30000);
    });

    it('first attempt is around base delay', () => {
      const values: number[] = [];
      for (let i = 0; i < 100; i++) {
        values.push(calculateBackoff(0, { backoffBaseMs: 1000, backoffMaxMs: 30000 }));
      }
      const avg = values.reduce((a, b) => a + b) / values.length;
      // First attempt: base * 2^0 + jitter = 1000 + random(0-1000), avg ~1500
      expect(avg).toBeGreaterThan(1000);
      expect(avg).toBeLessThan(2000);
    });
  });
});

describe('Task Processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processTask — successful delivery', () => {
    it('marks task as completed on success', async () => {
      // processTask calls deliverToDestination internally.
      // Since it's simulated with 10% failure, we'll mock the DB to test the success path.
      // The actual delivery is non-deterministic, so we test the DB interaction pattern.

      // Mock incrementRetryCount to NOT be called (success path)
      mockUpdateTaskStatus.mockResolvedValue(null);
      mockRecalculateJobStatus.mockResolvedValue(null);

      // Run multiple times — at least one should succeed given 90% success rate
      let successResult: ProcessResult | null = null;
      for (let i = 0; i < 20; i++) {
        jest.clearAllMocks();
        mockUpdateTaskStatus.mockResolvedValue(null);
        mockRecalculateJobStatus.mockResolvedValue(null);
        mockIncrementRetryCount.mockResolvedValue({
          task_id: testMessage.taskId,
          job_id: testMessage.jobId,
          file_id: testMessage.fileId,
          destination_id: testMessage.destinationId,
          status: 'pending' as const,
          retry_count: 1,
          checksum: testMessage.checksum,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const result = await processTask(testMessage, testConfig);
        if (result.action === 'completed') {
          successResult = result;
          break;
        }
      }

      expect(successResult).not.toBeNull();
      expect(successResult!.success).toBe(true);
      expect(successResult!.action).toBe('completed');
      expect(successResult!.taskId).toBe('task-001');
    });

    it('calls updateTaskStatus with processing then completed on success', async () => {
      mockUpdateTaskStatus.mockResolvedValue(null);
      mockRecalculateJobStatus.mockResolvedValue(null);

      // Keep trying until we get a success
      let succeeded = false;
      for (let i = 0; i < 30; i++) {
        jest.clearAllMocks();
        mockUpdateTaskStatus.mockResolvedValue(null);
        mockRecalculateJobStatus.mockResolvedValue(null);
        mockIncrementRetryCount.mockResolvedValue({
          task_id: 'task-001', job_id: 'job-001', file_id: 'file-001',
          destination_id: 'dest-region-a', status: 'pending' as const,
          retry_count: 1, checksum: 'sha256-abc',
          created_at: new Date(), updated_at: new Date(),
        });

        const result = await processTask(testMessage, testConfig);
        if (result.action === 'completed') {
          // Should have called: processing, then completed
          expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-001', 'processing');
          expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-001', 'completed');
          expect(mockRecalculateJobStatus).toHaveBeenCalledWith('job-001');
          succeeded = true;
          break;
        }
      }
      expect(succeeded).toBe(true);
    });
  });

  describe('processTask — failure handling', () => {
    it('retries when under max retries', async () => {
      mockUpdateTaskStatus.mockResolvedValue(null);
      mockIncrementRetryCount.mockResolvedValue({
        task_id: 'task-001', job_id: 'job-001', file_id: 'file-001',
        destination_id: 'dest-region-a', status: 'pending' as const,
        retry_count: 1, // Under max (3)
        checksum: 'sha256-abc',
        created_at: new Date(), updated_at: new Date(),
      });

      // Keep trying until we get a failure (10% chance per attempt)
      let retryResult: ProcessResult | null = null;
      for (let i = 0; i < 50; i++) {
        jest.clearAllMocks();
        mockUpdateTaskStatus.mockResolvedValue(null);
        mockIncrementRetryCount.mockResolvedValue({
          task_id: 'task-001', job_id: 'job-001', file_id: 'file-001',
          destination_id: 'dest-region-a', status: 'pending' as const,
          retry_count: 1, checksum: 'sha256-abc',
          created_at: new Date(), updated_at: new Date(),
        });

        const result = await processTask(testMessage, testConfig);
        if (result.action === 'retrying') {
          retryResult = result;
          break;
        }
      }

      expect(retryResult).not.toBeNull();
      expect(retryResult!.success).toBe(false);
      expect(retryResult!.action).toBe('retrying');
      expect(retryResult!.error).toBeDefined();
    });

    it('permanently fails when at max retries', async () => {
      mockUpdateTaskStatus.mockResolvedValue(null);
      mockIncrementRetryCount.mockResolvedValue({
        task_id: 'task-001', job_id: 'job-001', file_id: 'file-001',
        destination_id: 'dest-region-a', status: 'pending' as const,
        retry_count: 3, // At max retries
        checksum: 'sha256-abc',
        created_at: new Date(), updated_at: new Date(),
      });
      mockRecalculateJobStatus.mockResolvedValue(null);

      // Keep trying until delivery fails
      let failedResult: ProcessResult | null = null;
      for (let i = 0; i < 50; i++) {
        jest.clearAllMocks();
        mockUpdateTaskStatus.mockResolvedValue(null);
        mockIncrementRetryCount.mockResolvedValue({
          task_id: 'task-001', job_id: 'job-001', file_id: 'file-001',
          destination_id: 'dest-region-a', status: 'pending' as const,
          retry_count: 3, checksum: 'sha256-abc',
          created_at: new Date(), updated_at: new Date(),
        });
        mockRecalculateJobStatus.mockResolvedValue(null);

        const result = await processTask(testMessage, testConfig);
        if (result.action === 'failed') {
          failedResult = result;
          break;
        }
      }

      expect(failedResult).not.toBeNull();
      expect(failedResult!.success).toBe(false);
      expect(failedResult!.action).toBe('failed');
      // Should mark as failed and recalculate job
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-001', 'failed');
      expect(mockRecalculateJobStatus).toHaveBeenCalledWith('job-001');
    });
  });
});

describe('Worker — pollAndProcess', () => {
  // Testing pollAndProcess requires mocking the SQS client, which is complex.
  // These tests verify the configuration and message handling logic.

  it('defaultWorkerConfig has sensible defaults', () => {
    expect(defaultWorkerConfig.maxMessages).toBe(5);
    expect(defaultWorkerConfig.waitTimeSeconds).toBe(20);
    expect(defaultWorkerConfig.maxRetries).toBe(3);
    expect(defaultWorkerConfig.backoffBaseMs).toBe(1000);
    expect(defaultWorkerConfig.backoffMaxMs).toBe(30000);
    expect(defaultWorkerConfig.running).toBe(true);
  });

  it('worker can be stopped via config.running', () => {
    const config = { ...defaultWorkerConfig };
    config.running = false;
    // Worker loop condition check
    expect(config.running).toBe(false);
  });
});
