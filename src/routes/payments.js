import express from "express";
import { checkout, verifyPayment, cashOnDelivery } from "../controllers/payments.js";

const router = express.Router();

router.route("/create-order").post(checkout);
router.route("/verify-payment").post(verifyPayment);
router.route("/cash-on-delivery").post(cashOnDelivery);

export default router;
