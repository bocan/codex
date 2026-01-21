import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "../services/fileSystem";

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const folderPath = (req.query.folder as string) || "";
      const attachmentsDir = path.join(DATA_DIR, folderPath, ".attachments");

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
router.post("/", upload.single("file"), async (req: Request, res: Response) => {
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
    const attachmentsDir = path.join(DATA_DIR, folderPath, ".attachments");

    try {
      const files = await fs.readdir(attachmentsDir);
      const fileStats = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(attachmentsDir, file);
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
router.delete("/:filename", async (req: Request, res: Response) => {
  try {
    const folderPath = (req.query.folder as string) || "";
    const filename = req.params.filename;
    const filePath = path.join(DATA_DIR, folderPath, ".attachments", filename);

    // Security check: ensure the file is within the attachments directory
    const resolvedPath = path.resolve(filePath);
    const attachmentsDir = path.resolve(
      path.join(DATA_DIR, folderPath, ".attachments"),
    );
    if (!resolvedPath.startsWith(attachmentsDir)) {
      return res.status(403).json({ error: "Invalid file path" });
    }

    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "File not found" });
    }
    console.error("Delete attachment error:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// Get/download attachment
router.get("/:filename", async (req: Request, res: Response) => {
  try {
    const folderPath = (req.query.folder as string) || "";
    const filename = req.params.filename;
    const filePath = path.join(DATA_DIR, folderPath, ".attachments", filename);

    // Security check
    const resolvedPath = path.resolve(filePath);
    const attachmentsDir = path.resolve(
      path.join(DATA_DIR, folderPath, ".attachments"),
    );
    if (!resolvedPath.startsWith(attachmentsDir)) {
      return res.status(403).json({ error: "Invalid file path" });
    }

    // Send file
    res.sendFile(resolvedPath);
  } catch (error) {
    console.error("Get attachment error:", error);
    res.status(500).json({ error: "Failed to retrieve file" });
  }
});

export default router;
