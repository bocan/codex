import { Router } from "express";
import * as pageController from "../controllers/pageController";
import { fileOperationLimiter } from "../middleware/rateLimiters";

const router = Router();

// Specific routes must come before wildcard routes
router.get("/", pageController.getPages);
router.post("/", fileOperationLimiter, pageController.createPage);
router.put("/move", fileOperationLimiter, pageController.movePage);
router.put("/rename/file", fileOperationLimiter, pageController.renamePage);

// Wildcard routes (path-to-regexp v8): use `/*name` for "rest of path"
// Order matters: more specific routes must come before the generic page handler.
router.get("/*path/history", pageController.getPageHistory);
router.get("/*path/versions/:hash", pageController.getPageVersion);
router.post(
  "/*path/restore/:hash",
  fileOperationLimiter,
  pageController.restorePageVersion,
);
router.get("/*path", pageController.getPage);
router.put("/*path", fileOperationLimiter, pageController.updatePage);
router.delete("/*path", fileOperationLimiter, pageController.deletePage);

export default router;
