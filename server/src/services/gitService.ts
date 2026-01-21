import simpleGit, { SimpleGit, LogResult, DiffResult } from "simple-git";
import path from "path";
import fs from "fs/promises";

export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export interface VersionContent {
  hash: string;
  content: string;
  date: string;
  message: string;
  author: string;
}

export class GitService {
  private git!: SimpleGit;
  private dataDir: string;
  private commitQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /**
   * Wait for all pending commits to complete (useful in tests)
   */
  async waitForCommits(): Promise<void> {
    await this.commitQueue.catch(() => {});
  }

  /**
   * Initialize Git repository if it doesn't exist
   */
  async initialize(): Promise<void> {
    // Create git instance now that directory exists
    if (!this.git) {
      this.git = simpleGit({
        baseDir: this.dataDir,
        binary: "git",
        maxConcurrentProcesses: 6,
      });
    }

    const gitDir = path.join(this.dataDir, ".git");

    try {
      await fs.access(gitDir);
      // Git repo exists, check if it's valid
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        await this.git.init();
        await this.configureGit();
      }
    } catch {
      // .git directory doesn't exist, initialize
      await this.git.init();
      await this.configureGit();
    }
  }

  /**
   * Configure Git with default user if not set
   */
  private async configureGit(): Promise<void> {
    try {
      await this.git.addConfig("user.name", "Disnotion", false, "local");
      await this.git.addConfig("user.email", "disnotion@local", false, "local");
    } catch (_error) {
      // Config might already exist, that's fine
    }
  }

  /**
   * Check for and commit any uncommitted changes (e.g., manually added files)
   */
  async commitPendingChanges(): Promise<void> {
    const status = await this.git.status();

    if (status.files.length > 0) {
      await this.git.add(".");
      await this.git.commit("External changes detected");
    }
  }

  /**
   * Commit a file with a message
   */
  async commitFile(filePath: string, message: string): Promise<void> {
    // In test mode, commit directly (synchronously)
    if (process.env.TEST_DATA_DIR) {
      await this.git.add(filePath);
      await this.git.commit(message);
      return;
    }

    // In production, queue commits to prevent concurrent git operations
    const currentQueue = this.commitQueue;

    const newCommit = currentQueue
      .then(async () => {
        await this.git.add(filePath);
        await this.git.commit(message);
      })
      .catch((err) => {
        // Re-throw so calling code sees the error
        throw err;
      });

    this.commitQueue = newCommit.catch(() => {}); // Prevent one failure from blocking queue
    return newCommit;
  }

  /**
   * Commit multiple files with a message
   */
  async commitFiles(filePaths: string[], message: string): Promise<void> {
    if (filePaths.length === 0) return;

    // In test mode, commit directly (synchronously)
    if (process.env.TEST_DATA_DIR) {
      await this.git.add(filePaths);
      await this.git.commit(message);
      return;
    }

    // In production, queue commits to prevent concurrent git operations
    const currentQueue = this.commitQueue;

    const newCommit = currentQueue
      .then(async () => {
        await this.git.add(filePaths);
        await this.git.commit(message);
      })
      .catch((err) => {
        // Re-throw so calling code sees the error
        throw err;
      });

    this.commitQueue = newCommit.catch(() => {}); // Prevent one failure from blocking queue
    return newCommit;
  }

  /**
   * Get commit history for a specific file
   */
  async getFileHistory(filePath: string): Promise<CommitInfo[]> {
    try {
      const log: LogResult = await this.git.log({ file: filePath });

      return log.all.map((commit) => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author: commit.author_name,
      }));
    } catch (error) {
      // File might not have any commits yet
      return [];
    }
  }

  /**
   * Get file content at a specific commit
   */
  async getFileAtCommit(
    filePath: string,
    commitHash: string,
  ): Promise<VersionContent | null> {
    try {
      // Get the file content at this commit
      const content = await this.git.show([`${commitHash}:${filePath}`]);

      // Get commit info for this specific commit
      const commits = await this.git.log([commitHash, "-n", "1"]);

      if (commits.all.length === 0) {
        return null;
      }

      const commit = commits.all[0];

      return {
        hash: commitHash,
        content,
        date: commit.date,
        message: commit.message,
        author: commit.author_name,
      };
    } catch (error) {
      console.error("Error getting file at commit:", error);
      return null;
    }
  }

  /**
   * Get diff between two commits for a file
   */
  async getDiff(
    filePath: string,
    fromCommit: string,
    toCommit: string,
  ): Promise<string> {
    try {
      const diff = await this.git.diff([
        `${fromCommit}..${toCommit}`,
        "--",
        filePath,
      ]);
      return diff;
    } catch (error) {
      return "";
    }
  }

  /**
   * Restore a file to a specific commit
   */
  async restoreFileToCommit(
    filePath: string,
    commitHash: string,
  ): Promise<void> {
    await this.git.checkout([commitHash, "--", filePath]);
  }
}
