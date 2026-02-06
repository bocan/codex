import { Router } from "express";
import * as pageController from "../controllers/pageController";
import { fileOperationLimiter } from "../middleware/rateLimiters";

const router = Router();

// Specific routes must come before wildcard routes
router.get("/", pageController.getPages);
router.post("/", fileOperationLimiter, pageController.createPage);
router.put("/move", fileOperationLimiter, pageController.movePage);
router.put("/rename/file", fileOperationLimiter, pageController.renamePage);

// Wildcard routes - order matters!
// These need to check for specific suffixes before falling back to generic handlers
router.get("/:path(*)", (req, res, next) => {
  const path = req.params.path;

  // Check for /history suffix
  if (path.endsWith("/history")) {
    req.params.path = path.slice(0, -8); // Remove '/history'
    return pageController.getPageHistory(req, res);
  }

  // Check for /versions/:hash pattern
  const versionMatch = path.match(/^(.+)\/versions\/([a-f0-9]+)$/);
  if (versionMatch) {
    req.params.path = versionMatch[1];
    req.params.hash = versionMatch[2];
    return pageController.getPageVersion(req, res);
  }

  // Check for /restore/:hash pattern
  const restoreMatch = path.match(/^(.+)\/restore\/([a-f0-9]+)$/);
  if (restoreMatch) {
    req.params.path = restoreMatch[1];
    req.params.hash = restoreMatch[2];

    // Only allow POST for restore
    if (req.method === "POST") {
      return next(); // Will be handled by POST route
    }
  }

  // Default: get page
  return pageController.getPage(req, res);
});

router.post("/:path(*)", fileOperationLimiter, (req, res) => {
  const path = req.params.path;

  // Check for /restore/:hash pattern
  const restoreMatch = path.match(/^(.+)\/restore\/([a-f0-9]+)$/);
  if (restoreMatch) {
    req.params.path = restoreMatch[1];
    req.params.hash = restoreMatch[2];
    return pageController.restorePageVersion(req, res);
  }

  // No other POST operations supported on paths
  res.status(404).json({ error: "Not found" });
});

router.put("/:path(*)", fileOperationLimiter, pageController.updatePage);
router.delete("/:path(*)", fileOperationLimiter, pageController.deletePage);

export default router;
