import request from 'supertest';
import { app } from '../src/app';

describe('Destinations API', () => {
  describe('GET /api/destinations', () => {
    it('returns 200 with x-user-id header', async () => {
      const res = await request(app)
        .get('/api/destinations')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(200);
    });

    it('returns 401 without x-user-id header', async () => {
      const res = await request(app).get('/api/destinations');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing x-user-id header');
    });

    it('response has region and destinations fields', async () => {
      const res = await request(app)
        .get('/api/destinations')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('region');
      expect(res.body).toHaveProperty('destinations');
    });

    it('destinations is a tree structure with id, name, type, region, children', async () => {
      const res = await request(app)
        .get('/api/destinations')
        .set('x-user-id', 'user-1');

      expect(res.status).toBe(200);
      const tree = res.body.destinations;
      expect(tree).toHaveProperty('id');
      expect(tree).toHaveProperty('name');
      expect(tree).toHaveProperty('type');
      expect(tree).toHaveProperty('region');
      expect(tree).toHaveProperty('children');
      expect(Array.isArray(tree.children)).toBe(true);

      // Verify children also follow the tree structure
      const child = tree.children[0];
      expect(child).toHaveProperty('id');
      expect(child).toHaveProperty('name');
      expect(child).toHaveProperty('type');
      expect(child).toHaveProperty('region');
    });
  });
});
