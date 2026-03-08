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

export interface TemplateDefinition {
  path: string;
  template: string;
  autoname: boolean;
  content: string;
}

function parseFrontmatter(raw: string): {
  frontmatter: { template?: string; autoname?: boolean };
  content: string;
} {
  if (!raw?.startsWith("---\n")) {
    return { frontmatter: {}, content: raw };
  }

  const endIndex = raw.indexOf("\n---", 4);
  if (endIndex === -1) {
    return { frontmatter: {}, content: raw };
  }

  const fmBlock = raw.slice(4, endIndex).trim();
  const rest = raw.slice(endIndex + "\n---".length);
  const content = rest.startsWith("\n") ? rest.slice(1) : rest;

  const frontmatter: { template?: string; autoname?: boolean } = {};
  for (const line of fmBlock.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    const valueRaw = match[2].trim();
    const value = valueRaw.replace(/^['"]|['"]$/g, "");

    if (key === "template") {
      frontmatter.template = value;
    } else if (key === "autoname") {
      frontmatter.autoname = value.toLowerCase() === "true";
    }
  }

  return { frontmatter, content };
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

  /**
   * Validates that a path is within the data directory to prevent path traversal attacks.
   * @param relativePath - User-provided relative path
   * @returns The validated absolute path
   * @throws Error if path traversal is detected
   */
  private validatePath(relativePath: string): string {
    // Strip leading slashes to ensure it's treated as relative
    let normalizedPath = relativePath.replace(/^\/+/, '');

    // Normalize empty paths and root indicators
    if (!normalizedPath || normalizedPath === "/" || normalizedPath === ".") {
      normalizedPath = "";
    }

    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    // This IS the path validation function - it checks for traversal attacks
    const fullPath = path.resolve(this.dataDir, normalizedPath);
    const resolvedDataDir = path.resolve(this.dataDir);

    // Use path.relative to check if the path is within the data directory
    // If the relative path starts with "..", it's trying to escape
    const relativeToDataDir = path.relative(resolvedDataDir, fullPath);
    const isOutside = relativeToDataDir.startsWith("..") || path.isAbsolute(relativeToDataDir);

    if (isOutside) {
      throw new Error("Invalid path: path traversal detected");
    }

    return fullPath;
  }

  async initialize(): Promise<void> {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
    }

    await this.syncBuiltinDocsIfConfigured();
    await this.seedTemplatesIfConfigured();
  }

  private async syncBuiltinDocsIfConfigured(): Promise<void> {
    if (process.env.CODEX_SYNC_BUILTIN_DOCS !== "true") {
      return;
    }

    const seedDir = process.env.CODEX_SYNC_BUILTIN_DOCS_DIR;
    if (!seedDir) {
      return;
    }

    const sourceReadme = path.join(seedDir, "Codex Documentation", "README.md");
    const destReadmeRelative = path.join("Codex Documentation", "README.md");

    try {
      const destDir = this.validatePath("Codex Documentation");
      await fs.mkdir(destDir, { recursive: true });

      const destReadme = this.validatePath(destReadmeRelative);
      await fs.copyFile(sourceReadme, destReadme);

      // Invalidate caches that might be affected
      this.cache.invalidate("folder-tree:");
      this.cache.invalidate("pages:Codex Documentation");
      this.cache.invalidate(`page:${destReadmeRelative}`);
    } catch {
      // Best-effort sync; ignore failures to avoid blocking startup
    }
  }

  private async seedTemplatesIfConfigured(): Promise<void> {
    if (process.env.CODEX_SEED_TEMPLATES !== "true") {
      return;
    }

    const seedDir = process.env.CODEX_SEED_TEMPLATES_DIR;
    if (!seedDir) {
      return;
    }

    const templatesDir = this.validatePath("templates");

    let shouldSeed: boolean;
    try {
      const entries = await fs.readdir(templatesDir, { withFileTypes: true });
      // Seed only when the directory is empty (ignore dotfiles like .DS_Store)
      const visibleEntries = entries.filter((entry) => !entry.name.startsWith("."));
      shouldSeed = visibleEntries.length === 0;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        shouldSeed = true;
      } else {
        return;
      }
    }

    if (!shouldSeed) {
      return;
    }

    try {
      await fs.mkdir(templatesDir, { recursive: true });
      const seedEntries = await fs.readdir(seedDir, { withFileTypes: true });
      const templateFiles = seedEntries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
        .map((entry) => entry.name);

      for (const filename of templateFiles) {
        const sourcePath = path.join(seedDir, filename);
        const destPath = path.join(templatesDir, filename);
        try {
          await fs.access(destPath);
          // Don't overwrite existing files
          continue;
        } catch {
          // ok
        }

        await fs.copyFile(sourcePath, destPath);
      }

      // Invalidate caches that might be affected
      this.cache.invalidate("folder-tree:");
      this.cache.invalidate("pages:templates");
    } catch {
      // Best-effort seeding; ignore failures to avoid blocking startup
    }
  }

  async getFolderTree(relativePath: string = ""): Promise<FolderNode> {
    // Check cache first
    const cacheKey = `folder-tree:${relativePath}`;
    const cached = this.cache.get<FolderNode>(cacheKey);
    if (cached) {
      return cached;
    }

    const fullPath = this.validatePath(relativePath);
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
        // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
        // Safe: entry.name comes from fs.readdir, not user input
        const childPath = path.join(relativePath, entry.name);
        return this.getFolderTree(childPath);
      });

    children.push(...(await Promise.all(childPromises)));

    const result = {
      name: relativePath === "" ? "root" : path.basename(relativePath),
      path: relativePath || "",
      type: "folder" as const,
      children: children.sort((a, b) => a.name.localeCompare(b.name)),
    };

    // Cache the result
    this.cache.set(cacheKey, result);
    return result;
  }

  async createFolder(relativePath: string): Promise<void> {
    const fullPath = this.validatePath(relativePath);
    await fs.mkdir(fullPath, { recursive: true });

    // Invalidate folder tree cache
    this.cache.invalidate("folder-tree:");
  }

  async deleteFolder(relativePath: string): Promise<void> {
    if (!relativePath || relativePath === "/" || relativePath === ".") {
      throw new Error("Cannot delete root folder");
    }
    const fullPath = this.validatePath(relativePath);
    await fs.rm(fullPath, { recursive: true, force: true });

    // Invalidate folder tree and any pages in this folder
    this.cache.invalidate("folder-tree:");
    this.cache.invalidate(`pages:${relativePath}`);
    this.cache.invalidate(`page:${relativePath}`);
  }

  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    const oldFullPath = this.validatePath(oldPath);
    const newFullPath = this.validatePath(newPath);
    await fs.rename(oldFullPath, newFullPath);

    // Invalidate folder tree and pages caches
    this.cache.invalidate("folder-tree:");
    this.cache.invalidate(`pages:${oldPath}`);
    this.cache.invalidate(`page:${oldPath}`);
  }

  async moveFolder(sourcePath: string, destinationParentPath: string): Promise<string> {
    if (!sourcePath || sourcePath === "/" || sourcePath === ".") {
      throw new Error("Cannot move root folder");
    }

    const resolvedDataDir = path.resolve(this.dataDir);

    // Validate BOTH user-supplied paths up front — validatePath throws immediately on
    // any traversal attempt, producing safe absolute paths.
    const sourceFullPath = this.validatePath(sourcePath);
    const destParentFullPath = destinationParentPath
      ? this.validatePath(destinationParentPath)
      : resolvedDataDir;

    // Verify source exists and is a directory.
    if (!sourceFullPath.startsWith(resolvedDataDir + path.sep)) {
      throw new Error("Invalid path: source is outside data directory");
    }
    let sourceStat;
    try {
      sourceStat = await fs.stat(sourceFullPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        throw new Error(`Source folder does not exist: ${sourcePath}`);
      }
      throw error;
    }
    if (!sourceStat.isDirectory()) {
      throw new Error(`${sourcePath} is not a folder`);
    }

    // Derive the folder name from the VALIDATED absolute path (not from the raw
    // user string).  path.basename is a CodeQL-recognised sanitiser that strips
    // any remaining directory components.
    const folderName = path.basename(sourceFullPath);

    // Build the destination absolute path entirely from validated components.
    // destParentFullPath was validated above; folderName came from path.basename.
    const newFullPath = path.join(destParentFullPath, folderName);

    // Relative path (for cache keys and return value) — derived from absolute paths.
    const newRelativePath = path.relative(resolvedDataDir, newFullPath);

    // Prevent moving a folder into itself or a descendant (compare absolute paths).
    if (newFullPath === sourceFullPath ||
        newFullPath.startsWith(sourceFullPath + path.sep)) {
      throw new Error("Cannot move a folder into itself or one of its subfolders");
    }

    // Check destination doesn't already exist — guard immediately before the fs call.
    if (!newFullPath.startsWith(resolvedDataDir + path.sep)) {
      throw new Error("Invalid path: destination is outside data directory");
    }
    try {
      await fs.access(newFullPath);
      throw new Error(`A folder already exists at: ${newRelativePath}`);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        throw error;
      }
      // ENOENT means destination doesn't exist — that's what we want
    }

    // Ensure the destination parent directory exists — guard immediately before the fs call.
    if (!destParentFullPath.startsWith(resolvedDataDir + path.sep) &&
        destParentFullPath !== resolvedDataDir) {
      throw new Error("Invalid path: destination parent is outside data directory");
    }
    // Append path.sep so that an exact match on resolvedDataDir also satisfies startsWith
    const safeDestParent = destParentFullPath.startsWith(resolvedDataDir + path.sep)
      ? destParentFullPath
      : resolvedDataDir;
    await fs.mkdir(safeDestParent, { recursive: true });

    // Guard both paths immediately before rename.
    if (!sourceFullPath.startsWith(resolvedDataDir + path.sep)) {
      throw new Error("Invalid path: source is outside data directory");
    }
    if (!newFullPath.startsWith(resolvedDataDir + path.sep)) {
      throw new Error("Invalid path: destination is outside data directory");
    }
    await fs.rename(sourceFullPath, newFullPath);

    // Invalidate all related caches
    this.cache.invalidate("folder-tree:");
    this.cache.invalidate(`pages:${sourcePath}`);
    this.cache.invalidate(`page:${sourcePath}`);
    this.cache.invalidate(`pages:${newRelativePath}`);

    // Commit the move — uses add --all because the entire folder tree changes
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        await this.gitService.commitAllChanges(
          `Moved folder: ${sourcePath} → ${newRelativePath}`,
        );
      } else {
        this.gitService
          .commitAllChanges(`Moved folder: ${sourcePath} → ${newRelativePath}`)
          .catch((err) => console.error("Git commit failed:", err));
      }
    }

    return newRelativePath;
  }

  async getPages(folderPath: string = ""): Promise<FileNode[]> {
    // Check cache first
    const cacheKey = `pages:${folderPath}`;
    const cached = this.cache.get<FileNode[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const fullPath = this.validatePath(folderPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const pages: FileNode[] = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
        // Safe: entry.name comes from fs.readdir, not user input; fullPath already validated
        const filePath = path.join(fullPath, entry.name);
        const stats = await fs.stat(filePath);
        pages.push({
          name: entry.name,
          // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
          // Safe: entry.name comes from fs.readdir, not user input
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

  async getTemplates(): Promise<TemplateDefinition[]> {
    try {
      const pages = await this.getPages("templates");
      const templates: TemplateDefinition[] = [];

      for (const page of pages) {
        const raw = await this.getPageContent(page.path);
        const parsed = parseFrontmatter(raw);
        if (!parsed.frontmatter.template) continue;

        templates.push({
          path: page.path,
          template: parsed.frontmatter.template,
          autoname: parsed.frontmatter.autoname === true,
          content: parsed.content,
        });
      }

      return templates.sort((a, b) => a.template.localeCompare(b.template));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async createPage(relativePath: string, content: string = ""): Promise<void> {
    const fullPath = this.validatePath(relativePath);

    // Ensure the directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, "utf-8");

    // Invalidate caches - use validated relative path
    const validatedRelative = path.relative(this.dataDir, fullPath);
    const folderPath = path.dirname(validatedRelative);
    this.cache.invalidate(`pages:${folderPath}`);
    this.cache.invalidateKey(`page:${validatedRelative}`);

    // Commit the new page (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFile(
          validatedRelative,
          `Created page: ${validatedRelative}`,
        );
      } else {
        // In production, fire and forget
        this.gitService
          .commitFile(validatedRelative, `Created page: ${validatedRelative}`)
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

    const fullPath = this.validatePath(relativePath);
    const content = await fs.readFile(fullPath, "utf-8");

    // Cache the content
    this.cache.set(cacheKey, content);
    return content;
  }

  async updatePage(relativePath: string, content: string): Promise<void> {
    const fullPath = this.validatePath(relativePath);
    await fs.writeFile(fullPath, content, "utf-8");

    // Invalidate page cache - use validated relative path
    const validatedRelative = path.relative(this.dataDir, fullPath);
    this.cache.invalidateKey(`page:${validatedRelative}`);

    // Commit the update (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFile(
          validatedRelative,
          `Updated page: ${validatedRelative}`,
        );
      } else {
        // In production, fire and forget
        this.gitService
          .commitFile(validatedRelative, `Updated page: ${validatedRelative}`)
          .catch((err) => console.error("Git commit failed:", err));
      }
    }
  }

  async deletePage(relativePath: string): Promise<void> {
    const fullPath = this.validatePath(relativePath);
    await fs.unlink(fullPath);

    // Invalidate caches - use validated relative path
    const validatedRelative = path.relative(this.dataDir, fullPath);
    const folderPath = path.dirname(validatedRelative);
    this.cache.invalidate(`pages:${folderPath}`);
    this.cache.invalidateKey(`page:${validatedRelative}`);

    // Commit the deletion (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFile(
          validatedRelative,
          `Deleted page: ${validatedRelative}`,
        );
      } else {
        // In production, fire and forget
        this.gitService
          .commitFile(validatedRelative, `Deleted page: ${validatedRelative}`)
          .catch((err) => console.error("Git commit failed:", err));
      }
    }
  }

  async renamePage(oldPath: string, newPath: string): Promise<void> {
    const oldFullPath = this.validatePath(oldPath);
    const newFullPath = this.validatePath(newPath);

    // Ensure the new directory exists
    const newDir = path.dirname(newFullPath);
    await fs.mkdir(newDir, { recursive: true });

    await fs.rename(oldFullPath, newFullPath);

    // Invalidate caches - use validated relative paths
    const oldRelative = path.relative(this.dataDir, oldFullPath);
    const newRelative = path.relative(this.dataDir, newFullPath);
    const oldFolderPath = path.dirname(oldRelative);
    const newFolderPath = path.dirname(newRelative);
    this.cache.invalidate(`pages:${oldFolderPath}`);
    this.cache.invalidate(`pages:${newFolderPath}`);
    this.cache.invalidateKey(`page:${oldRelative}`);
    this.cache.invalidateKey(`page:${newRelative}`);

    // Commit the rename (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFiles(
          [oldRelative, newRelative],
          `Renamed page: ${oldRelative} → ${newRelative}`,
        );
      } else {
        // In production, fire and forget
        this.gitService
          .commitFiles(
            [oldRelative, newRelative],
            `Renamed page: ${oldRelative} → ${newRelative}`,
          )
          .catch((err) => console.error("Git commit failed:", err));
      }
    }
  }

  async movePage(oldPath: string, newFolderPath: string): Promise<string> {
    // Validate paths first to prevent path traversal
    const oldFullPath = this.validatePath(oldPath);
    const fileName = path.basename(oldFullPath); // Use validated path
    const newPath = newFolderPath
      ? path.join(newFolderPath, fileName)
      : fileName;
    const newFullPath = this.validatePath(newPath);

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
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await fs.rename(oldFullPath, newFullPath);

    // Invalidate caches - use validated paths relative to dataDir
    const oldRelative = path.relative(this.dataDir, oldFullPath);
    const newRelative = path.relative(this.dataDir, newFullPath);
    const oldFolderPath = path.dirname(oldRelative);
    const newFolderRelative = path.relative(this.dataDir, newDir);

    this.cache.invalidate(`pages:${oldFolderPath}`);
    this.cache.invalidate(`pages:${newFolderRelative}`);
    this.cache.invalidateKey(`page:${oldRelative}`);
    this.cache.invalidateKey(`page:${newRelative}`);

    // Commit the move (non-blocking in production, blocking in tests)
    if (this.gitService) {
      if (process.env.TEST_DATA_DIR) {
        // In test mode, wait for commit and let errors propagate
        await this.gitService.commitFiles(
          [oldRelative, newRelative],
          `Moved page: ${oldRelative} → ${newRelative}`,
        );
      } else {
        // In production, fire and forget
        this.gitService
          .commitFiles(
            [oldRelative, newRelative],
            `Moved page: ${oldRelative} → ${newRelative}`,
          )
          .catch((err) => console.error("Git commit failed:", err));
      }
    }

    return newRelative;
  }
}
