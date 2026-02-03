/**
 * MCP Server Tests
 * Comprehensive tests for the Model Context Protocol server.
 */

import request from 'supertest';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { setServices } from '../src/index';
import { FileSystemService } from '../src/services/fileSystem';
import { GitService } from '../src/services/gitService';
import fs from 'fs/promises';
import path from 'path';

// Import MCP components for unit testing
import { SessionStore, sessionStore as globalSessionStore } from '../src/mcp/sessions';
import { loadConfig } from '../src/mcp/config';
import { tools, getTool, executeTool } from '../src/mcp/tools/registry';

const TEST_DATA_DIR = path.join(__dirname, '../test-data-mcp');

// Stop the global singleton's cleanup interval after all tests
afterAll(() => {
  globalSessionStore.stopCleanup();
});

// ============================================================================
// Unit Tests: Session Store
// ============================================================================

describe('MCP Session Store', () => {
  let store: SessionStore;

  beforeEach(() => {
    // Create a fresh session store for each test
    store = new SessionStore();
  });

  afterEach(() => {
    store.stopCleanup();
  });

  describe('Session Creation', () => {
    it('should create a new session with unique ID', () => {
      const session = store.create('test-api-key');

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.id.length).toBeGreaterThan(0);
      expect(session.apiKey).toBe('test-api-key');
      expect(session.initialized).toBe(false);
    });

    it('should create sessions with unique IDs', () => {
      const session1 = store.create('test-api-key');
      const session2 = store.create('test-api-key');

      expect(session1.id).not.toBe(session2.id);
    });

    it('should track creation and last accessed time', () => {
      const before = Date.now();
      const session = store.create('test-api-key');
      const after = Date.now();

      expect(session.createdAt).toBeGreaterThanOrEqual(before);
      expect(session.createdAt).toBeLessThanOrEqual(after);
      expect(session.lastAccessedAt).toBeGreaterThanOrEqual(before);
      expect(session.lastAccessedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('Session Retrieval', () => {
    it('should retrieve an existing session', () => {
      const created = store.create('test-api-key');
      const retrieved = store.get(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should return undefined for non-existent session', () => {
      const retrieved = store.get('non-existent-id');

      expect(retrieved).toBeUndefined();
    });

    it('should update lastAccessedAt on retrieval', async () => {
      const created = store.create('test-api-key');
      const initialAccessTime = created.lastAccessedAt;

      // Wait a tiny bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const retrieved = store.get(created.id);

      expect(retrieved!.lastAccessedAt).toBeGreaterThan(initialAccessTime);
    });
  });

  describe('Session Initialization', () => {
    it('should mark session as initialized', () => {
      const session = store.create('test-api-key');
      expect(session.initialized).toBe(false);

      const result = store.initialize(session.id, '2024-11-05');

      expect(result).toBe(true);

      const retrieved = store.get(session.id);
      expect(retrieved!.initialized).toBe(true);
      expect(retrieved!.protocolVersion).toBe('2024-11-05');
    });

    it('should return false for non-existent session', () => {
      const result = store.initialize('non-existent', '2024-11-05');

      expect(result).toBe(false);
    });
  });

  describe('Session Deletion', () => {
    it('should delete an existing session', () => {
      const session = store.create('test-api-key');
      expect(store.get(session.id)).toBeDefined();

      const deleted = store.delete(session.id);

      expect(deleted).toBe(true);
      expect(store.get(session.id)).toBeUndefined();
    });

    it('should return false when deleting non-existent session', () => {
      const deleted = store.delete('non-existent');

      expect(deleted).toBe(false);
    });
  });

  describe('Session Validation', () => {
    it('should validate existing session', () => {
      const session = store.create('test-api-key');

      expect(store.validate(session.id)).toBe(true);
    });

    it('should not validate non-existent session', () => {
      expect(store.validate('non-existent')).toBe(false);
    });

    it('should not validate deleted session', () => {
      const session = store.create('test-api-key');
      store.delete(session.id);

      expect(store.validate(session.id)).toBe(false);
    });
  });

  describe('Session Count', () => {
    it('should return correct session count', () => {
      expect(store.count()).toBe(0);

      store.create('key1');
      expect(store.count()).toBe(1);

      store.create('key2');
      expect(store.count()).toBe(2);
    });

    it('should decrease count on deletion', () => {
      const session = store.create('test-api-key');
      expect(store.count()).toBe(1);

      store.delete(session.id);
      expect(store.count()).toBe(0);
    });
  });

  describe('Per-Key Session Limits', () => {
    it('should enforce max sessions per API key by removing oldest', () => {
      // Create sessions up to the limit (default is 5)
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        sessions.push(store.create('same-api-key'));
      }

      // All 5 should exist
      expect(store.count()).toBe(5);

      // Create one more - should evict the oldest
      const newSession = store.create('same-api-key');

      // Still 5 sessions (oldest was evicted)
      expect(store.count()).toBe(5);

      // First session should be gone
      expect(store.get(sessions[0].id)).toBeUndefined();

      // New session should exist
      expect(store.get(newSession.id)).toBeDefined();
    });

    it('should allow different API keys to have separate limits', () => {
      // Create 3 sessions for key1
      for (let i = 0; i < 3; i++) {
        store.create('key1');
      }

      // Create 3 sessions for key2
      for (let i = 0; i < 3; i++) {
        store.create('key2');
      }

      expect(store.count()).toBe(6);
    });
  });
});

// ============================================================================
// Unit Tests: Configuration
// ============================================================================

describe('MCP Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load default configuration', () => {
    delete process.env.MCP_PORT;
    delete process.env.MCP_HOST;
    delete process.env.MCP_API_KEY;
    delete process.env.MCP_SESSION_TTL_MS;
    delete process.env.MCP_MAX_SESSIONS;
    delete process.env.MCP_DEBUG;

    const config = loadConfig();

    expect(config.port).toBe(3002);
    expect(config.host).toBe('0.0.0.0');
    expect(config.apiKey).toBeUndefined();
    expect(config.sessionTtlMs).toBe(24 * 60 * 60 * 1000);
    expect(config.maxSessionsPerKey).toBe(5);
    expect(config.debug).toBe(false);
  });

  it('should load custom configuration from environment', () => {
    process.env.MCP_PORT = '4000';
    process.env.MCP_HOST = '127.0.0.1';
    process.env.MCP_API_KEY = 'test-key';
    process.env.MCP_SESSION_TTL_MS = '3600000';
    process.env.MCP_MAX_SESSIONS = '10';
    process.env.MCP_DEBUG = 'true';

    const config = loadConfig();

    expect(config.port).toBe(4000);
    expect(config.host).toBe('127.0.0.1');
    expect(config.apiKey).toBe('test-key');
    expect(config.sessionTtlMs).toBe(3600000);
    expect(config.maxSessionsPerKey).toBe(10);
    expect(config.debug).toBe(true);
  });
});

// ============================================================================
// Unit Tests: Tool Registry
// ============================================================================

describe('MCP Tool Registry', () => {
  describe('Tool Registration', () => {
    it('should have 16 registered tools', () => {
      expect(tools).toHaveLength(16);
    });

    it('should register all page tools', () => {
      const pageToolNames = [
        'search_pages',
        'get_page',
        'create_page',
        'update_page',
        'delete_page',
        'rename_page',
        'move_page',
      ];

      for (const name of pageToolNames) {
        expect(getTool(name)).toBeDefined();
      }
    });

    it('should register all folder tools', () => {
      const folderToolNames = [
        'list_folders',
        'list_pages',
        'create_folder',
        'delete_folder',
        'rename_folder',
      ];

      for (const name of folderToolNames) {
        expect(getTool(name)).toBeDefined();
      }
    });

    it('should register all attachment tools', () => {
      const attachmentToolNames = [
        'list_attachments',
        'upload_attachment',
        'get_attachment',
        'delete_attachment',
      ];

      for (const name of attachmentToolNames) {
        expect(getTool(name)).toBeDefined();
      }
    });

    it('should return undefined for unknown tool', () => {
      expect(getTool('unknown_tool')).toBeUndefined();
    });
  });

  describe('Tool Structure', () => {
    it('each tool should have required properties', () => {
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(tool.handler).toBeDefined();
        expect(typeof tool.handler).toBe('function');
      }
    });

    it('each tool should have a valid Zod input schema', () => {
      for (const tool of tools) {
        // Verify it's a Zod schema by checking for safeParse
        expect(typeof tool.inputSchema.safeParse).toBe('function');
      }
    });
  });

  describe('Tool Execution', () => {
    it('should return error for unknown tool', async () => {
      const result = await executeTool('unknown_tool', {}, { sessionId: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Unknown tool'),
      });
    });

    it('should return error for invalid input', async () => {
      // get_page requires 'path' parameter
      const result = await executeTool('get_page', {}, { sessionId: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Invalid input'),
      });
    });

    it('should handle cancellation', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await executeTool(
        'search_pages',
        { query: 'test' },
        { sessionId: 'test', signal: controller.signal }
      );

      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: 'Operation was cancelled',
      });
    });
  });
});

