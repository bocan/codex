import { Router } from "express";
import * as templatesController from "../controllers/templatesController";
import { readLimiter } from "../middleware/rateLimiters";

const router = Router();

router.get("/", readLimiter, templatesController.getTemplates);

export default router;
