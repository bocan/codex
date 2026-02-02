/**
 * MCP Resources
 * Exposes documentation content as MCP resources for AI access.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fileSystemService } from '../index';
import { config } from './config';

/**
 * Register all resources with an MCP server instance
 */
export function registerResources(server: McpServer): void {
  // Resource template for pages - allows dynamic URI resolution
  const pageTemplate = new ResourceTemplate(
    'codex://page/{path}',
    {
      list: async () => {
        // List all available pages from root folder
        const pages = await fileSystemService.getPages('');
        return {
          resources: pages.map((page: { name: string; path: string }) => ({
            uri: `codex://page/${encodeURIComponent(page.path)}`,
            name: page.name,
            description: `Documentation page: ${page.path}`,
            mimeType: 'text/markdown',
          })),
        };
      },
    }
  );

  server.registerResource(
    'Documentation Page',
    pageTemplate,
    {
      description: 'A markdown documentation page from the Codex wiki',
      mimeType: 'text/markdown',
    },
    async (uri: URL, _variables) => {
      // Extract path from URI: codex://page/folder/file.md -> folder/file.md
      const pagePath = decodeURIComponent(uri.pathname.replace(/^\//, ''));

      try {
        const content = await fileSystemService.getPageContent(pagePath);
        return {
          contents: [{
            uri: uri.toString(),
            mimeType: 'text/markdown',
            text: content,
          }],
        };
      } catch (error) {
        throw new Error(`Page not found: ${pagePath}`);
      }
    }
  );

  // Static resource: folder tree
  server.registerResource(
    'Folder Structure',
    'codex://folders',
    {
      description: 'The complete folder tree of the documentation',
      mimeType: 'application/json',
    },
    async () => {
      const tree = await fileSystemService.getFolderTree();
      return {
        contents: [{
          uri: 'codex://folders',
          mimeType: 'application/json',
          text: JSON.stringify(tree, null, 2),
        }],
      };
    }
  );

  if (config.debug) {
    console.log('[MCP] Registered resources: codex://page/{path}, codex://folders');
  }
}
