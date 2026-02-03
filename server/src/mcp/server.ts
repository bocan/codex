/**
 * Codex MCP Server
 *
 * A Model Context Protocol server that provides AI agents access to
 * the Codex documentation wiki.
 *
 * Supports:
 * - Streamable HTTP transport (latest MCP spec)
 * - API key authentication
 * - Session management
 * - All Codex operations: search, read, create, update, delete pages/folders
 *
 * Protocol versions: 2025-03-26, 2024-11-05
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config';
import { sessionStore } from './sessions';
import { registerTools } from './tools/registry';
import { registerResources } from './resources';

// Package version for server info
const VERSION = '1.0.0';

/**
 * Create and configure the MCP server instance
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'codex',
    version: VERSION,
  });

  // Register tools and resources
  registerTools(server);
  registerResources(server);

  return server;
}

/**
 * Validate API key from request headers
 */
function validateApiKey(req: IncomingMessage): boolean {
  // If no API key configured, allow all (development mode)
  if (!config.apiKey) {
    if (config.debug) {
      console.log('[MCP] Warning: No API key configured, accepting all requests');
    }
    return true;
  }

  const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
  if (!authHeader) {
    return false;
  }

  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

  // Support both "Bearer <key>" and direct API key
  if (headerValue.startsWith('Bearer ')) {
    return headerValue.slice(7) === config.apiKey;
  }

  return headerValue === config.apiKey;
}

/**
 * Extract API key for session binding
 */
function extractApiKey(req: IncomingMessage): string {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'];

  if (!authHeader) {
    return 'public';
  }

  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

  if (headerValue.startsWith('Bearer ')) {
    return headerValue.slice(7);
  }

  return headerValue;
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Parse request body as JSON
 */
function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body ? JSON.parse(body) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Store active transports per session
const transports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Start the MCP server
 */
export function startMcpServer(): void {
  const mcpServer = createMcpServer();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Health check endpoint
    if (pathname === '/health' && req.method === 'GET') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'codex-mcp',
        version: VERSION,
        sessions: sessionStore.count(),
        authRequired: Boolean(config.apiKey),
      });
      return;
    }

    // Well-known MCP server metadata
    if (pathname === '/.well-known/mcp' && req.method === 'GET') {
      sendJson(res, 200, {
        name: 'codex',
        version: VERSION,
        description: 'Codex Documentation Wiki MCP Server',
        capabilities: {
          tools: true,
          resources: true,
          prompts: false,
        },
        endpoints: {
          mcp: '/mcp',
          health: '/health',
        },
        authentication: {
          required: Boolean(config.apiKey),
          methods: ['bearer', 'api_key'],
        },
      });
      return;
    }

    // MCP endpoint
    if (pathname === '/mcp') {
      // Validate API key
      if (!validateApiKey(req)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Handle DELETE - session termination
      if (req.method === 'DELETE') {
        if (sessionId) {
          const transport = transports.get(sessionId);
          if (transport) {
            await transport.close();
            transports.delete(sessionId);
          }
          sessionStore.delete(sessionId);
        }
        res.writeHead(204);
        res.end();
        return;
      }

      // Handle POST - MCP messages
      if (req.method === 'POST') {
        try {
          // Get or create transport for this session
          let transport: StreamableHTTPServerTransport;
          let isNewSession = false;

          if (sessionId && transports.has(sessionId)) {
            // Existing session - reuse transport
            transport = transports.get(sessionId)!;
          } else if (sessionId) {
            // Session ID provided but transport not found - session expired
            sendJson(res, 400, {
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'Bad Request: Session not found or expired',
              },
              id: null,
            });
            return;
          } else {
            // No session ID - this should be an initialize request
            // Create new transport for the session
            isNewSession = true;
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => {
                const session = sessionStore.create(extractApiKey(req));
                return session.id;
              },
              onsessioninitialized: (newSessionId) => {
                sessionStore.initialize(newSessionId);
                transports.set(newSessionId, transport);
                if (config.debug) {
                  console.log(`[MCP] Session initialized: ${newSessionId}`);
                }
              },
              // Enable JSON responses for clients that don't support SSE
              enableJsonResponse: true,
            });

            // Connect MCP server to transport for new sessions
            await mcpServer.connect(transport);
          }

          // Parse body and handle request
          const body = await parseBody(req);
          await transport.handleRequest(req, res, body);
        } catch (error) {
          console.error('[MCP] Request error:', error);
          sendJson(res, 500, {
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal error',
              data: config.debug ? (error as Error).message : undefined,
            },
            id: null,
          });
        }
        return;
      }

      // Handle GET - SSE streaming (for server-initiated messages)
      if (req.method === 'GET') {
        if (!sessionId || !transports.has(sessionId)) {
          sendJson(res, 400, { error: 'Session ID required for SSE connection' });
          return;
        }

        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      // Method not allowed
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    // Not found
    sendJson(res, 404, { error: 'Not found' });
  });

  server.listen(config.port, config.host, () => {
    console.log(`🤖 MCP Server started on http://${config.host}:${config.port}`);
    console.log(`   Health: http://${config.host}:${config.port}/health`);
    console.log(`   MCP endpoint: http://${config.host}:${config.port}/mcp`);
    console.log(`   Auth required: ${Boolean(config.apiKey)}`);

    if (!config.apiKey) {
      console.log('   ⚠️  Warning: No MCP_API_KEY set - server is unauthenticated!');
    }
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[MCP] Shutting down...');
  sessionStore.stopCleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[MCP] Shutting down...');
  sessionStore.stopCleanup();
  process.exit(0);
});
