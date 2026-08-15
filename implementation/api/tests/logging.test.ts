import request from 'supertest';
import { app } from '../src/app';
import { createChildLogger, auditLog, logger } from '../src/logging';
import { ConnectionManager } from '../src/ws/connection-manager';

describe('Structured Logging', () => {
  describe('createChildLogger', () => {
    it('creates a child logger with bound context', () => {
      const child = createChildLogger({ correlationId: 'test-123', userId: 'user-1' });
      expect(child).toBeDefined();
      expect(child.info).toBeInstanceOf(Function);
      expect(child.error).toBeInstanceOf(Function);
    });
  });

  describe('auditLog', () => {
    it('logs audit events through the logger', () => {
      // Spy on logger.info
      const spy = jest.spyOn(logger, 'info');

      auditLog('TEST_EVENT', { key: 'value', count: 42 });

      expect(spy).toHaveBeenCalledWith('TEST_EVENT', {
        audit: true,
        event: 'TEST_EVENT',
        key: 'value',
        count: 42,
      });

      spy.mockRestore();
    });
  });
});

describe('Correlation ID Middleware', () => {
  it('adds x-correlation-id to response headers', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-correlation-id']).toBeDefined();
    expect(res.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('uses provided x-correlation-id from request', async () => {
    const customId = 'my-trace-id-123';
    const res = await request(app)
      .get('/health')
      .set('x-correlation-id', customId);

    expect(res.headers['x-correlation-id']).toBe(customId);
  });

  it('uses x-request-id if no correlation id', async () => {
    const requestId = 'req-id-456';
    const res = await request(app)
      .get('/health')
      .set('x-request-id', requestId);

    expect(res.headers['x-correlation-id']).toBe(requestId);
  });

  it('generates new ID when no trace headers present', async () => {
    const res1 = await request(app).get('/health');
    const res2 = await request(app).get('/health');

    // Each request gets a unique ID
    expect(res1.headers['x-correlation-id']).not.toBe(res2.headers['x-correlation-id']);
  });
});

describe('Request Logger', () => {
  it('does not break request processing', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('works with authenticated routes', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(200);
    expect(res.headers['x-correlation-id']).toBeDefined();
  });
});
