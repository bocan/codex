/**
 * MCP Tools - Folder Operations
 * Tools for managing documentation folder structure.
 */

import { z } from 'zod';
import { defineTool } from './types';
import { fileSystemService } from '../../index';

/**
 * List folder structure
 */
export const listFoldersTool = defineTool({
  name: 'list_folders',
  description: 'Get the complete folder tree structure of the documentation. Returns all folders and their hierarchy.',
  inputSchema: z.object({
    path: z.string().optional().default('').describe('Starting path (empty for root)'),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      const tree = await fileSystemService.getFolderTree(args.path);

      // Format tree as readable text
      const formatTree = (node: { name: string; path: string; children?: Array<{ name: string; path: string; children?: unknown[] }> }, indent = 0): string => {
        const prefix = '  '.repeat(indent);
        let result = `${prefix}📁 ${node.name || 'root'}${node.path ? ` (${node.path})` : ''}\n`;
        if (node.children) {
          for (const child of node.children) {
            result += formatTree(child as { name: string; path: string; children?: Array<{ name: string; path: string; children?: unknown[] }> }, indent + 1);
          }
        }
        return result;
      };

      return {
        content: [{ type: 'text', text: formatTree(tree) }],
        structuredContent: { tree },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to list folders: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
});

/**
 * List pages in a folder
 */
export const listPagesTool = defineTool({
  name: 'list_pages',
  description: 'List all documentation pages in a specific folder.',
  inputSchema: z.object({
    folder: z.string().optional().default('').describe('Folder path (empty for root)'),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      const pages = await fileSystemService.getPages(args.folder);

      if (pages.length === 0) {
        return {
          content: [{ type: 'text', text: `No pages found in ${args.folder || 'root'}` }],
          structuredContent: { folder: args.folder, pages: [] },
        };
      }

      const pageList = pages.map(p => `📄 ${p.name} (modified: ${new Date(p.modifiedAt).toLocaleDateString()})`).join('\n');

      return {
        content: [{ type: 'text', text: `Pages in ${args.folder || 'root'}:\n\n${pageList}` }],
        structuredContent: { folder: args.folder, pages },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to list pages: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
});

/**
 * Create a new folder
 */
export const createFolderTool = defineTool({
  name: 'create_folder',
  description: 'Create a new folder for organizing documentation.',
  inputSchema: z.object({
    path: z.string().describe('Path for the new folder (e.g., "Projects/NewProject")'),
  }),
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      await fileSystemService.createFolder(args.path);
      return {
        content: [{ type: 'text', text: `Successfully created folder: ${args.path}` }],
        structuredContent: { path: args.path, created: true },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to create folder: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
});

/**
 * Delete a folder
 */
export const deleteFolderTool = defineTool({
  name: 'delete_folder',
  description: 'Delete a folder and all its contents. This action cannot be undone!',
  inputSchema: z.object({
    path: z.string().describe('Path to the folder to delete'),
  }),
  annotations: {
    destructiveHint: true,
    idempotentHint: false,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      await fileSystemService.deleteFolder(args.path);
      return {
        content: [{ type: 'text', text: `Successfully deleted folder: ${args.path}` }],
        structuredContent: { path: args.path, deleted: true },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to delete folder: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
});

/**
 * Rename a folder
 */
export const renameFolderTool = defineTool({
  name: 'rename_folder',
  description: 'Rename a folder.',
  inputSchema: z.object({
    oldPath: z.string().describe('Current folder path'),
    newPath: z.string().describe('New folder path'),
  }),
  annotations: {
    destructiveHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      await fileSystemService.renameFolder(args.oldPath, args.newPath);
      return {
        content: [{ type: 'text', text: `Successfully renamed folder from ${args.oldPath} to ${args.newPath}` }],
        structuredContent: { oldPath: args.oldPath, newPath: args.newPath, renamed: true },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to rename folder: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
});
