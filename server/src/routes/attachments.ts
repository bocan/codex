import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "../services/fileSystem";
import { fileTransferLimiter, fileOperationLimiter } from "../middleware/rateLimiters";

const router = Router();

/**
 * Validates and sanitizes a path to prevent path traversal attacks.
 * Ensures the resolved path is within the allowed base directory.
 * @param basePath - The base directory that should contain the final path
 * @param userPath - User-provided path component(s)
 * @returns The validated absolute path
 * @throws Error if path traversal is detected
 */
const validatePath = (basePath: string, ...userPath: string[]): string => {
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  // This IS the path validation function - it checks for traversal attacks
  const fullPath = path.resolve(basePath, ...userPath);
  const resolvedBase = path.resolve(basePath);

  // Ensure the resolved path is within the base directory
  if (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase) {
    throw new Error("Path traversal detected");
  }

  return fullPath;
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const folderPath = (req.query.folder as string) || "";

      // Validate path to prevent traversal
      const attachmentsDir = validatePath(DATA_DIR, folderPath, ".attachments");

      // Create .attachments directory if it doesn't exist
      await fs.mkdir(attachmentsDir, { recursive: true });
      cb(null, attachmentsDir);
    } catch (error) {
      cb(error as Error, "");
    }
  },
  filename: (req, file, cb) => {
    // Use original filename with timestamp to prevent collisions
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${timestamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Upload attachment
router.post("/", fileTransferLimiter, upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    res.json({
      name: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// List attachments for a folder
router.get("/", async (req: Request, res: Response) => {
  try {
    const folderPath = (req.query.folder as string) || "";

    // Validate path to prevent traversal
    const attachmentsDir = validatePath(DATA_DIR, folderPath, ".attachments");

    try {
      const files = await fs.readdir(attachmentsDir);
      const fileStats = await Promise.all(
        files.map(async (file) => {
          // Validate each file path
          const filePath = validatePath(attachmentsDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime,
          };
        }),
      );

      res.json(fileStats);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // Directory doesn't exist yet - return empty array
        return res.json([]);
      }
      throw error;
    }
  } catch (error) {
    console.error("List attachments error:", error);
    res.status(500).json({ error: "Failed to list attachments" });
  }
});

// Delete attachment
router.delete("/:filename", fileOperationLimiter, async (req: Request, res: Response) => {
  try {
    const folderPath = (req.query.folder as string) || "";
    const filenameParam = req.params.filename;

    if (!filenameParam || Array.isArray(filenameParam)) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const filename = filenameParam;

    // Validate path to prevent traversal - this validates both folderPath and filename
    const filePath = validatePath(DATA_DIR, folderPath, ".attachments", filename);

    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "File not found" });
    }
    if (error.message === "Path traversal detected") {
      return res.status(403).json({ error: "Invalid file path" });
    }
    console.error("Delete attachment error:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// Get/download attachment
router.get("/:filename", fileTransferLimiter, async (req: Request, res: Response) => {
  try {
    const folderPath = (req.query.folder as string) || "";
    const filenameParam = req.params.filename;

    if (!filenameParam || Array.isArray(filenameParam)) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const filename = filenameParam;

    // Validate path to prevent traversal - this validates both folderPath and filename
    const filePath = validatePath(DATA_DIR, folderPath, ".attachments", filename);

    // nosemgrep: javascript.express.security.audit.express-res-sendfile.express-res-sendfile
    // Safe: filePath has been validated by validatePath() to prevent directory traversal
    res.sendFile(filePath);
  } catch (error: any) {
    if (error.message === "Path traversal detected") {
      return res.status(403).json({ error: "Invalid file path" });
    }
    console.error("Get attachment error:", error);
    res.status(500).json({ error: "Failed to retrieve file" });
  }
});

export default router;
