import { Router } from "express";
import * as templatesController from "../controllers/templatesController";

const router = Router();

router.get("/", templatesController.getTemplates);

export default router;
