/**
 * MCP Tools - Attachment Operations
 * Tools for uploading, listing, and deleting file attachments.
 */

import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { defineTool } from './types';
import { DATA_DIR } from '../../services/fileSystem';

/**
 * Validates and sanitizes a path to prevent path traversal attacks.
 */
const validatePath = (basePath: string, ...userPath: string[]): string => {
  const fullPath = path.resolve(basePath, ...userPath);
  const resolvedBase = path.resolve(basePath);

  if (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase) {
    throw new Error('Path traversal detected');
  }

  return fullPath;
};

/**
 * List attachments in a folder
 */
export const listAttachmentsTool = defineTool({
  name: 'list_attachments',
  description: 'List all attachments in a folder. Attachments are stored in .attachments subdirectories.',
  inputSchema: z.object({
    folder: z.string().default('').describe('Folder path (empty for root)'),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      const attachmentsDir = validatePath(DATA_DIR, args.folder, '.attachments');

      try {
        const files = await fs.readdir(attachmentsDir);
        const fileStats = await Promise.all(
          files.map(async (file) => {
            const filePath = validatePath(attachmentsDir, file);
            const stats = await fs.stat(filePath);
            return {
              name: file,
              size: stats.size,
              modified: stats.mtime.toISOString(),
            };
          })
        );

        return {
          content: [{
            type: 'text',
            text: fileStats.length > 0
              ? `Found ${fileStats.length} attachment(s) in "${args.folder || 'root'}":\n\n${fileStats.map(f => `- **${f.name}** (${formatBytes(f.size)}, modified ${f.modified})`).join('\n')}`
              : `No attachments found in "${args.folder || 'root'}"`,
          }],
          structuredContent: { folder: args.folder, attachments: fileStats },
        };
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return {
            content: [{ type: 'text', text: `No attachments folder exists in "${args.folder || 'root'}"` }],
            structuredContent: { folder: args.folder, attachments: [] },
          };
        }
        throw error;
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to list attachments: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  },
});

/**
 * Upload an attachment (base64 encoded)
 */
export const uploadAttachmentTool = defineTool({
  name: 'upload_attachment',
  description: 'Upload a file attachment to a folder. The file content must be base64 encoded. Files are stored in .attachments subdirectory.',
  inputSchema: z.object({
    folder: z.string().default('').describe('Folder path to upload to (empty for root)'),
    filename: z.string().min(1).describe('Name for the file (e.g., "diagram.svg", "image.png")'),
    content: z.string().min(1).describe('Base64 encoded file content'),
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
      // Validate filename - no path separators allowed
      if (args.filename.includes('/') || args.filename.includes('\\') || args.filename.includes('..')) {
        return {
          content: [{ type: 'text', text: 'Invalid filename: cannot contain path separators or ".."' }],
          isError: true,
        };
      }

      const attachmentsDir = validatePath(DATA_DIR, args.folder, '.attachments');

      // Create .attachments directory if it doesn't exist
      await fs.mkdir(attachmentsDir, { recursive: true });

      // Add timestamp to prevent collisions
      const timestamp = Date.now();
      const ext = path.extname(args.filename);
      const basename = path.basename(args.filename, ext);
      const finalFilename = `${basename}-${timestamp}${ext}`;

      const filePath = validatePath(attachmentsDir, finalFilename);

      // Decode base64 and write file
      const buffer = Buffer.from(args.content, 'base64');
      await fs.writeFile(filePath, buffer);

      const relativePath = args.folder
        ? `${args.folder}/.attachments/${finalFilename}`
        : `.attachments/${finalFilename}`;

      return {
        content: [{
          type: 'text',
          text: `Successfully uploaded attachment:\n- **File:** ${finalFilename}\n- **Size:** ${formatBytes(buffer.length)}\n- **Path:** ${relativePath}\n\nReference in markdown: \`![${basename}](.attachments/${finalFilename})\``,
        }],
        structuredContent: {
          name: finalFilename,
          originalName: args.filename,
          size: buffer.length,
          folder: args.folder,
          path: relativePath,
          markdownRef: `![${basename}](.attachments/${finalFilename})`,
        },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to upload attachment: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  },
});

/**
 * Delete an attachment
 */
export const deleteAttachmentTool = defineTool({
  name: 'delete_attachment',
  description: 'Delete an attachment file from a folder.',
  inputSchema: z.object({
    folder: z.string().default('').describe('Folder path containing the attachment (empty for root)'),
    filename: z.string().min(1).describe('Name of the file to delete'),
  }),
  annotations: {
    destructiveHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      // Validate filename
      if (args.filename.includes('/') || args.filename.includes('\\') || args.filename.includes('..')) {
        return {
          content: [{ type: 'text', text: 'Invalid filename: cannot contain path separators or ".."' }],
          isError: true,
        };
      }

      const filePath = validatePath(DATA_DIR, args.folder, '.attachments', args.filename);

      await fs.unlink(filePath);

      return {
        content: [{
          type: 'text',
          text: `Successfully deleted attachment: ${args.filename}`,
        }],
        structuredContent: { deleted: true, filename: args.filename, folder: args.folder },
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          content: [{ type: 'text', text: `Attachment not found: ${args.filename}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Failed to delete attachment: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  },
});

/**
 * Get attachment content (base64 encoded)
 */
export const getAttachmentTool = defineTool({
  name: 'get_attachment',
  description: 'Get the content of an attachment file as base64. Useful for reading and transferring files.',
  inputSchema: z.object({
    folder: z.string().default('').describe('Folder path containing the attachment (empty for root)'),
    filename: z.string().min(1).describe('Name of the file to retrieve'),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (args, context) => {
    if (context.signal?.aborted) {
      return { content: [{ type: 'text', text: 'Operation cancelled' }], isError: true };
    }

    try {
      // Validate filename
      if (args.filename.includes('/') || args.filename.includes('\\') || args.filename.includes('..')) {
        return {
          content: [{ type: 'text', text: 'Invalid filename: cannot contain path separators or ".."' }],
          isError: true,
        };
      }

      const filePath = validatePath(DATA_DIR, args.folder, '.attachments', args.filename);

      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString('base64');
      const stats = await fs.stat(filePath);

      // Determine mime type from extension
      const ext = path.extname(args.filename).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      // For images, return as image content type
      if (mimeType.startsWith('image/')) {
        return {
          content: [
            { type: 'text', text: `Attachment: ${args.filename} (${formatBytes(stats.size)})` },
            { type: 'image', data: base64, mimeType },
          ],
          structuredContent: {
            filename: args.filename,
            folder: args.folder,
            size: stats.size,
            mimeType,
            base64,
          },
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Attachment: ${args.filename}\n- **Size:** ${formatBytes(stats.size)}\n- **Type:** ${mimeType}\n- **Base64 length:** ${base64.length} characters`,
        }],
        structuredContent: {
          filename: args.filename,
          folder: args.folder,
          size: stats.size,
          mimeType,
          base64,
        },
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          content: [{ type: 'text', text: `Attachment not found: ${args.filename}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Failed to get attachment: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  },
});

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
