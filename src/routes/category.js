import express from "express";
import {
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/category.js";

const router = express.Router();

router.route("/").get(getCategory).post(createCategory);
router.route("/:id").put(updateCategory).delete(deleteCategory);

export default router;
