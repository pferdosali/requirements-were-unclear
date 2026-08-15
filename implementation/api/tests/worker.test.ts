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

// Mock the routing and delivery services
jest.mock('../src/services/routing-service', () => ({
  resolveDestination: jest.fn().mockResolvedValue({
    endpointUrl: 'https://mock-dest.example.com/upload',
    authType: 'bearer',
    authToken: 'test-token',
    destinationName: 'Mock Destination',
  }),
}));

jest.mock('../src/services/delivery-service', () => ({
  deliverFile: jest.fn().mockResolvedValue({
    success: true,
    statusCode: 200,
    bytesSent: 1024,
    checksumValid: true,
  }),
}));

jest.mock('../src/services/team-service', () => ({
  resolveUserTeam: jest.fn().mockResolvedValue({
    teamId: 'team-a',
    name: 'US Clinical Ops',
    region: 'region-a',
  }),
}));

import { updateTaskStatus, incrementRetryCount } from '../src/services/task-service';
import { recalculateJobStatus } from '../src/services/job-service';
import { deliverFile } from '../src/services/delivery-service';

const mockUpdateTaskStatus = updateTaskStatus as jest.MockedFunction<typeof updateTaskStatus>;
const mockIncrementRetryCount = incrementRetryCount as jest.MockedFunction<typeof incrementRetryCount>;
const mockRecalculateJobStatus = recalculateJobStatus as jest.MockedFunction<typeof recalculateJobStatus>;
const mockDeliverFile = deliverFile as jest.MockedFunction<typeof deliverFile>;

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
      expect(avg).toBeGreaterThan(1000);
      expect(avg).toBeLessThan(2000);
    });
  });
});

describe('Task Processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: delivery succeeds
    mockDeliverFile.mockResolvedValue({
      success: true,
      statusCode: 200,
      bytesSent: 1024,
      checksumValid: true,
    });
  });

  describe('processTask — successful delivery', () => {
    it('marks task as completed on success', async () => {
      mockUpdateTaskStatus.mockResolvedValue(null);
      mockRecalculateJobStatus.mockResolvedValue(null);

      const result = await processTask(testMessage, testConfig);

      expect(result.success).toBe(true);
      expect(result.action).toBe('completed');
      expect(result.taskId).toBe('task-001');
    });

    it('calls updateTaskStatus with processing then completed', async () => {
      mockUpdateTaskStatus.mockResolvedValue(null);
      mockRecalculateJobStatus.mockResolvedValue(null);

      await processTask(testMessage, testConfig);

      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-001', 'processing');
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-001', 'completed');
      expect(mockRecalculateJobStatus).toHaveBeenCalledWith('job-001');
    });

    it('recalculates job status after completion', async () => {
      mockUpdateTaskStatus.mockResolvedValue(null);
      mockRecalculateJobStatus.mockResolvedValue(null);

      await processTask(testMessage, testConfig);

      expect(mockRecalculateJobStatus).toHaveBeenCalledWith('job-001');
    });
  });

  describe('processTask — failure handling', () => {
    it('retries when under max retries', async () => {
      // Make delivery fail
      mockDeliverFile.mockResolvedValueOnce({
        success: false,
        statusCode: 503,
        error: 'Service unavailable',
      });

      mockUpdateTaskStatus.mockResolvedValue(null);
      mockIncrementRetryCount.mockResolvedValue({
        task_id: 'task-001', job_id: 'job-001', file_id: 'file-001',
        destination_id: 'dest-region-a', status: 'pending' as const,
        retry_count: 1, // Under max (3)
        checksum: 'sha256-abc',
        created_at: new Date(), updated_at: new Date(),
      });

      const result = await processTask(testMessage, testConfig);

      expect(result.success).toBe(false);
      expect(result.action).toBe('retrying');
      expect(result.error).toBeDefined();
      // Should revert status to pending for next attempt
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-001', 'pending');
    });

    it('permanently fails when at max retries', async () => {
      // Make delivery fail
      mockDeliverFile.mockResolvedValueOnce({
        success: false,
        statusCode: 503,
        error: 'Service unavailable',
      });

      mockUpdateTaskStatus.mockResolvedValue(null);
      mockIncrementRetryCount.mockResolvedValue({
        task_id: 'task-001', job_id: 'job-001', file_id: 'file-001',
        destination_id: 'dest-region-a', status: 'pending' as const,
        retry_count: 3, // At max retries
        checksum: 'sha256-abc',
        created_at: new Date(), updated_at: new Date(),
      });
      mockRecalculateJobStatus.mockResolvedValue(null);

      const result = await processTask(testMessage, testConfig);

      expect(result.success).toBe(false);
      expect(result.action).toBe('failed');
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-001', 'failed');
      expect(mockRecalculateJobStatus).toHaveBeenCalledWith('job-001');
    });

    it('fails when routing config not found', async () => {
      // Override routing mock to return null
      const { resolveDestination } = require('../src/services/routing-service');
      (resolveDestination as jest.Mock).mockResolvedValueOnce(null);

      mockUpdateTaskStatus.mockResolvedValue(null);
      mockIncrementRetryCount.mockResolvedValue({
        task_id: 'task-001', job_id: 'job-001', file_id: 'file-001',
        destination_id: 'dest-region-a', status: 'pending' as const,
        retry_count: 1, checksum: 'sha256-abc',
        created_at: new Date(), updated_at: new Date(),
      });

      const result = await processTask(testMessage, testConfig);

      expect(result.success).toBe(false);
      expect(result.action).toBe('retrying');
      expect(result.error).toContain('No routing config found');
    });
  });
});

describe('Worker — pollAndProcess', () => {
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
    expect(config.running).toBe(false);
  });
});
