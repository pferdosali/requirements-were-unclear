import request from 'supertest';
import { app } from '../src/app';

describe('Auth Middleware', () => {
  it('returns 401 when x-user-id header is missing', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing x-user-id header');
  });

  it('authenticates user and resolves team', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('x-user-id', 'user-1');
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe('user-1');
    expect(res.body.team.teamId).toBe('team-a');
    expect(res.body.team.region).toBe('region-a');
  });

  it('returns default team for unknown user', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('x-user-id', 'unknown-user');
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe('unknown-user');
    expect(res.body.team.teamId).toBe('team-a');
  });
});
