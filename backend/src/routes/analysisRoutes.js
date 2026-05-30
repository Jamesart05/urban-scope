import { Router } from "express";
import {
  createAnalysis,
  getAnalysis,
  listAnalyses,
} from "../controllers/analysisController.js";

const router = Router();

router.post("/analyze", createAnalysis);
router.get("/analyses", listAnalyses);
router.get("/analyses/:id", getAnalysis);

export default router;
