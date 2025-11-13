import express from "express";
import {
  getAllUsers,
  getCoupons,
  createCoupon,
  deleteCoupon,
  getAllOrders,
  updateOrderStatus,
  getAllProducts,
  productStatus,
  deleteProduct,
  getAdminDetails,
} from "../controllers/admin.js";

const router = express.Router();

router.route("/users").get(getAllUsers);
router.route("/order").get(getAllOrders).put(updateOrderStatus);
router.route("/coupons").get(getCoupons).post(createCoupon);
router.route("/coupons/:id").delete(deleteCoupon);
router.route("/products").get(getAllProducts);
router.route("/product/:id").put(productStatus).delete(deleteProduct);
router.route("/info").get(getAdminDetails);

export default router;
