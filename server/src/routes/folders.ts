import { Router } from "express";
import * as folderController from "../controllers/folderController";
import { fileOperationLimiter } from "../middleware/rateLimiters";

const router = Router();

router.get("/", folderController.getFolderTree);
router.post("/", fileOperationLimiter, folderController.createFolder);
router.delete("/*path", fileOperationLimiter, folderController.deleteFolder);
router.put("/rename", fileOperationLimiter, folderController.renameFolder);

export default router;
