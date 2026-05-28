import { Router } from "express";
import { createAnalysis } from "../controllers/analysisController.js";

const router = Router();

router.post("/analyze", createAnalysis);

export default router;

