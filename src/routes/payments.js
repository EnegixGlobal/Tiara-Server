import express from "express";
import { checkout, verifyPayment } from "../controllers/payments.js";

const router = express.Router();

router.route("/create-order").post(checkout);
router.route("/verify-payment").post(verifyPayment);

export default router;
