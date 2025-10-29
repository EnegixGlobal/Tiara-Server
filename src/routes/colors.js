import express from "express";
import {
  getColors,
  createColor,
  updateColor,
  deleteColor,
} from "../controllers/colors.js";

const router = express.Router();

router.route("/").get(getColors).post(createColor);
router.route("/:id").put(updateColor).delete(deleteColor);

export default router;

