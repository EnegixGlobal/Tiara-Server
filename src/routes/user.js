import express from "express";
import {
  register,
  login,
  verifyUser,
  getOrder,
  adminLogin,
  forgetPassword,
  changeResetPassword,
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  updateProfile,
} from "../controllers/user.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

router.route("/register").post(register);
router.route("/login").post(login);
router.route("/adminLogin").post(adminLogin);
router.route("/verify").get(verifyUser);
router.route("/orders").get(getOrder);
router.route("/forgetpassword/:email").get(forgetPassword);
router.route("/resetpassword").post(changeResetPassword);

// Profile route (protected)
router.route("/profile").put(verifyToken, updateProfile);

// Address routes (protected)
router.route("/address").post(verifyToken, addAddress).get(verifyToken, getAddresses);
router.route("/address/:addressId").put(verifyToken, updateAddress).delete(verifyToken, deleteAddress);

export default router;
