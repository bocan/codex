import request from 'supertest';
import app from '../src/index';

describe('Authentication', () => {
  describe('POST /api/auth/login', () => {
    it('should reject login without password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject when auth is not configured', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'any-password' });

      // When AUTH_PASSWORD env var is not set, login should be rejected
      expect(response.status).toBe(503);
      expect(response.body.error).toContain('not configured');
    });
  });

  describe('GET /api/auth/status', () => {
    it('should return auth status', async () => {
      const response = await request(app).get('/api/auth/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('authEnabled');
      expect(response.body).toHaveProperty('authenticated');
      // When no password is set, auth should be disabled
      expect(response.body.authEnabled).toBe(false);
    });
  });

  describe('Protected Routes', () => {
    it('should allow access to folders when auth is disabled', async () => {
      const response = await request(app).get('/api/folders');

      // When auth is disabled, routes should be accessible
      expect(response.status).toBe(200);
    });
  });
});
