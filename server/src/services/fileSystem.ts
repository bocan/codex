import fs from "fs/promises";
import path from "path";
import { GitService } from "./gitService";
import { CacheService } from "./cache";

export const DATA_DIR = path.join(__dirname, "../../..", "data");

export interface FolderNode {
  name: string;
  path: string;
  type: "folder";
  children: FolderNode[];
}

export interface FileNode {
  name: string;
  path: string;
  type: "file";
  createdAt: string;
  modifiedAt: string;
}

export class FileSystemService {
  private dataDir: string;
  private gitService: GitService | null;
  private cache: CacheService;

  constructor(
    dataDir: string = DATA_DIR,
    gitService: GitService | null = null,
  ) {
    this.dataDir = dataDir;
    this.gitService = gitService;

    // Allow cache TTL to be configured via environment variable (default 30 seconds)
    const cacheTTL = process.env.CACHE_TTL_MS
      ? parseInt(process.env.CACHE_TTL_MS)
      : 30000;
    this.cache = new CacheService(cacheTTL);
  }

  async initialize(): Promise<void> {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
    }
  }

  async getFolderTree(relativePath: string = ""): Promise<FolderNode> {
    // Check cache first
    const cacheKey = `folder-tree:${relativePath}`;
    const cached = this.cache.get<FolderNode>(cacheKey);
    if (cached) {
      return cached;
    }

    const fullPath = path.join(this.dataDir, relativePath);
    const stats = await fs.stat(fullPath);

    if (!stats.isDirectory()) {
      throw new Error("Path is not a directory");
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const children: FolderNode[] = [];

    // Parallelize subdirectory scanning for better performance
    const childPromises = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry) => {
        const childPath = path.join(relativePath, entry.name);
        return this.getFolderTree(childPath);
      });

    children.push(...(await Promise.all(childPromises)));

    const result = {
      name: relativePath === "" ? "root" : path.basename(relativePath),
      path: relativePath || "/",
      type: "folder" as const,
      children: children.sort((a, b) => a.name.localeCompare(b.name)),
    };

    // Cache the result
    this.cache.set(cacheKey, result);
    return result;
  }

  async createFolder(relativePath: string): Promise<void> {
    const fullPath = path.join(this.dataDir, relativePath);
    await fs.mkdir(fullPath, { recursive: true });

    // Invalidate folder tree cache
    this.cache.invalidate("folder-tree:");
  }

  async deleteFolder(relativePath: string): Promise<void> {
    if (!relativePath || relativePath === "/" || relativePath === ".") {
      throw new Error("Cannot delete root folder");
    }
    const fullPath = path.join(this.dataDir, relativePath);
    await fs.rm(fullPath, { recursive: true, force: true });

    // Invalidate folder tree and any pages in this folder
    this.cache.invalidate("folder-tree:");
    this.cache.invalidate(`pages:${relativePath}`);
    this.cache.invalidate(`page:${relativePath}`);
  }

  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    const oldFullPath = path.join(this.dataDir, oldPath);
    const newFullPath = path.join(this.dataDir, newPath);
    await fs.rename(oldFullPath, newFullPath);

    // Invalidate folder tree and pages caches
    this.cache.invalidate("folder-tree:");
    this.cache.invalidate(`pages:${oldPath}`);
    this.cache.invalidate(`page:${oldPath}`);
  }

  async getPages(folderPath: string = ""): Promise<FileNode[]> {
    // Check cache first
    const cacheKey = `pages:${folderPath}`;
    const cached = this.cache.get<FileNode[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const fullPath = path.join(this.dataDir, folderPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const pages: FileNode[] = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const filePath = path.join(fullPath, entry.name);
        const stats = await fs.stat(filePath);
        pages.push({
          name: entry.name,
          path: path.join(folderPath, entry.name),
          type: "file",
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    }

    const result = pages.sort((a, b) => a.name.localeCompare(b.name));

    // Cache the result
    this.cache.set(cacheKey, result);
    return result;
  }

  async createPage(relativePath: string, content: string = ""): Promise<void> {
    const fullPath = path.join(this.dataDir, relativePath);

    // Ensure the directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, "utf-8");

    // Invalidate caches
    const folderPath = path.dirname(relativePath);
    this.cache.invalidate(`pages:${folderPath}`);
    this.cache.invalidateKey(`page:${relativePath}`);

    // Commit the new page (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFile(
          relativePath,
          `Created page: ${relativePath}`,
        );
      } else {
        // In production, fire and forget
        this.gitService
          .commitFile(relativePath, `Created page: ${relativePath}`)
          .catch((err) => console.error("Git commit failed:", err));
      }
    }
  }

  async getPageContent(relativePath: string): Promise<string> {
    // Check cache first
    const cacheKey = `page:${relativePath}`;
    const cached = this.cache.get<string>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const fullPath = path.join(this.dataDir, relativePath);
    const content = await fs.readFile(fullPath, "utf-8");

    // Cache the content
    this.cache.set(cacheKey, content);
    return content;
  }

  async updatePage(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.dataDir, relativePath);
    await fs.writeFile(fullPath, content, "utf-8");

    // Invalidate page cache
    this.cache.invalidateKey(`page:${relativePath}`);

    // Commit the update (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFile(
          relativePath,
          `Updated page: ${relativePath}`,
        );
      } else {
        // In production, fire and forget
        this.gitService
          .commitFile(relativePath, `Updated page: ${relativePath}`)
          .catch((err) => console.error("Git commit failed:", err));
      }
    }
  }

  async deletePage(relativePath: string): Promise<void> {
    const fullPath = path.join(this.dataDir, relativePath);
    await fs.unlink(fullPath);

    // Invalidate caches
    const folderPath = path.dirname(relativePath);
    this.cache.invalidate(`pages:${folderPath}`);
    this.cache.invalidateKey(`page:${relativePath}`);

    // Commit the deletion (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFile(
          relativePath,
          `Deleted page: ${relativePath}`,
        );
      } else {
        // In production, fire and forget
        this.gitService
          .commitFile(relativePath, `Deleted page: ${relativePath}`)
          .catch((err) => console.error("Git commit failed:", err));
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

    // Invalidate caches for both old and new paths
    const oldFolderPath = path.dirname(oldPath);
    const newFolderPath = path.dirname(newPath);
    this.cache.invalidate(`pages:${oldFolderPath}`);
    this.cache.invalidate(`pages:${newFolderPath}`);
    this.cache.invalidateKey(`page:${oldPath}`);
    this.cache.invalidateKey(`page:${newPath}`);

    // Commit the rename (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFiles(
          [oldPath, newPath],
          `Renamed page: ${oldPath} → ${newPath}`,
        );
      } else {
        // In production, fire and forget
        this.gitService
          .commitFiles(
            [oldPath, newPath],
            `Renamed page: ${oldPath} → ${newPath}`,
          )
          .catch((err) => console.error("Git commit failed:", err));
      }
    }
  }

  async movePage(oldPath: string, newFolderPath: string): Promise<string> {
    const oldFullPath = path.join(this.dataDir, oldPath);
    const fileName = path.basename(oldPath);
    const newPath = newFolderPath
      ? path.join(newFolderPath, fileName)
      : fileName;
    const newFullPath = path.join(this.dataDir, newPath);

    // Check if source file exists
    await fs.access(oldFullPath);

    // Ensure the destination directory exists
    const newDir = path.dirname(newFullPath);
    await fs.mkdir(newDir, { recursive: true });

    // Check if destination file already exists
    try {
      await fs.access(newFullPath);
      throw new Error(
        "A file with this name already exists in the destination folder",
      );
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    await fs.rename(oldFullPath, newFullPath);

    // Invalidate caches for both old and new locations
    const oldFolderPath = path.dirname(oldPath);
    this.cache.invalidate(`pages:${oldFolderPath}`);
    this.cache.invalidate(`pages:${newFolderPath}`);
    this.cache.invalidateKey(`page:${oldPath}`);
    this.cache.invalidateKey(`page:${newPath}`);

    // Commit the move (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFiles(
          [oldPath, newPath],
          `Moved page: ${oldPath} → ${newPath}`,
        );
      } else {
        // In production, fire and forget
        this.gitService
          .commitFiles(
            [oldPath, newPath],
            `Moved page: ${oldPath} → ${newPath}`,
          )
          .catch((err) => console.error("Git commit failed:", err));
      }
    }

    return newPath;
  }
}
