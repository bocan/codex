import { Request, Response } from 'express';
import { FileSystemService } from '../services/fileSystem';

const fileSystemService = new FileSystemService();

export const searchPages = async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || query.trim().length === 0) {
      return res.json([]);
    }

    const searchTerm = query.toLowerCase().trim();
    const results: Array<{
      path: string;
      title: string;
      snippet: string;
      matches: number;
    }> = [];

    // Get all folders recursively
    const getAllFolders = async (node: any, folders: string[] = []): Promise<string[]> => {
      folders.push(node.path || '');
      if (node.children) {
        for (const child of node.children) {
          await getAllFolders(child, folders);
        }
      }
      return folders;
    };

    const folderTree = await fileSystemService.getFolderTree();
    const allFolders = await getAllFolders(folderTree);

    // Search all pages in all folders
    for (const folderPath of allFolders) {
      const pages = await fileSystemService.getPages(folderPath);

      for (const page of pages) {
        try {
          const content = await fileSystemService.getPageContent(page.path);
          const lowerContent = content.toLowerCase();

          // Count matches
          const matches = (lowerContent.match(new RegExp(searchTerm, 'g')) || []).length;

          if (matches > 0) {
            // Find snippet with context
            const index = lowerContent.indexOf(searchTerm);
            const start = Math.max(0, index - 50);
            const end = Math.min(content.length, index + searchTerm.length + 50);
            let snippet = content.substring(start, end);

            // Add ellipsis
            if (start > 0) snippet = '...' + snippet;
            if (end < content.length) snippet = snippet + '...';

            // Highlight the match with HTML <strong> tags
            const regex = new RegExp(`(${searchTerm})`, 'gi');
            snippet = snippet.replace(regex, '<strong>$1</strong>');

            results.push({
              path: page.path,
              title: page.name.replace('.md', ''),
              snippet,
              matches
            });
          }
        } catch (error) {
          console.error(`Error searching page ${page.path}:`, error);
        }
      }
    }

    // Sort by number of matches (most relevant first)
    results.sort((a, b) => b.matches - a.matches);

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};
