/**
 * MCP Tool Types and Utilities
 * Based on the latest MCP SDK patterns.
 */

import type { ZodObject, ZodRawShape, z } from 'zod';

/**
 * Context passed to every tool handler.
 */
export interface ToolContext {
  /** Session ID for this request */
  sessionId: string;
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
  /** Additional metadata */
  meta?: {
    progressToken?: string | number;
    requestId?: string;
  };
}

/**
 * Result returned by tool handlers.
 * Per MCP spec: content is always required, structuredContent when outputSchema defined.
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Tool definition with typed input schema.
 */
export interface ToolDefinition<T extends ZodRawShape> {
  name: string;
  description: string;
  inputSchema: ZodObject<T>;
  annotations?: {
    /** Tool doesn't modify data */
    readOnlyHint?: boolean;
    /** Tool may cause destructive/irreversible changes */
    destructiveHint?: boolean;
    /** Tool can be safely retried */
    idempotentHint?: boolean;
    /** Tool interacts with external systems */
    openWorldHint?: boolean;
  };
  handler: (args: z.infer<ZodObject<T>>, context: ToolContext) => Promise<ToolResult>;
}

/**
 * Helper to define a tool with proper typing.
 */
export function defineTool<T extends ZodRawShape>(
  definition: ToolDefinition<T>
): ToolDefinition<T> {
  return definition;
}

/**
 * Registered tool with erased generic for storage in arrays.
 */
export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: ZodObject<ZodRawShape>;
  annotations?: Record<string, unknown>;
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

/**
 * Convert a typed ToolDefinition to RegisteredTool.
 */
export function asRegisteredTool<T extends ZodRawShape>(
  tool: ToolDefinition<T>
): RegisteredTool {
  return tool as unknown as RegisteredTool;
}
