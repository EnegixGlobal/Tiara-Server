import express from "express";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  checkWishlist,
} from "../controllers/wishlist.js";

const router = express.Router();

router.route("/").get(getWishlist);
router.route("/add").post(addToWishlist);
router.route("/remove/:productId").delete(removeFromWishlist);
router.route("/check/:productId").get(checkWishlist);

export default router;

