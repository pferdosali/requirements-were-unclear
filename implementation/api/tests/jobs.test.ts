import request from 'supertest';
import { app } from '../src/app';

// Mock the db/pool module
jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
  closePool: jest.fn(),
  pool: { on: jest.fn(), end: jest.fn() },
}));

import { query } from '../src/db/pool';
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('Jobs API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/jobs', () => {
    it('returns 401 without auth header', async () => {
      const res = await request(app).post('/api/jobs');
      expect(res.status).toBe(401);
    });

    it('creates a job successfully', async () => {
      const mockJob = {
        job_id: '11111111-1111-1111-1111-111111111111',
        user_id: 'user-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockQuery.mockResolvedValueOnce([mockJob]);

      const res = await request(app)
        .post('/api/jobs')
        .set('x-user-id', 'user-1')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.job.job_id).toBe(mockJob.job_id);
      expect(res.body.job.user_id).toBe('user-1');
      expect(res.body.job.status).toBe('pending');
      expect(res.body.tasks).toEqual([]);
    });

    it('creates a job with inline tasks', async () => {
      const mockJob = {
        job_id: '22222222-2222-2222-2222-222222222222',
        user_id: 'user-1',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const mockTasks = [
        {
          task_id: 'aaaa-1',
          job_id: mockJob.job_id,
          file_id: 'file-1',
          destination_id: 'dest-a',
          status: 'pending',
          retry_count: 0,
          checksum: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          task_id: 'aaaa-2',
          job_id: mockJob.job_id,
          file_id: 'file-2',
          destination_id: 'dest-b',
          status: 'pending',
          retry_count: 0,
          checksum: 'abc123',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockQuery
        .mockResolvedValueOnce([mockJob])   // INSERT job
        .mockResolvedValueOnce(mockTasks);  // INSERT tasks batch

      const res = await request(app)
        .post('/api/jobs')
        .set('x-user-id', 'user-1')
        .send({
          tasks: [
            { fileId: 'file-1', destinationId: 'dest-a' },
            { fileId: 'file-2', destinationId: 'dest-b', checksum: 'abc123' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.job.job_id).toBe(mockJob.job_id);
      expect(res.body.tasks).toHaveLength(2);
      expect(res.body.tasks[0].file_id).toBe('file-1');
      expect(res.body.tasks[1].checksum).toBe('abc123');
    });
  });

  describe('GET /api/jobs', () => {
    it('lists jobs for authenticated user', async () => {
      const mockJobs = [
        { job_id: 'job-1', user_id: 'user-1', status: 'completed', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { job_id: 'job-2', user_id: 'user-1', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ];

      mockQuery.mockResolvedValueOnce(mockJobs);

      const res = await request(app)
        .get('/api/jobs')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(200);
      expect(res.body.jobs).toHaveLength(2);
    });

    it('returns empty array when user has no jobs', async () => {
      mockQuery.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/jobs')
        .set('x-user-id', 'user-new');

      expect(res.status).toBe(200);
      expect(res.body.jobs).toEqual([]);
    });
  });

  describe('GET /api/jobs/:jobId', () => {
    it('returns a job owned by the user', async () => {
      const mockJob = { job_id: 'job-1', user_id: 'user-1', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      mockQuery.mockResolvedValueOnce([mockJob]);

      const res = await request(app)
        .get('/api/jobs/job-1')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(200);
      expect(res.body.job.job_id).toBe('job-1');
    });

    it('returns 404 for non-existent job', async () => {
      mockQuery.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/jobs/nonexistent')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(404);
    });

    it('returns 403 when job belongs to another user', async () => {
      const mockJob = { job_id: 'job-1', user_id: 'user-2', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      mockQuery.mockResolvedValueOnce([mockJob]);

      const res = await request(app)
        .get('/api/jobs/job-1')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/jobs/:jobId/tasks', () => {
    it('lists tasks for a job', async () => {
      const mockJob = { job_id: 'job-1', user_id: 'user-1', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const mockTasks = [
        { task_id: 'task-1', job_id: 'job-1', file_id: 'f1', destination_id: 'd1', status: 'pending', retry_count: 0, checksum: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ];

      mockQuery
        .mockResolvedValueOnce([mockJob])  // getJobById
        .mockResolvedValueOnce(mockTasks); // listTasksByJob

      const res = await request(app)
        .get('/api/jobs/job-1/tasks')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
    });

    it('returns 403 if job not owned by user', async () => {
      const mockJob = { job_id: 'job-1', user_id: 'user-2', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      mockQuery.mockResolvedValueOnce([mockJob]);

      const res = await request(app)
        .get('/api/jobs/job-1/tasks')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/jobs/:jobId/tasks', () => {
    it('adds tasks to an existing job', async () => {
      const mockJob = { job_id: 'job-1', user_id: 'user-1', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const mockCreatedTasks = [
        { task_id: 'task-new', job_id: 'job-1', file_id: 'f1', destination_id: 'd1', status: 'pending', retry_count: 0, checksum: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ];

      mockQuery
        .mockResolvedValueOnce([mockJob])       // getJobById
        .mockResolvedValueOnce(mockCreatedTasks); // createTasksBatch

      const res = await request(app)
        .post('/api/jobs/job-1/tasks')
        .set('x-user-id', 'user-1')
        .send({ tasks: [{ fileId: 'f1', destinationId: 'd1' }] });

      expect(res.status).toBe(201);
      expect(res.body.tasks).toHaveLength(1);
    });

    it('returns 400 when tasks array is empty', async () => {
      const mockJob = { job_id: 'job-1', user_id: 'user-1', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      mockQuery.mockResolvedValueOnce([mockJob]);

      const res = await request(app)
        .post('/api/jobs/job-1/tasks')
        .set('x-user-id', 'user-1')
        .send({ tasks: [] });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/tasks/:taskId', () => {
    it('returns a task owned by the user', async () => {
      const mockTask = { task_id: 'task-1', job_id: 'job-1', file_id: 'f1', destination_id: 'd1', status: 'pending', retry_count: 0, checksum: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const mockJob = { job_id: 'job-1', user_id: 'user-1', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

      mockQuery
        .mockResolvedValueOnce([mockTask]) // getTaskById
        .mockResolvedValueOnce([mockJob]);  // getJobById (ownership check)

      const res = await request(app)
        .get('/api/tasks/task-1')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(200);
      expect(res.body.task.task_id).toBe('task-1');
    });

    it('returns 404 for non-existent task', async () => {
      mockQuery.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/tasks/nonexistent')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(404);
    });

    it('returns 403 when task belongs to another users job', async () => {
      const mockTask = { task_id: 'task-1', job_id: 'job-1', file_id: 'f1', destination_id: 'd1', status: 'pending', retry_count: 0, checksum: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const mockJob = { job_id: 'job-1', user_id: 'user-2', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

      mockQuery
        .mockResolvedValueOnce([mockTask])
        .mockResolvedValueOnce([mockJob]);

      const res = await request(app)
        .get('/api/tasks/task-1')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(403);
    });
  });
});
