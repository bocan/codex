import request from 'supertest';
import app, { setServices } from '../src/index';
import { FileSystemService } from '../src/services/fileSystem';
import { GitService } from '../src/services/gitService';
import fs from 'fs/promises';
import path from 'path';

const TEST_DATA_DIR = path.join(__dirname, '../test-data');

describe('Authentication', () => {
  beforeAll(async () => {
    // Create test directory and initialize services
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });

    const testGitService = new GitService(TEST_DATA_DIR);
    const testFileSystemService = new FileSystemService(TEST_DATA_DIR, testGitService);

    await testFileSystemService.initialize();
    await testGitService.initialize();

    // Override the app's services with test services
    setServices(testGitService, testFileSystemService);
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }
  });

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
