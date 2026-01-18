import { Request, Response } from 'express';
import fileSystemService from '../services/fileSystem';

export const getFolderTree = async (req: Request, res: Response) => {
  try {
    const tree = await fileSystemService.getFolderTree();
    res.json(tree);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get folder tree', message: (error as Error).message });
  }
};

export const createFolder = async (req: Request, res: Response) => {
  try {
    const { path } = req.body;

    if (!path) {
      return res.status(400).json({ error: 'Path is required' });
    }

    await fileSystemService.createFolder(path);
    res.status(201).json({ message: 'Folder created successfully', path });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create folder', message: (error as Error).message });
  }
};

export const deleteFolder = async (req: Request, res: Response) => {
  try {
    const { path } = req.params;

    if (!path) {
      return res.status(400).json({ error: 'Path is required' });
    }

    await fileSystemService.deleteFolder(path);
    res.json({ message: 'Folder deleted successfully', path });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete folder', message: (error as Error).message });
  }
};

export const renameFolder = async (req: Request, res: Response) => {
  try {
    const { oldPath, newPath } = req.body;

    if (!oldPath || !newPath) {
      return res.status(400).json({ error: 'Both oldPath and newPath are required' });
    }

    await fileSystemService.renameFolder(oldPath, newPath);
    res.json({ message: 'Folder renamed successfully', oldPath, newPath });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rename folder', message: (error as Error).message });
  }
};
