import express from "express";
import { checkout } from "../controllers/payments.js";

const router = express.Router();

router.route("/create-checkout-session").post(checkout);

export default router;
