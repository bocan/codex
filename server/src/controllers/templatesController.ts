import { Request, Response } from "express";
import { fileSystemService } from "../index";

export const getTemplates = async (_req: Request, res: Response) => {
  try {
    const templates = await fileSystemService.getTemplates();
    res.json(templates);
  } catch (error) {
    console.error("Get templates error:", error);
    res.status(500).json({ error: "Failed to get templates" });
  }
};
