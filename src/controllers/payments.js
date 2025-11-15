import "dotenv/config";
import asyncErrorHandler from "express-async-handler";
import Razorpay from "razorpay";
import crypto from "crypto";
import order from "../models/order.js";
import user from "../models/user.js";
import product from "../models/product.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Razorpay Order
export const checkout = asyncErrorHandler(async (req, res) => {
  const id = req.tokenId;
  const email = req.tokenEmail;
  const { coupon, addressId } = req.body;

  const cartObj = await user
    .findById(id)
    .populate({
      path: "cart.items.productId",
      select: "name price image brand sizeQuantity",
    })
    .select("cart name email");

  const formattedCart = cartObj.cart.items.map((item) => {
    const sizeQty = item.productId.sizeQuantity.filter(
      (size) => size.size === item.size
    )[0].quantity;

    return {
      productId: item.productId._id,
      name: `${item.productId.brand} ${item.productId.name}`,
      image: item.productId.image,
      qty: item.qty > sizeQty ? sizeQty : item.qty,
      size: item.size,
      price: item.productId.price,
    };
  });

  // Calculate total amount
  const subtotal = formattedCart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  // Apply coupon discount (simple implementation - you can enhance this)
  let discount = 0;
  if (coupon && coupon !== "") {
    const validCoupons = ["SUMILSUTHAR197", "NIKE2024"];
    if (validCoupons.includes(coupon.toUpperCase())) {
      discount = 200; // Fixed discount amount
    }
  }

  const total = Math.round((subtotal - discount) * 100); // Convert to paise

  // Create Razorpay order
  // Receipt must be max 40 characters, so we use a shortened format
  const timestamp = Date.now();
  const shortId = id.toString().slice(-8); // Last 8 chars of ObjectId
  const receipt = `RCP${timestamp}${shortId}`; // Format: RCP + timestamp + last 8 chars of ID (max 24 chars)
  
  const options = {
    amount: total,
    currency: "INR",
    receipt: receipt,
    notes: {
      userId: id,
      email: email,
      cart: JSON.stringify(
        formattedCart.map((item) => ({
          productId: item.productId.toString(),
          qty: item.qty,
          size: item.size,
        }))
      ),
      subtotal: subtotal,
      discount: discount,
      addressId: addressId || null,
    },
  };

  try {
    const razorpayOrder = await razorpay.orders.create(options);

    // Format product details for display in payment modal
    const productDetails = formattedCart.map((item) => ({
      name: item.name,
      quantity: item.qty,
      size: item.size,
      price: item.price,
      total: item.price * item.qty,
      image: item.image,
    }));

    res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      products: productDetails,
      subtotal: subtotal,
      discount: discount,
      total: subtotal - discount,
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment order",
      error: error.message,
    });
  }
});

// Verify Payment and Create Order
// This is the PRIMARY payment verification method (called from frontend after payment)
// Webhooks are optional and only serve as a backup verification mechanism
export const verifyPayment = asyncErrorHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;
  const id = req.tokenId;

  // Verify signature
  const generated_signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (generated_signature !== razorpay_signature) {
    return res.status(400).json({
      success: false,
      message: "Payment verification failed",
    });
  }

  try {
    // Fetch order details from Razorpay
    const razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
    const notes = razorpayOrder.notes;

    const products = JSON.parse(notes.cart).map((item) => ({
      productId: item.productId,
      quantity: item.qty,
      size: item.size,
    }));

    // Create order in database
    await order.create({
      userId: notes.userId,
      paymentIntentId: razorpay_payment_id,
      products,
      subtotal: notes.subtotal,
      total: razorpayOrder.amount / 100,
      shipping: {
        email: notes.email,
        addressId: notes.addressId,
      },
      payment_status: "paid",
    });

    // Clear user cart
    const userObj = await user.findById(notes.userId);
    userObj.cart.items = [];
    userObj.cart.totalPrice = 0;
    await userObj.save();

    // Update product quantities
    for (const item of products) {
      const productObj = await product.findById(item.productId);
      if (productObj) {
        productObj.sizeQuantity = productObj.sizeQuantity.map((size) => {
          if (size.size === item.size) {
            size.quantity -= item.quantity;
          }
          return size;
        }).filter((size) => size.quantity > 0);
        await productObj.save();
      }
    }

    res.json({
      success: true,
      message: "Payment verified and order created successfully",
      orderId: razorpay_order_id,
    });
  } catch (error) {
    console.error("Order creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create order",
      error: error.message,
    });
  }
});

// Razorpay Webhook Handler
// NOTE: Webhooks are OPTIONAL. The payment flow works without webhooks because:
// 1. Payment is verified server-side in verifyPayment() after user completes payment
// 2. Order is created immediately after verification
// Webhooks are only useful for:
// - Backup verification if frontend verification fails
// - Handling edge cases (payment captured but frontend didn't call verifyPayment)
// - Real-time order updates without user interaction
export const webhook = asyncErrorHandler(async (request, response) => {
  // Webhook secret is optional - if not set, webhook will still work but without signature verification
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // Get raw body as string for signature verification
  const rawBody = request.body.toString();

  // Only verify signature if webhook secret is configured
  if (webhookSecret) {
    const receivedSignature = request.headers["x-razorpay-signature"];

    if (!receivedSignature) {
      console.log("⚠️  Webhook signature missing.");
      return response.status(400).send("Missing signature");
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (receivedSignature !== expectedSignature) {
      console.log("⚠️  Webhook signature verification failed.");
      return response.status(400).send("Invalid signature");
    }
  } else {
    console.log("⚠️  Webhook received but RAZORPAY_WEBHOOK_SECRET not configured. Processing without signature verification.");
  }

  // Parse JSON from raw body
  const body = JSON.parse(rawBody);
  const event = body.event;
  const payment = body.payload?.payment?.entity;

  try {
    switch (event) {
      case "payment.captured":
        // Payment was successfully captured
        console.log("Payment captured:", payment.id);
        break;
      case "payment.failed":
        // Payment failed
        console.log("Payment failed:", payment.id);
        break;
      case "order.paid":
        // Order was paid
        console.log("Order paid:", request.body.payload.order?.entity?.id);
        break;
      default:
        console.log("Unhandled event:", event);
    }

    response.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    response.status(500).send("Webhook processing failed");
  }
});
