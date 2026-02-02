/**
 * MCP Tools - Page Operations
 * Tools for reading, creating, updating, and deleting documentation pages.
 */

import { z } from 'zod';
import { defineTool } from './types';
import { fileSystemService } from '../../index';

/**
 * Search documentation pages
 */
export const searchPagesTool = defineTool({
  name: 'search_pages',
  description: 'Search across all documentation pages for a query string. Returns matching pages with snippets and match counts.',
  inputSchema: z.object({
    query: z.string().min(1).describe('Search query to find in page content'),
    maxResults: z.number().optional().default(20).describe('Maximum number of results to return'),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    const searchTerm = args.query.toLowerCase().trim();
    const results: Array<{
      path: string;
      title: string;
      snippet: string;
      matches: number;
    }> = [];

    // Get all folders recursively
    const getAllFolders = async (node: { path?: string; children?: Array<{ path?: string; children?: unknown[] }> }, folders: string[] = []): Promise<string[]> => {
      folders.push(node.path || '');
      if (node.children) {
        for (const child of node.children) {
          await getAllFolders(child as { path?: string; children?: Array<{ path?: string; children?: unknown[] }> }, folders);
        }
      }
      return folders;
    };

    const folderTree = await fileSystemService.getFolderTree();
    const allFolders = await getAllFolders(folderTree);

    for (const folderPath of allFolders) {
      const pages = await fileSystemService.getPages(folderPath);

      for (const page of pages) {
        if (context.signal?.aborted) {
          return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
        }

        try {
          const content = await fileSystemService.getPageContent(page.path);
          const lowerContent = content.toLowerCase();
          const parts = lowerContent.split(searchTerm);
          const matches = parts.length - 1;

          if (matches > 0) {
            const index = lowerContent.indexOf(searchTerm);
            const start = Math.max(0, index - 50);
            const end = Math.min(content.length, index + searchTerm.length + 50);
            let snippet = content.substring(start, end);

            if (start > 0) snippet = '...' + snippet;
            if (end < content.length) snippet = snippet + '...';

            results.push({
              path: page.path,
              title: page.name.replace('.md', ''),
              snippet,
              matches,
            });
          }
        } catch {
          // Skip pages that fail to read
        }
      }
    }

    results.sort((a, b) => b.matches - a.matches);
    const limitedResults = results.slice(0, args.maxResults);

    return {
      content: [{
        type: 'text',
        text: limitedResults.length > 0
          ? `Found ${results.length} matches:\n\n${limitedResults.map(r => `**${r.title}** (${r.path})\n${r.snippet}\n_${r.matches} matches_`).join('\n\n')}`
          : `No matches found for "${args.query}"`,
      }],
      structuredContent: { results: limitedResults, total: results.length },
    };
  },
});

/**
 * Get page content
 */
export const getPageTool = defineTool({
  name: 'get_page',
  description: 'Read the full content of a documentation page by its path.',
  inputSchema: z.object({
    path: z.string().describe('Path to the page (e.g., "folder/page.md" or "Welcome.md")'),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      const content = await fileSystemService.getPageContent(args.path);
      return {
        content: [{ type: 'text', text: content }],
        structuredContent: { path: args.path, content },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to read page: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
});

/**
 * Create a new page
 */
export const createPageTool = defineTool({
  name: 'create_page',
  description: 'Create a new documentation page with the specified content.',
  inputSchema: z.object({
    path: z.string().describe('Path for the new page (e.g., "folder/new-page.md")'),
    content: z.string().describe('Markdown content for the page'),
  }),
  annotations: {
    destructiveHint: false,
    idempotentHint: false,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      // Ensure path ends with .md
      const pagePath = args.path.endsWith('.md') ? args.path : `${args.path}.md`;
      await fileSystemService.createPage(pagePath, args.content);
      return {
        content: [{ type: 'text', text: `Successfully created page: ${pagePath}` }],
        structuredContent: { path: pagePath, created: true },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to create page: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
});

/**
 * Update an existing page
 */
export const updatePageTool = defineTool({
  name: 'update_page',
  description: 'Update the content of an existing documentation page. Replaces the entire content.',
  inputSchema: z.object({
    path: z.string().describe('Path to the page to update'),
    content: z.string().describe('New markdown content for the page'),
  }),
  annotations: {
    destructiveHint: true,
    idempotentHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      await fileSystemService.updatePage(args.path, args.content);
      return {
        content: [{ type: 'text', text: `Successfully updated page: ${args.path}` }],
        structuredContent: { path: args.path, updated: true },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to update page: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
});

/**
 * Delete a page
 */
export const deletePageTool = defineTool({
  name: 'delete_page',
  description: 'Delete a documentation page. This action cannot be undone (though Git history preserves it).',
  inputSchema: z.object({
    path: z.string().describe('Path to the page to delete'),
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
      await fileSystemService.deletePage(args.path);
      return {
        content: [{ type: 'text', text: `Successfully deleted page: ${args.path}` }],
        structuredContent: { path: args.path, deleted: true },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to delete page: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
});

/**
 * Rename a page
 */
export const renamePageTool = defineTool({
  name: 'rename_page',
  description: 'Rename a documentation page (changes filename only, not folder).',
  inputSchema: z.object({
    oldPath: z.string().describe('Current path of the page'),
    newPath: z.string().describe('New path for the page'),
  }),
  annotations: {
    destructiveHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      await fileSystemService.renamePage(args.oldPath, args.newPath);
      return {
        content: [{ type: 'text', text: `Successfully renamed page from ${args.oldPath} to ${args.newPath}` }],
        structuredContent: { oldPath: args.oldPath, newPath: args.newPath, renamed: true },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to rename page: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
});

/**
 * Move a page to a different folder
 */
export const movePageTool = defineTool({
  name: 'move_page',
  description: 'Move a documentation page to a different folder.',
  inputSchema: z.object({
    path: z.string().describe('Current path of the page'),
    newFolder: z.string().describe('Destination folder path (empty string for root)'),
  }),
  annotations: {
    destructiveHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      const newPath = await fileSystemService.movePage(args.path, args.newFolder);
      return {
        content: [{ type: 'text', text: `Successfully moved page to ${newPath}` }],
        structuredContent: { oldPath: args.path, newPath, moved: true },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to move page: ${(error as Error).message}` }],
        isError: true,
      };
    }
  },
});
