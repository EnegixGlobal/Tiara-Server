import express from "express";
import {
  requestReturn,
  getAllReturns,
  approveReturn,
  rejectReturn,
  completeReturn,
  getUserReturns,
} from "../controllers/return.js";
import { verifyToken, adminOnly } from "../middleware/auth.js";

const router = express.Router();

// User routes (protected)
router.route("/request").post(verifyToken, requestReturn);
router.route("/my-returns").get(verifyToken, getUserReturns);

// Admin routes (protected)
router.route("/all").get(adminOnly, getAllReturns);
router.route("/approve").put(adminOnly, approveReturn);
router.route("/reject").put(adminOnly, rejectReturn);
router.route("/complete").put(adminOnly, completeReturn);

export default router;

