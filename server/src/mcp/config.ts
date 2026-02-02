/**
 * MCP Server Configuration
 * Environment-based configuration for the MCP server.
 */

export interface McpConfig {
  /** MCP server port (separate from main API) */
  port: number;
  /** Host to bind to */
  host: string;
  /** API key for authentication (required for production) */
  apiKey: string | undefined;
  /** Session TTL in milliseconds (default: 24 hours) */
  sessionTtlMs: number;
  /** Maximum sessions per API key */
  maxSessionsPerKey: number;
  /** Enable debug logging */
  debug: boolean;
}

export function loadConfig(): McpConfig {
  return {
    port: parseInt(process.env.MCP_PORT || '3002', 10),
    host: process.env.MCP_HOST || '0.0.0.0',
    apiKey: process.env.MCP_API_KEY,
    sessionTtlMs: parseInt(process.env.MCP_SESSION_TTL_MS || String(24 * 60 * 60 * 1000), 10),
    maxSessionsPerKey: parseInt(process.env.MCP_MAX_SESSIONS || '5', 10),
    debug: process.env.MCP_DEBUG === 'true',
  };
}

export const config = loadConfig();
