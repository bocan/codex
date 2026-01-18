import request from 'supertest';
import app from '../src/index';
import fileSystemService from '../src/services/fileSystem';
import fs from 'fs/promises';
import path from 'path';

const TEST_DATA_DIR = path.join(__dirname, '../test-data');

describe('API Tests', () => {
  beforeAll(async () => {
    // Use a test data directory
    (fileSystemService as any).dataDir = TEST_DATA_DIR;
    await fileSystemService.initialize();
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }
  });

  beforeEach(async () => {
    // Clean test directory before each test
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
      await fs.mkdir(TEST_DATA_DIR, { recursive: true });
    } catch (error) {
      // Ignore errors
    }
  });

  describe('Folder Operations', () => {
    it('should get folder tree', async () => {
      const response = await request(app).get('/api/folders');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('type', 'folder');
      expect(response.body).toHaveProperty('children');
    });

    it('should create a folder', async () => {
      const response = await request(app)
        .post('/api/folders')
        .send({ path: 'test-folder' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
      expect(response.body.path).toBe('test-folder');
    });

    it('should delete a folder', async () => {
      // Create folder first
      await fileSystemService.createFolder('test-folder');

      const response = await request(app)
        .delete('/api/folders/test-folder');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should rename a folder', async () => {
      // Create folder first
      await fileSystemService.createFolder('old-name');

      const response = await request(app)
        .put('/api/folders/rename')
        .send({ oldPath: 'old-name', newPath: 'new-name' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Page Operations', () => {
    it('should create a page', async () => {
      const response = await request(app)
        .post('/api/pages')
        .send({ path: 'test-page.md', content: '# Hello World' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
    });

    it('should get a page', async () => {
      // Create page first
      await fileSystemService.createPage('test-page.md', '# Test Content');

      const response = await request(app)
        .get('/api/pages/test-page.md');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('content');
      expect(response.body.content).toBe('# Test Content');
    });

    it('should update a page', async () => {
      // Create page first
      await fileSystemService.createPage('test-page.md', '# Old Content');

      const response = await request(app)
        .put('/api/pages/test-page.md')
        .send({ content: '# New Content' });

      expect(response.status).toBe(200);

      // Verify content was updated
      const content = await fileSystemService.getPageContent('test-page.md');
      expect(content).toBe('# New Content');
    });

    it('should delete a page', async () => {
      // Create page first
      await fileSystemService.createPage('test-page.md', '# Content');

      const response = await request(app)
        .delete('/api/pages/test-page.md');

      expect(response.status).toBe(200);
    });

    it('should list pages in a folder', async () => {
      // Create folder and pages
      await fileSystemService.createFolder('test-folder');
      await fileSystemService.createPage('test-folder/page1.md', '# Page 1');
      await fileSystemService.createPage('test-folder/page2.md', '# Page 2');

      const response = await request(app)
        .get('/api/pages?folder=test-folder');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should rename a page', async () => {
      // Create page first
      await fileSystemService.createPage('old-page.md', '# Content');

      const response = await request(app)
        .put('/api/pages/rename/file')
        .send({ oldPath: 'old-page.md', newPath: 'new-page.md' });

      expect(response.status).toBe(200);
    });

    it('should move a page to a different folder', async () => {
      // Create folder and page first
      await fileSystemService.createFolder('source-folder');
      await fileSystemService.createFolder('dest-folder');
      await fileSystemService.createPage('source-folder/test-page.md', '# Test Content');

      const response = await request(app)
        .put('/api/pages/move')
        .send({ oldPath: 'source-folder/test-page.md', newFolderPath: 'dest-folder' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('newPath', 'dest-folder/test-page.md');

      // Verify file was moved
      const content = await fileSystemService.getPageContent('dest-folder/test-page.md');
      expect(content).toBe('# Test Content');
    });
  });

  describe('Health Check', () => {
    it('should return ok status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
    });
  });
});
