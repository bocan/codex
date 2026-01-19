import fs from 'fs/promises';
import path from 'path';
import { GitService } from './gitService';

const DATA_DIR = path.join(__dirname, '../../..', 'data');

export interface FolderNode {
  name: string;
  path: string;
  type: 'folder';
  children: FolderNode[];
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file';
}

export class FileSystemService {
  private dataDir: string;
  private gitService: GitService | null;

  constructor(dataDir: string = DATA_DIR, gitService: GitService | null = null) {
    this.dataDir = dataDir;
    this.gitService = gitService;
  }

  async initialize(): Promise<void> {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
    }
  }

  async getFolderTree(relativePath: string = ''): Promise<FolderNode> {
    const fullPath = path.join(this.dataDir, relativePath);
    const stats = await fs.stat(fullPath);

    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const children: FolderNode[] = [];

    for (const entry of entries) {
      // Skip hidden folders like .git
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const childPath = path.join(relativePath, entry.name);
        const child = await this.getFolderTree(childPath);
        children.push(child);
      }
    }

    return {
      name: relativePath === '' ? 'root' : path.basename(relativePath),
      path: relativePath || '/',
      type: 'folder',
      children: children.sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  async createFolder(relativePath: string): Promise<void> {
    const fullPath = path.join(this.dataDir, relativePath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  async deleteFolder(relativePath: string): Promise<void> {
    if (!relativePath || relativePath === '/' || relativePath === '.') {
      throw new Error('Cannot delete root folder');
    }
    const fullPath = path.join(this.dataDir, relativePath);
    await fs.rm(fullPath, { recursive: true, force: true });
  }

  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    const oldFullPath = path.join(this.dataDir, oldPath);
    const newFullPath = path.join(this.dataDir, newPath);
    await fs.rename(oldFullPath, newFullPath);
  }

  async getPages(folderPath: string = ''): Promise<FileNode[]> {
    const fullPath = path.join(this.dataDir, folderPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const pages: FileNode[] = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        pages.push({
          name: entry.name,
          path: path.join(folderPath, entry.name),
          type: 'file'
        });
      }
    }

    return pages.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createPage(relativePath: string, content: string = ''): Promise<void> {
    const fullPath = path.join(this.dataDir, relativePath);

    // Ensure the directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, 'utf-8');

    // Commit the new page (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFile(relativePath, `Created page: ${relativePath}`);
      } else {
        // In production, fire and forget
        this.gitService.commitFile(relativePath, `Created page: ${relativePath}`).catch(err =>
          console.error('Git commit failed:', err)
        );
      }
    }
  }

  async getPageContent(relativePath: string): Promise<string> {
    const fullPath = path.join(this.dataDir, relativePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  async updatePage(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.dataDir, relativePath);
    await fs.writeFile(fullPath, content, 'utf-8');

    // Commit the update (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFile(relativePath, `Updated page: ${relativePath}`);
      } else {
        // In production, fire and forget
        this.gitService.commitFile(relativePath, `Updated page: ${relativePath}`).catch(err =>
          console.error('Git commit failed:', err)
        );
      }
    }
  }

  async deletePage(relativePath: string): Promise<void> {
    const fullPath = path.join(this.dataDir, relativePath);
    await fs.unlink(fullPath);

    // Commit the deletion (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFile(relativePath, `Deleted page: ${relativePath}`);
      } else {
        // In production, fire and forget
        this.gitService.commitFile(relativePath, `Deleted page: ${relativePath}`).catch(err =>
          console.error('Git commit failed:', err)
        );
      }
    }
  }

  async renamePage(oldPath: string, newPath: string): Promise<void> {
    const oldFullPath = path.join(this.dataDir, oldPath);
    const newFullPath = path.join(this.dataDir, newPath);

    // Ensure the new directory exists
    const newDir = path.dirname(newFullPath);
    await fs.mkdir(newDir, { recursive: true });

    await fs.rename(oldFullPath, newFullPath);

    // Commit the rename (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFiles([oldPath, newPath], `Renamed page: ${oldPath} → ${newPath}`);
      } else {
        // In production, fire and forget
        this.gitService.commitFiles([oldPath, newPath], `Renamed page: ${oldPath} → ${newPath}`).catch(err =>
          console.error('Git commit failed:', err)
        );
      }
    }
  }

  async movePage(oldPath: string, newFolderPath: string): Promise<string> {
    const oldFullPath = path.join(this.dataDir, oldPath);
    const fileName = path.basename(oldPath);
    const newPath = newFolderPath ? path.join(newFolderPath, fileName) : fileName;
    const newFullPath = path.join(this.dataDir, newPath);

    // Check if source file exists
    await fs.access(oldFullPath);

    // Ensure the destination directory exists
    const newDir = path.dirname(newFullPath);
    await fs.mkdir(newDir, { recursive: true });

    // Check if destination file already exists
    try {
      await fs.access(newFullPath);
      throw new Error('A file with this name already exists in the destination folder');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.rename(oldFullPath, newFullPath);

    // Commit the move (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFiles([oldPath, newPath], `Moved page: ${oldPath} → ${newPath}`);
      } else {
        // In production, fire and forget
        this.gitService.commitFiles([oldPath, newPath], `Moved page: ${oldPath} → ${newPath}`).catch(err =>
          console.error('Git commit failed:', err)
        );
      }
    }

    return newPath;
  }
}