// ============================================================================
// Integration Tests: MCP HTTP Server
// ============================================================================

describe('MCP HTTP Server Integration', () => {
  let testGitService: GitService;
  let testFileSystemService: FileSystemService;
  let mcpServer: Server | null = null;
  let testSessionStore: SessionStore | null = null;
  const MCP_PORT = 3099; // Use different port for tests

  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });

    // Create Git and FileSystem services
    testGitService = new GitService(TEST_DATA_DIR);
    testFileSystemService = new FileSystemService(TEST_DATA_DIR, testGitService);

    await testFileSystemService.initialize();
    await testGitService.initialize();

    // Override the app's services
    setServices(testGitService, testFileSystemService);

    // Create some test data
    await testFileSystemService.createPage('test-page.md', '# Test Page\n\nTest content');
    await testFileSystemService.createFolder('test-folder');
  });

  afterAll(async () => {
    if (mcpServer) {
      mcpServer.close();
      mcpServer = null;
    }

    if (testSessionStore) {
      testSessionStore.stopCleanup();
      testSessionStore = null;
    }

    // Clean up test data
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }
  });

  // Helper to create a simple test server that mimics MCP endpoints
  function createTestMcpServer(): Server {
    // Create a new session store for this test server
    testSessionStore = new SessionStore();

    return createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://localhost:${MCP_PORT}`);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, Mcp-Session-Id');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health endpoint
      if (url.pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          service: 'codex-mcp',
          version: '1.0.0',
          sessions: testSessionStore ? testSessionStore.count() : 0,
          authRequired: false,
        }));
        return;
      }

      // Well-known MCP metadata
      if (url.pathname === '/.well-known/mcp' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          name: 'codex',
          version: '1.0.0',
          description: 'Codex Documentation Wiki MCP Server',
          capabilities: {
            tools: true,
            resources: true,
            prompts: false,
          },
        }));
        return;
      }

      // Not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  }

  describe('Health Endpoint', () => {
    beforeAll(async () => {
      mcpServer = createTestMcpServer();
      await new Promise<void>((resolve) => {
        mcpServer!.listen(MCP_PORT, () => resolve());
      });
    });

    afterAll(() => {
      if (mcpServer) {
        mcpServer.close();
        mcpServer = null;
      }
      if (testSessionStore) {
        testSessionStore.stopCleanup();
        testSessionStore = null;
      }
    });

    it('should return health status', async () => {
      const response = await fetch(`http://localhost:${MCP_PORT}/health`);
      const data = await response.json() as {
        status: string;
        service: string;
        version: string;
        sessions: number;
      };

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.service).toBe('codex-mcp');
      expect(data.version).toBe('1.0.0');
      expect(typeof data.sessions).toBe('number');
    });
  });

  describe('Well-Known MCP Metadata', () => {
    beforeAll(async () => {
      if (!mcpServer) {
        mcpServer = createTestMcpServer();
        await new Promise<void>((resolve) => {
          mcpServer!.listen(MCP_PORT, () => resolve());
        });
      }
    });

    afterAll(() => {
      if (mcpServer) {
        mcpServer.close();
        mcpServer = null;
      }
      if (testSessionStore) {
        testSessionStore.stopCleanup();
        testSessionStore = null;
      }
    });

    it('should return MCP server metadata', async () => {
      const response = await fetch(`http://localhost:${MCP_PORT}/.well-known/mcp`);
      const data = await response.json() as {
        name: string;
        version: string;
        capabilities: { tools: boolean; resources: boolean };
      };

      expect(response.status).toBe(200);
      expect(data.name).toBe('codex');
      expect(data.version).toBe('1.0.0');
      expect(data.capabilities.tools).toBe(true);
      expect(data.capabilities.resources).toBe(true);
    });
  });

  describe('CORS Headers', () => {
    beforeAll(async () => {
      if (!mcpServer) {
        mcpServer = createTestMcpServer();
        await new Promise<void>((resolve) => {
          mcpServer!.listen(MCP_PORT, () => resolve());
        });
      }
    });

    afterAll(() => {
      if (mcpServer) {
        mcpServer.close();
        mcpServer = null;
      }
      if (testSessionStore) {
        testSessionStore.stopCleanup();
        testSessionStore = null;
      }
    });

    it('should include CORS headers in response', async () => {
      const response = await fetch(`http://localhost:${MCP_PORT}/health`);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should handle OPTIONS preflight request', async () => {
      const response = await fetch(`http://localhost:${MCP_PORT}/mcp`, {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(204);
    });
  });
});

