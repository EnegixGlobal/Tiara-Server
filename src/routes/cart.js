import express from "express";
import {
  addToCart,
  getCart,
  deleteCart,
  updateCart,
} from "../controllers/cart.js";

const router = express.Router();

router.route("/").get(getCart);
router.route("/add").post(addToCart);
router.route("/delete/:id").delete(deleteCart);
router.route("/update/:cartId").put(updateCart);

export default router;
