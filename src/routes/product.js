import express from "express";
import {
  createProduct,
  getProducts,
  getFilterOptions,
  getProduct,
  updateReview,
  editReview,
  deleteReview,
  getFeaturedProducts,
  updateProduct,
} from "../controllers/product.js";
import { verifyToken, adminOnly } from "../middleware/auth.js";
import { getOptions } from "../controllers/brands.js";

const router = express.Router();

router.route("/featured").get(getFeaturedProducts);
router.route("/create").post(adminOnly, createProduct);
router.route("/update/:slug").put(adminOnly, updateProduct);
router.route("/filter").get(getProducts);
router.route("/filterOptions").get(getFilterOptions);
router.route("/review").put(verifyToken, updateReview);
router.route("/review/edit").put(verifyToken, editReview);
router.route("/review/delete").delete(verifyToken, deleteReview);
router.route("/options").get(getOptions);
router.route("/:slug").get(getProduct);

export default router;
