import { Router } from "express";
import * as folderController from "../controllers/folderController";
import { fileOperationLimiter, readLimiter } from "../middleware/rateLimiters";

const router = Router();

router.get("/", readLimiter, folderController.getFolderTree);
router.post("/", fileOperationLimiter, folderController.createFolder);
router.delete("/*path", fileOperationLimiter, folderController.deleteFolder);
router.put("/rename", fileOperationLimiter, folderController.renameFolder);
router.put("/move", fileOperationLimiter, folderController.moveFolder);

export default router;
