import { ConnectionManager } from '../src/ws/connection-manager';
import { notifyTaskStatus, notifyJobStatus, isUserListening } from '../src/ws/status-notifier';
import request from 'supertest';
import { app } from '../src/app';

// Mock db/pool for status endpoint tests
jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
  closePool: jest.fn(),
  pool: { on: jest.fn(), end: jest.fn() },
}));

import { query } from '../src/db/pool';
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager();
  });

  function createMockWs(readyState = 1): any {
    const listeners: Record<string, Function[]> = {};
    return {
      readyState,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn((event: string, cb: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
      }),
      OPEN: 1,
      _trigger: (event: string) => {
        (listeners[event] || []).forEach((cb) => cb());
      },
    };
  }

  function createMockReq(userId: string | null): any {
    return {
      url: userId ? `/ws?userId=${userId}` : '/ws',
    };
  }

  it('adds a connection with valid userId', () => {
    const ws = createMockWs();
    const req = createMockReq('user-1');

    const client = manager.addConnection(ws, req);

    expect(client).not.toBeNull();
    expect(client!.userId).toBe('user-1');
    expect(manager.connectionCount).toBe(1);
    expect(manager.isUserConnected('user-1')).toBe(true);
  });

  it('rejects connection without userId', () => {
    const ws = createMockWs();
    const req = createMockReq(null);

    const client = manager.addConnection(ws, req);

    expect(client).toBeNull();
    expect(ws.close).toHaveBeenCalledWith(4001, 'Missing user authentication');
    expect(manager.connectionCount).toBe(0);
  });

  it('sends welcome message on connection', () => {
    const ws = createMockWs();
    const req = createMockReq('user-1');

    manager.addConnection(ws, req);

    expect(ws.send).toHaveBeenCalledTimes(1);
    const message = JSON.parse(ws.send.mock.calls[0][0]);
    expect(message.type).toBe('connected');
    expect(message.userId).toBe('user-1');
  });

  it('supports multiple connections per user', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const req = createMockReq('user-1');

    manager.addConnection(ws1, req);
    manager.addConnection(ws2, req);

    expect(manager.connectionCount).toBe(2);
    expect(manager.isUserConnected('user-1')).toBe(true);
  });

  it('sends message to all connections for a user', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const req = createMockReq('user-1');

    manager.addConnection(ws1, req);
    manager.addConnection(ws2, req);

    // Clear welcome messages
    ws1.send.mockClear();
    ws2.send.mockClear();

    const sent = manager.sendToUser('user-1', { type: 'test', data: 'hello' });

    expect(sent).toBe(2);
    expect(ws1.send).toHaveBeenCalledTimes(1);
    expect(ws2.send).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when sending to non-connected user', () => {
    const sent = manager.sendToUser('unknown-user', { type: 'test' });
    expect(sent).toBe(0);
  });

  it('removes client on disconnect', () => {
    const ws = createMockWs();
    const req = createMockReq('user-1');

    const client = manager.addConnection(ws, req);
    expect(manager.connectionCount).toBe(1);

    // Simulate disconnect
    manager.removeConnection(client!);

    expect(manager.connectionCount).toBe(0);
    expect(manager.isUserConnected('user-1')).toBe(false);
  });

  it('getConnectedUsers returns all connected user IDs', () => {
    manager.addConnection(createMockWs(), createMockReq('user-1'));
    manager.addConnection(createMockWs(), createMockReq('user-2'));

    const users = manager.getConnectedUsers();

    expect(users).toContain('user-1');
    expect(users).toContain('user-2');
    expect(users).toHaveLength(2);
  });

  it('closeAll disconnects everyone', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    manager.addConnection(ws1, createMockReq('user-1'));
    manager.addConnection(ws2, createMockReq('user-2'));

    manager.closeAll();

    expect(ws1.close).toHaveBeenCalledWith(1001, 'Server shutting down');
    expect(ws2.close).toHaveBeenCalledWith(1001, 'Server shutting down');
    expect(manager.connectionCount).toBe(0);
  });

  it('does not send to closed WebSocket', () => {
    const ws = createMockWs(3); // CLOSED state
    const req = createMockReq('user-1');

    // Manually add (bypasses the normal send in addConnection since it checks readyState)
    const client = { ws, userId: 'user-1', connectedAt: new Date() };

    const success = manager.sendToClient(client, { test: true });
    expect(success).toBe(false);
  });
});

describe('Status Notifier', () => {
  // The status notifier uses the singleton connectionManager
  // We test it indirectly through the connection manager behavior

  it('isUserListening returns false for non-connected user', () => {
    expect(isUserListening('nonexistent-user')).toBe(false);
  });
});

describe('GET /api/jobs/:jobId/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/jobs/job-1/status');
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent job', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/jobs/nonexistent/status')
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(404);
  });

  it('returns 403 for other users job', async () => {
    mockQuery.mockResolvedValueOnce([{
      job_id: 'job-1', user_id: 'user-2', status: 'processing',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }]);

    const res = await request(app)
      .get('/api/jobs/job-1/status')
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(403);
  });

  it('returns job status with task summary', async () => {
    const mockJob = {
      job_id: 'job-1', user_id: 'user-1', status: 'processing',
      created_at: '2026-08-14T00:00:00Z', updated_at: '2026-08-14T00:01:00Z',
    };
    const mockTasks = [
      { task_id: 't1', job_id: 'job-1', file_id: 'f1', destination_id: 'd1', status: 'completed', retry_count: 0, checksum: null, created_at: '2026-08-14T00:00:00Z', updated_at: '2026-08-14T00:01:00Z' },
      { task_id: 't2', job_id: 'job-1', file_id: 'f2', destination_id: 'd2', status: 'processing', retry_count: 1, checksum: null, created_at: '2026-08-14T00:00:00Z', updated_at: '2026-08-14T00:01:00Z' },
      { task_id: 't3', job_id: 'job-1', file_id: 'f3', destination_id: 'd3', status: 'pending', retry_count: 0, checksum: null, created_at: '2026-08-14T00:00:00Z', updated_at: '2026-08-14T00:01:00Z' },
    ];

    mockQuery
      .mockResolvedValueOnce([mockJob])
      .mockResolvedValueOnce(mockTasks);

    const res = await request(app)
      .get('/api/jobs/job-1/status')
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe('job-1');
    expect(res.body.status).toBe('processing');
    expect(res.body.tasksSummary).toEqual({
      total: 3,
      completed: 1,
      failed: 0,
      pending: 1,
      processing: 1,
    });
    expect(res.body.tasks).toHaveLength(3);
    expect(res.body.tasks[0].taskId).toBe('t1');
    expect(res.body._links.websocket).toContain('ws://');
    expect(res.body._links.websocket).toContain('userId=user-1');
  });
});
