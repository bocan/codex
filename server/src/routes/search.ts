import { Router } from "express";
import { searchPages } from "../controllers/searchController";
import { searchLimiter } from "../middleware/rateLimiters";

const router = Router();

router.get("/", searchLimiter, searchPages);

export default router;
