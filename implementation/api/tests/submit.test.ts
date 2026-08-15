import request from 'supertest';
import { app } from '../src/app';

// Mock the db/pool module
jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
  closePool: jest.fn(),
  pool: { on: jest.fn(), end: jest.fn() },
}));

// Mock the queue service
jest.mock('../src/services/queue-service', () => ({
  publishTaskMessages: jest.fn().mockResolvedValue(undefined),
  publishJobSubmitted: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../src/db/pool';
import { publishTaskMessages, publishJobSubmitted } from '../src/services/queue-service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockPublishTaskMessages = publishTaskMessages as jest.MockedFunction<typeof publishTaskMessages>;
const mockPublishJobSubmitted = publishJobSubmitted as jest.MockedFunction<typeof publishJobSubmitted>;

describe('POST /api/jobs/:jobId/submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockJob = {
    job_id: 'job-submit-1',
    user_id: 'user-1',
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockTasks = [
    {
      task_id: 'task-1',
      job_id: 'job-submit-1',
      file_id: 'file-1',
      destination_id: 'dest-a',
      status: 'pending',
      retry_count: 0,
      checksum: 'sha256-abc',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      task_id: 'task-2',
      job_id: 'job-submit-1',
      file_id: 'file-2',
      destination_id: 'dest-b',
      status: 'pending',
      retry_count: 0,
      checksum: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  it('returns 401 without auth header', async () => {
    const res = await request(app).post('/api/jobs/job-submit-1/submit');
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent job', async () => {
    mockQuery.mockResolvedValueOnce([]); // getJobById returns nothing

    const res = await request(app)
      .post('/api/jobs/nonexistent/submit')
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Job not found');
  });

  it('returns 403 when job belongs to another user', async () => {
    mockQuery.mockResolvedValueOnce([{ ...mockJob, user_id: 'user-2' }]);

    const res = await request(app)
      .post('/api/jobs/job-submit-1/submit')
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Access denied');
  });

  it('returns 409 when job is not in pending status', async () => {
    mockQuery.mockResolvedValueOnce([{ ...mockJob, status: 'processing' }]);

    const res = await request(app)
      .post('/api/jobs/job-submit-1/submit')
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('cannot be submitted');
    expect(res.body.error).toContain('processing');
  });

  it('returns 409 for already completed job', async () => {
    mockQuery.mockResolvedValueOnce([{ ...mockJob, status: 'completed' }]);

    const res = await request(app)
      .post('/api/jobs/job-submit-1/submit')
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('completed');
  });

  it('returns 400 when job has no tasks', async () => {
    mockQuery
      .mockResolvedValueOnce([mockJob])  // getJobById
      .mockResolvedValueOnce([]);         // listTasksByJob returns empty

    const res = await request(app)
      .post('/api/jobs/job-submit-1/submit')
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Job has no tasks to process');
  });

  it('submits a job successfully', async () => {
    const updatedJob = { ...mockJob, status: 'processing' };

    mockQuery
      .mockResolvedValueOnce([mockJob])     // getJobById
      .mockResolvedValueOnce(mockTasks)     // listTasksByJob
      .mockResolvedValueOnce([updatedJob]); // updateJobStatus

    const res = await request(app)
      .post('/api/jobs/job-submit-1/submit')
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.job.status).toBe('processing');
    expect(res.body.submitted.taskCount).toBe(2);
    expect(res.body.submitted.submittedAt).toBeDefined();
  });

  it('publishes correct task messages to SQS', async () => {
    const updatedJob = { ...mockJob, status: 'processing' };

    mockQuery
      .mockResolvedValueOnce([mockJob])
      .mockResolvedValueOnce(mockTasks)
      .mockResolvedValueOnce([updatedJob]);

    await request(app)
      .post('/api/jobs/job-submit-1/submit')
      .set('x-user-id', 'user-1');

    expect(mockPublishTaskMessages).toHaveBeenCalledTimes(1);
    const taskMessages = mockPublishTaskMessages.mock.calls[0][0];

    expect(taskMessages).toHaveLength(2);
    expect(taskMessages[0]).toMatchObject({
      messageType: 'PROCESS_TASK',
      taskId: 'task-1',
      jobId: 'job-submit-1',
      fileId: 'file-1',
      destinationId: 'dest-a',
      userId: 'user-1',
      checksum: 'sha256-abc',
    });
    expect(taskMessages[1]).toMatchObject({
      messageType: 'PROCESS_TASK',
      taskId: 'task-2',
      jobId: 'job-submit-1',
      fileId: 'file-2',
      destinationId: 'dest-b',
      userId: 'user-1',
      checksum: null,
    });
    expect(taskMessages[0].submittedAt).toBeDefined();
  });

  it('publishes job submitted notification', async () => {
    const updatedJob = { ...mockJob, status: 'processing' };

    mockQuery
      .mockResolvedValueOnce([mockJob])
      .mockResolvedValueOnce(mockTasks)
      .mockResolvedValueOnce([updatedJob]);

    await request(app)
      .post('/api/jobs/job-submit-1/submit')
      .set('x-user-id', 'user-1');

    expect(mockPublishJobSubmitted).toHaveBeenCalledTimes(1);
    const jobMessage = mockPublishJobSubmitted.mock.calls[0][0];

    expect(jobMessage).toMatchObject({
      messageType: 'JOB_SUBMITTED',
      jobId: 'job-submit-1',
      userId: 'user-1',
      taskCount: 2,
    });
    expect(jobMessage.submittedAt).toBeDefined();
  });

  it('returns 500 when queue publish fails', async () => {
    mockQuery
      .mockResolvedValueOnce([mockJob])
      .mockResolvedValueOnce(mockTasks);

    mockPublishTaskMessages.mockRejectedValueOnce(new Error('SQS timeout'));

    const res = await request(app)
      .post('/api/jobs/job-submit-1/submit')
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to submit job for processing');
  });

  it('does not update job status if queue publish fails', async () => {
    mockQuery
      .mockResolvedValueOnce([mockJob])
      .mockResolvedValueOnce(mockTasks);

    mockPublishTaskMessages.mockRejectedValueOnce(new Error('SQS timeout'));

    await request(app)
      .post('/api/jobs/job-submit-1/submit')
      .set('x-user-id', 'user-1');

    // updateJobStatus query should NOT have been called (only 2 queries: getJob + listTasks)
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});
