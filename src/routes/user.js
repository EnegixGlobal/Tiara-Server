import express from "express";
import {
  register,
  login,
  verifyUser,
  getOrder,
  adminLogin,
  forgetPassword,
  changeResetPassword,
} from "../controllers/user.js";

const router = express.Router();

router.route("/register").post(register);
router.route("/login").post(login);
router.route("/adminLogin").post(adminLogin);
router.route("/verify").get(verifyUser);
router.route("/orders").get(getOrder);
router.route("/forgetpassword/:email").get(forgetPassword);
router.route("/resetpassword").post(changeResetPassword);

export default router;