// ============================================================================
// Integration Tests: Tool Execution with FileSystem
// ============================================================================

describe('MCP Tools with FileSystem', () => {
  let testGitService: GitService;
  let testFileSystemService: FileSystemService;

  beforeAll(async () => {
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });

    testGitService = new GitService(TEST_DATA_DIR);
    testFileSystemService = new FileSystemService(TEST_DATA_DIR, testGitService);

    await testFileSystemService.initialize();
    await testGitService.initialize();

    setServices(testGitService, testFileSystemService);
  });

  afterAll(async () => {
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

  describe('list_folders Tool', () => {
    it('should list empty folder structure', async () => {
      const result = await executeTool('list_folders', {}, { sessionId: 'test' });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].type).toBe('text');

      // Tool returns human-readable text format with emoji
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('📁');
      expect(text).toContain('root');
    });

    it('should list created folders', async () => {
      await testFileSystemService.createFolder('folder1');
      await testFileSystemService.createFolder('folder2');

      const result = await executeTool('list_folders', {}, { sessionId: 'test' });

      expect(result.isError).toBeFalsy();

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('folder1');
      expect(text).toContain('folder2');
    });
  });

  describe('create_folder Tool', () => {
    it('should create a new folder', async () => {
      const result = await executeTool(
        'create_folder',
        { path: 'new-folder' },
        { sessionId: 'test' }
      );

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('created');

      // Verify folder exists
      const stats = await fs.stat(path.join(TEST_DATA_DIR, 'new-folder'));
      expect(stats.isDirectory()).toBe(true);
    });

    it('should return error for invalid folder path', async () => {
      const result = await executeTool(
        'create_folder',
        { path: '../outside' },
        { sessionId: 'test' }
      );

      expect(result.isError).toBe(true);
    });
  });

  describe('create_page Tool', () => {
    it('should create a new page', async () => {
      const result = await executeTool(
        'create_page',
        {
          path: 'test-page.md',
          content: '# Test\n\nContent here',
        },
        { sessionId: 'test' }
      );

      expect(result.isError).toBeFalsy();

      // Verify page exists
      const content = await fs.readFile(path.join(TEST_DATA_DIR, 'test-page.md'), 'utf-8');
      expect(content).toContain('# Test');
    });

    it('should require content parameter', async () => {
      const result = await executeTool(
        'create_page',
        { path: 'test.md' },
        { sessionId: 'test' }
      );

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('Invalid input');
    });
  });

  describe('get_page Tool', () => {
    it('should retrieve page content', async () => {
      // Create a page first
      await testFileSystemService.createPage('readme.md', '# Hello World\n\nTest content');

      const result = await executeTool(
        'get_page',
        { path: 'readme.md' },
        { sessionId: 'test' }
      );

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('Hello World');
    });

    it('should return error for non-existent page', async () => {
      const result = await executeTool(
        'get_page',
        { path: 'non-existent.md' },
        { sessionId: 'test' }
      );

      expect(result.isError).toBe(true);
    });
  });

  describe('update_page Tool', () => {
    it('should update existing page', async () => {
      // Create a page first
      await testFileSystemService.createPage('update-test.md', '# Original');

      const result = await executeTool(
        'update_page',
        {
          path: 'update-test.md',
          content: '# Updated Content',
        },
        { sessionId: 'test' }
      );

      expect(result.isError).toBeFalsy();

      // Verify content was updated
      const content = await fs.readFile(path.join(TEST_DATA_DIR, 'update-test.md'), 'utf-8');
      expect(content).toContain('Updated Content');
    });
  });

  describe('search_pages Tool', () => {
    it('should search for pages by query', async () => {
      // Create some pages
      await testFileSystemService.createPage('apple.md', '# Apple\n\nA delicious fruit');
      await testFileSystemService.createPage('banana.md', '# Banana\n\nYellow fruit');

      const result = await executeTool(
        'search_pages',
        { query: 'apple' },
        { sessionId: 'test' }
      );

      expect(result.isError).toBeFalsy();

      // Tool returns human-readable text
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Found');
      expect(text).toContain('apple');
    });

    it('should return no matches message for no results', async () => {
      const result = await executeTool(
        'search_pages',
        { query: 'xyz123nonexistent' },
        { sessionId: 'test' }
      );

      expect(result.isError).toBeFalsy();

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('No matches found');
    });
  });

  describe('delete_page Tool', () => {
    it('should delete an existing page', async () => {
      // Create a page first
      await testFileSystemService.createPage('to-delete.md', '# Delete me');

      const result = await executeTool(
        'delete_page',
        { path: 'to-delete.md' },
        { sessionId: 'test' }
      );

      expect(result.isError).toBeFalsy();

      // Verify page is deleted
      await expect(
        fs.access(path.join(TEST_DATA_DIR, 'to-delete.md'))
      ).rejects.toThrow();
    });
  });

  describe('rename_folder Tool', () => {
    it('should rename an existing folder', async () => {
      // Create a folder first
      await testFileSystemService.createFolder('old-name');

      const result = await executeTool(
        'rename_folder',
        { oldPath: 'old-name', newPath: 'new-name' },
        { sessionId: 'test' }
      );

      expect(result.isError).toBeFalsy();

      // Verify folder was renamed
      const stats = await fs.stat(path.join(TEST_DATA_DIR, 'new-name'));
      expect(stats.isDirectory()).toBe(true);

      // Old folder should not exist
      await expect(
        fs.access(path.join(TEST_DATA_DIR, 'old-name'))
      ).rejects.toThrow();
    });
  });
});
