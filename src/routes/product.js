import express from "express";
import {
  createProduct,
  getProducts,
  getFilterOptions,
  getProduct,
  updateReview,
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
router.route("/options").get(getOptions);
router.route("/:slug").get(getProduct);

export default router;
