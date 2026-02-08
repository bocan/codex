import { Request, Response } from "express";
import { fileSystemService, gitService } from "../index";

export const movePage = async (req: Request, res: Response) => {
  try {
    const { oldPath, newFolderPath } = req.body;

    if (!oldPath) {
      return res.status(400).json({ error: "oldPath is required" });
    }

    const newPath = await fileSystemService.movePage(
      oldPath,
      newFolderPath || "",
    );
    res.json({ success: true, newPath });
  } catch (error: any) {
    console.error("Move page error:", error);
    res.status(500).json({ error: error.message || "Failed to move page" });
  }
};

export const getPages = async (req: Request, res: Response) => {
  try {
    const folderPath = (req.query.folder as string) || "";
    const pages = await fileSystemService.getPages(folderPath);
    res.json(pages);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to get pages",
        message: (error as Error).message,
      });
  }
};

export const getPage = async (req: Request, res: Response) => {
  try {
    const pathParam = req.params.path;
    const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam;

    if (!path) {
      return res.status(400).json({ error: "Path is required" });
    }

    const content = await fileSystemService.getPageContent(path);
    res.json({ path, content });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to get page", message: (error as Error).message });
  }
};

export const createPage = async (req: Request, res: Response) => {
  try {
    const { path, content } = req.body;

    if (!path) {
      return res.status(400).json({ error: "Path is required" });
    }

    await fileSystemService.createPage(path, content || "");
    res.status(201).json({ message: "Page created successfully", path });
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to create page",
        message: (error as Error).message,
      });
  }
};

export const updatePage = async (req: Request, res: Response) => {
  try {
    const pathParam = req.params.path;
    const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam;
    const { content } = req.body;

    if (!path) {
      return res.status(400).json({ error: "Path is required" });
    }

    if (content === undefined) {
      return res.status(400).json({ error: "Content is required" });
    }

    await fileSystemService.updatePage(path, content);
    res.json({ message: "Page updated successfully", path });
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to update page",
        message: (error as Error).message,
      });
  }
};

export const deletePage = async (req: Request, res: Response) => {
  try {
    const pathParam = req.params.path;
    const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam;

    if (!path) {
      return res.status(400).json({ error: "Path is required" });
    }

    await fileSystemService.deletePage(path);
    res.json({ message: "Page deleted successfully", path });
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to delete page",
        message: (error as Error).message,
      });
  }
};

export const renamePage = async (req: Request, res: Response) => {
  try {
    const { oldPath, newPath } = req.body;

    if (!oldPath || !newPath) {
      return res
        .status(400)
        .json({ error: "Both oldPath and newPath are required" });
    }

    await fileSystemService.renamePage(oldPath, newPath);
    res.json({ message: "Page renamed successfully", oldPath, newPath });
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to rename page",
        message: (error as Error).message,
      });
  }
};

export const getPageHistory = async (req: Request, res: Response) => {
  try {
    const pathParam = req.params.path;
    const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam;

    if (!path) {
      return res.status(400).json({ error: "Path is required" });
    }

    const history = await gitService.getFileHistory(path);
    res.json(history);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to get page history",
        message: (error as Error).message,
      });
  }
};

export const getPageVersion = async (req: Request, res: Response) => {
  try {
    const pathParam = req.params.path;
    const hashParam = req.params.hash;
    const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam;
    const hash = Array.isArray(hashParam) ? hashParam.join("/") : hashParam;

    if (!path || !hash) {
      return res.status(400).json({ error: "Path and hash are required" });
    }

    const version = await gitService.getFileAtCommit(path, hash);

    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    res.json(version);
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to get page version",
        message: (error as Error).message,
      });
  }
};

export const restorePageVersion = async (req: Request, res: Response) => {
  try {
    const pathParam = req.params.path;
    const hashParam = req.params.hash;
    const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam;
    const hash = Array.isArray(hashParam) ? hashParam.join("/") : hashParam;

    if (!path || !hash) {
      return res.status(400).json({ error: "Path and hash are required" });
    }

    await gitService.restoreFileToCommit(path, hash);

    // Commit the restoration
    await gitService.commitFile(
      path,
      `Restored ${path} to version ${hash.substring(0, 7)}`,
    );

    res.json({ message: "Page restored successfully", path, hash });
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to restore page version",
        message: (error as Error).message,
      });
  }
};
