import express, { Express, Request, Response } from "express";
import session from "express-session";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import folderRoutes from "./routes/folders";
import pageRoutes from "./routes/pages";
import authRoutes from "./routes/auth";
import searchRoutes from "./routes/search";
import attachmentRoutes from "./routes/attachments";
import { requireAuth } from "./middleware/auth";
import { GitService } from "./services/gitService";
import { FileSystemService } from "./services/fileSystem";

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Initialize Git service
const DATA_DIR =
  process.env.TEST_DATA_DIR || path.join(__dirname, "../../data");
export let gitService = new GitService(DATA_DIR);
export let fileSystemService = new FileSystemService(DATA_DIR, gitService);

// Allow tests to override services
export function setServices(git: GitService, fs: FileSystemService) {
  gitService = git;
  fileSystemService = fs;
}

// Initialize Git repository on startup (skip in test mode)
if (!process.env.TEST_DATA_DIR) {
  (async () => {
    try {
      await gitService.initialize();
      await gitService.commitPendingChanges();
      console.log("Git repository initialized and pending changes committed");
    } catch (error) {
      console.error("Failed to initialize Git repository:", error);
    }
  })();
}

// Security middleware
app.use(helmet());

// HTTP request logging
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// CORS and body parsing
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true, // Allow cookies
  }),
);
app.use(express.json());
app.use(
  session({
    secret:
      process.env.SESSION_SECRET || "disnotion-dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

// API Documentation
app.get("/api", (req: Request, res: Response) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  res.json({
    name: "Disnotion API",
    version: "1.0.0",
    description: "A Notion-like wiki and document store API",
    baseUrl: baseUrl,
    endpoints: {
      folders: {
        "GET /api/folders": {
          description: "Get the complete folder tree",
          example: `curl ${baseUrl}/api/folders`,
        },
        "POST /api/folders": {
          description: "Create a new folder",
          body: { path: "folder-name or parent/subfolder" },
          example: `curl -X POST ${baseUrl}/api/folders -H "Content-Type: application/json" -d '{"path": "My Folder"}'`,
        },
        "DELETE /api/folders/:path": {
          description: "Delete a folder",
          example: `curl -X DELETE ${baseUrl}/api/folders/My%20Folder`,
        },
        "PUT /api/folders/rename": {
          description: "Rename a folder",
          body: { oldPath: "old-name", newPath: "new-name" },
          example: `curl -X PUT ${baseUrl}/api/folders/rename -H "Content-Type: application/json" -d '{"oldPath": "Old", "newPath": "New"}'`,
        },
      },
      pages: {
        "GET /api/pages": {
          description: "List all pages in a folder",
          query: { folder: "optional folder path" },
          example: `curl "${baseUrl}/api/pages?folder=My%20Folder"`,
        },
        "GET /api/pages/:path": {
          description: "Get page content",
          example: `curl ${baseUrl}/api/pages/My%20Folder/page.md`,
        },
        "POST /api/pages": {
          description: "Create a new page",
          body: { path: "folder/page.md", content: "markdown content" },
          example: `curl -X POST ${baseUrl}/api/pages -H "Content-Type: application/json" -d '{"path": "notes.md", "content": "# My Note"}'`,
        },
        "PUT /api/pages/:path": {
          description: "Update page content",
          body: { content: "updated markdown content" },
          example: `curl -X PUT ${baseUrl}/api/pages/notes.md -H "Content-Type: application/json" -d '{"content": "# Updated"}'`,
        },
        "DELETE /api/pages/:path": {
          description: "Delete a page",
          example: `curl -X DELETE ${baseUrl}/api/pages/notes.md`,
        },
        "PUT /api/pages/rename/file": {
          description: "Rename a page",
          body: { oldPath: "old.md", newPath: "new.md" },
          example: `curl -X PUT ${baseUrl}/api/pages/rename/file -H "Content-Type: application/json" -d '{"oldPath": "old.md", "newPath": "new.md"}'`,
        },
        "PUT /api/pages/move": {
          description: "Move a page to a different folder",
          body: { oldPath: "folder1/page.md", newFolderPath: "folder2" },
          returns: { success: true, newPath: "folder2/page.md" },
          example: `curl -X PUT ${baseUrl}/api/pages/move -H "Content-Type: application/json" -d '{"oldPath": "folder1/page.md", "newFolderPath": "folder2"}'`,
        },
      },
      auth: {
        "POST /api/auth/login": {
          description: "Login with password",
          body: { password: "your-password" },
          example: `curl -X POST ${baseUrl}/api/auth/login -H "Content-Type: application/json" -d '{"password": "your-password"}' -c cookies.txt`,
        },
        "POST /api/auth/logout": {
          description: "Logout and destroy session",
          example: `curl -X POST ${baseUrl}/api/auth/logout -b cookies.txt`,
        },
        "GET /api/auth/status": {
          description: "Check authentication status",
          example: `curl ${baseUrl}/api/auth/status -b cookies.txt`,
        },
      },
      attachments: {
        "POST /api/attachments": {
          description: "Upload an attachment file to a folder",
          body: 'multipart/form-data with "file" field and "folder" field',
          note: "Files are stored in .attachments subdirectory within the folder",
          example: `curl -X POST ${baseUrl}/api/attachments -F "file=@image.jpg" -F "folder=My Folder" -b cookies.txt`,
        },
        "GET /api/attachments": {
          description: "List all attachments in a folder",
          query: { folder: "folder path" },
          returns: "Array of file objects with name, size, and modified date",
          example: `curl "${baseUrl}/api/attachments?folder=My%20Folder" -b cookies.txt`,
        },
        "GET /api/attachments/:filename": {
          description: "Download or view an attachment",
          query: { folder: "folder path" },
          example: `curl "${baseUrl}/api/attachments/image.jpg?folder=My%20Folder" -b cookies.txt -o image.jpg`,
        },
        "DELETE /api/attachments/:filename": {
          description: "Delete an attachment",
          query: { folder: "folder path" },
          example: `curl -X DELETE "${baseUrl}/api/attachments/image.jpg?folder=My%20Folder" -b cookies.txt`,
        },
      },
      system: {
        "GET /api/health": {
          description: "Health check endpoint",
          example: `curl ${baseUrl}/api/health`,
        },
        "GET /api": {
          description: "This API documentation",
          example: `curl ${baseUrl}/api`,
        },
      },
    },
    tips: [
      "All folder and file paths are relative to the data directory",
      "Folders are created automatically when creating pages",
      'Use URL encoding for paths with spaces (e.g., "My Folder" → "My%20Folder")',
      "Content is stored as markdown files on the file system",
      "The API returns JSON for all endpoints except GET /api/pages/:path which returns the page object",
      "Attachments are stored in .attachments subdirectories and excluded from git",
      "Maximum attachment file size is 50MB",
      "Reference attachments in markdown with relative paths: ![alt](.attachments/filename.jpg)",
    ],
  });
});

// Routes
app.use("/api/auth", authRoutes); // Auth routes (public)
app.use("/api/folders", requireAuth, folderRoutes); // Protected
app.use("/api/pages", requireAuth, pageRoutes); // Protected
app.use("/api/search", requireAuth, searchRoutes); // Protected
app.use("/api/attachments", requireAuth, attachmentRoutes); // Protected

// Health check
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
