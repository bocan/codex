/**
 * MCP Tool Registry
 * Central registration point for all Codex MCP tools.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { config } from '../config';
import type { RegisteredTool, ToolContext, ToolResult } from './types';
import { asRegisteredTool } from './types';

// Import all tools
import {
  searchPagesTool,
  getPageTool,
  createPageTool,
  updatePageTool,
  deletePageTool,
  renamePageTool,
  movePageTool,
} from './pages';

import {
  listFoldersTool,
  listPagesTool,
  createFolderTool,
  deleteFolderTool,
  renameFolderTool,
} from './folders';

/**
 * All registered tools
 */
export const tools: RegisteredTool[] = [
  // Page operations
  asRegisteredTool(searchPagesTool),
  asRegisteredTool(getPageTool),
  asRegisteredTool(createPageTool),
  asRegisteredTool(updatePageTool),
  asRegisteredTool(deletePageTool),
  asRegisteredTool(renamePageTool),
  asRegisteredTool(movePageTool),
  // Folder operations
  asRegisteredTool(listFoldersTool),
  asRegisteredTool(listPagesTool),
  asRegisteredTool(createFolderTool),
  asRegisteredTool(deleteFolderTool),
  asRegisteredTool(renameFolderTool),
];

/**
 * Get a tool by name
 */
export function getTool(name: string): RegisteredTool | undefined {
  return tools.find(t => t.name === name);
}

/**
 * Execute a tool by name with input validation
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const tool = getTool(name);

  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  // Check for cancellation
  if (context.signal?.aborted) {
    return {
      content: [{ type: 'text', text: 'Operation was cancelled' }],
      isError: true,
    };
  }

  // Validate input with Zod
  const parseResult = tool.inputSchema.safeParse(args);
  if (!parseResult.success) {
    const errors = parseResult.error.issues
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    return {
      content: [{ type: 'text', text: `Invalid input: ${errors}` }],
      isError: true,
    };
  }

  try {
    const result = await tool.handler(parseResult.data, context);
    return result;
  } catch (error) {
    if (context.signal?.aborted) {
      return {
        content: [{ type: 'text', text: 'Operation was cancelled' }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: `Tool error: ${(error as Error).message}` }],
      isError: true,
    };
  }
}

/**
 * Extra data passed to tool handlers by the SDK
 */
interface ToolHandlerExtra {
  sessionId?: string;
  requestId?: string | number;
  signal?: AbortSignal;
  _meta?: {
    progressToken?: string | number;
  };
}

/**
 * Register all tools with an MCP server instance
 */
export function registerTools(server: McpServer): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema.shape,
        ...(tool.annotations && { annotations: tool.annotations }),
      },
      async (args: Record<string, unknown>, extra: ToolHandlerExtra) => {
        const context: ToolContext = {
          sessionId: extra.sessionId ?? crypto.randomUUID(),
          signal: extra.signal,
          meta: {
            progressToken: extra._meta?.progressToken,
            requestId: extra.requestId?.toString(),
          },
        };

        const result = await executeTool(tool.name, args, context);
        return result as CallToolResult;
      }
    );
  }

  if (config.debug) {
    console.log(`[MCP] Registered ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
  }
}
