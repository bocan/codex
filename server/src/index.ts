import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import folderRoutes from './routes/folders';
import pageRoutes from './routes/pages';

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Documentation
app.get('/api', (req: Request, res: Response) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  res.json({
    name: 'Disnotion API',
    version: '1.0.0',
    description: 'A Notion-like wiki and document store API',
    baseUrl: baseUrl,
    endpoints: {
      folders: {
        'GET /api/folders': {
          description: 'Get the complete folder tree',
          example: `curl ${baseUrl}/api/folders`
        },
        'POST /api/folders': {
          description: 'Create a new folder',
          body: { path: 'folder-name or parent/subfolder' },
          example: `curl -X POST ${baseUrl}/api/folders -H "Content-Type: application/json" -d '{"path": "My Folder"}'`
        },
        'DELETE /api/folders/:path': {
          description: 'Delete a folder',
          example: `curl -X DELETE ${baseUrl}/api/folders/My%20Folder`
        },
        'PUT /api/folders/rename': {
          description: 'Rename a folder',
          body: { oldPath: 'old-name', newPath: 'new-name' },
          example: `curl -X PUT ${baseUrl}/api/folders/rename -H "Content-Type: application/json" -d '{"oldPath": "Old", "newPath": "New"}'`
        }
      },
      pages: {
        'GET /api/pages': {
          description: 'List all pages in a folder',
          query: { folder: 'optional folder path' },
          example: `curl "${baseUrl}/api/pages?folder=My%20Folder"`
        },
        'GET /api/pages/:path': {
          description: 'Get page content',
          example: `curl ${baseUrl}/api/pages/My%20Folder/page.md`
        },
        'POST /api/pages': {
          description: 'Create a new page',
          body: { path: 'folder/page.md', content: 'markdown content' },
          example: `curl -X POST ${baseUrl}/api/pages -H "Content-Type: application/json" -d '{"path": "notes.md", "content": "# My Note"}'`
        },
        'PUT /api/pages/:path': {
          description: 'Update page content',
          body: { content: 'updated markdown content' },
          example: `curl -X PUT ${baseUrl}/api/pages/notes.md -H "Content-Type: application/json" -d '{"content": "# Updated"}'`
        },
        'DELETE /api/pages/:path': {
          description: 'Delete a page',
          example: `curl -X DELETE ${baseUrl}/api/pages/notes.md`
        },
        'PUT /api/pages/rename/file': {
          description: 'Rename a page',
          body: { oldPath: 'old.md', newPath: 'new.md' },
          example: `curl -X PUT ${baseUrl}/api/pages/rename/file -H "Content-Type: application/json" -d '{"oldPath": "old.md", "newPath": "new.md"}'`
        },
        'PUT /api/pages/move': {
          description: 'Move a page to a different folder',
          body: { oldPath: 'folder1/page.md', newFolderPath: 'folder2' },
          returns: { success: true, newPath: 'folder2/page.md' },
          example: `curl -X PUT ${baseUrl}/api/pages/move -H "Content-Type: application/json" -d '{"oldPath": "folder1/page.md", "newFolderPath": "folder2"}'`
        }
      },
      system: {
        'GET /api/health': {
          description: 'Health check endpoint',
          example: `curl ${baseUrl}/api/health`
        },
        'GET /api': {
          description: 'This API documentation',
          example: `curl ${baseUrl}/api`
        }
      }
    },
    tips: [
      'All folder and file paths are relative to the data directory',
      'Folders are created automatically when creating pages',
      'Use URL encoding for paths with spaces (e.g., "My Folder" → "My%20Folder")',
      'Content is stored as markdown files on the file system',
      'The API returns JSON for all endpoints except GET /api/pages/:path which returns the page object'
    ]
  });
});

// Routes
app.use('/api/folders', folderRoutes);
app.use('/api/pages', pageRoutes);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
