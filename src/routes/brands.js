import express from "express";
import {
  getAllBrands,
  createBrand,
  updateBrand,
} from "../controllers/brands.js";

const router = express.Router();

router.route("/").get(getAllBrands).post(createBrand);
router.route("/:id").put(updateBrand);

export default router;
