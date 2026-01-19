import request from 'supertest';
import app, { setServices } from '../src/index';
import { FileSystemService } from '../src/services/fileSystem';
import { GitService } from '../src/services/gitService';
import fs from 'fs/promises';
import path from 'path';

const TEST_DATA_DIR = path.join(__dirname, '../test-data');
let testGitService: GitService;
let testFileSystemService: FileSystemService;

describe('API Tests', () => {
  beforeAll(async () => {
    // Create test directory first
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });

    // Then create Git and FileSystem services
    testGitService = new GitService(TEST_DATA_DIR);
    testFileSystemService = new FileSystemService(TEST_DATA_DIR, testGitService);

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

  beforeEach(async () => {
    // Clean test directory before each test
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
      await fs.mkdir(TEST_DATA_DIR, { recursive: true });
      await testGitService.initialize();
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
      await testFileSystemService.createFolder('test-folder');

      const response = await request(app)
        .delete('/api/folders/test-folder');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should rename a folder', async () => {
      // Create folder first
      await testFileSystemService.createFolder('old-name');

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
      await testFileSystemService.createPage('test-page.md', '# Test Content');

      const response = await request(app)
        .get('/api/pages/test-page.md');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('content');
      expect(response.body.content).toBe('# Test Content');
    });

    it('should update a page', async () => {
      // Create page first
      await testFileSystemService.createPage('test-page.md', '# Old Content');

      const response = await request(app)
        .put('/api/pages/test-page.md')
        .send({ content: '# New Content' });

      expect(response.status).toBe(200);

      // Verify content was updated
      const content = await testFileSystemService.getPageContent('test-page.md');
      expect(content).toBe('# New Content');
    });

    it('should delete a page', async () => {
      // Create page first
      await testFileSystemService.createPage('test-page.md', '# Content');

      const response = await request(app)
        .delete('/api/pages/test-page.md');

      expect(response.status).toBe(200);
    });

    it('should list pages in a folder', async () => {
      // Create folder and pages
      await testFileSystemService.createFolder('test-folder');
      await testFileSystemService.createPage('test-folder/page1.md', '# Page 1');
      await testFileSystemService.createPage('test-folder/page2.md', '# Page 2');

      const response = await request(app)
        .get('/api/pages?folder=test-folder');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should rename a page', async () => {
      // Create page first
      await testFileSystemService.createPage('old-page.md', '# Content');

      const response = await request(app)
        .put('/api/pages/rename/file')
        .send({ oldPath: 'old-page.md', newPath: 'new-page.md' });

      expect(response.status).toBe(200);
    });

    it('should move a page to a different folder', async () => {
      // Create folder and page first
      await testFileSystemService.createFolder('source-folder');
      await testFileSystemService.createFolder('dest-folder');
      await testFileSystemService.createPage('source-folder/test-page.md', '# Test Content');

      const response = await request(app)
        .put('/api/pages/move')
        .send({ oldPath: 'source-folder/test-page.md', newFolderPath: 'dest-folder' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('newPath', 'dest-folder/test-page.md');

      // Verify file was moved
      const content = await testFileSystemService.getPageContent('dest-folder/test-page.md');
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

  describe('Version History', () => {
    it('should track page creation and updates in Git', async () => {
      // Create a page
      await testFileSystemService.createPage('history-test.md', '# Version 1');

      // Update it
      await testFileSystemService.updatePage('history-test.md', '# Version 2');
      await testFileSystemService.updatePage('history-test.md', '# Version 3');

      // Get history
      const history = await testGitService.getFileHistory('history-test.md');

      expect(history.length).toBeGreaterThanOrEqual(3);
      expect(history[0].message).toContain('Updated page');
      expect(history[history.length - 1].message).toContain('Created page');
    });

    it('should get page history via API', async () => {
      await testFileSystemService.createPage('api-history-test.md', '# Content');
      await testFileSystemService.updatePage('api-history-test.md', '# Updated');

      const response = await request(app).get('/api/pages/api-history-test.md/history');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      expect(response.body[0]).toHaveProperty('hash');
      expect(response.body[0]).toHaveProperty('date');
      expect(response.body[0]).toHaveProperty('message');
      expect(response.body[0]).toHaveProperty('author');
    });

    it('should get a specific version of a page', async () => {
      await testFileSystemService.createPage('version-test.md', '# Original');
      const history = await testGitService.getFileHistory('version-test.md');
      const originalHash = history[0].hash;

      await testFileSystemService.updatePage('version-test.md', '# Modified');

      const response = await request(app).get(`/api/pages/version-test.md/versions/${originalHash}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('content', '# Original');
      expect(response.body).toHaveProperty('hash', originalHash);
    });

    it('should handle manually added files', async () => {
      // Simulate manually adding a file
      const manualFilePath = path.join(TEST_DATA_DIR, 'manual-file.md');
      await fs.writeFile(manualFilePath, '# Manually added file');

      // Commit pending changes
      await testGitService.commitPendingChanges();

      // Verify it was committed
      const history = await testGitService.getFileHistory('manual-file.md');
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].message).toContain('External changes');
    });

    it('should restore a page to a previous version', async () => {
      await testFileSystemService.createPage('restore-test.md', '# Version 1');
      const history1 = await testGitService.getFileHistory('restore-test.md');
      const version1Hash = history1[0].hash;

      await testFileSystemService.updatePage('restore-test.md', '# Version 2');

      const response = await request(app).post(`/api/pages/restore-test.md/restore/${version1Hash}`);

      expect(response.status).toBe(200);

      // Verify content was restored
      const content = await testFileSystemService.getPageContent('restore-test.md');
      expect(content).toBe('# Version 1');
    });
  });
});
