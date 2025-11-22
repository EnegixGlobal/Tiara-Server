import "dotenv/config";
import asyncErrorHandler from "express-async-handler";
import Razorpay from "razorpay";
import crypto from "crypto";
import order from "../models/order.js";
import user from "../models/user.js";
import product from "../models/product.js";
import Coupon from "../models/coupon.js";
import sendEmail from "../utils/sendEmail.js";

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

  // Apply coupon discount from database
  let discount = 0;
  let appliedCoupon = null;
  if (coupon && coupon !== "") {
    const couponCode = coupon.toUpperCase().trim();
    const couponDoc = await Coupon.findOne({ code: couponCode });

    if (couponDoc && couponDoc.isValid()) {
      const calculatedDiscount = couponDoc.calculateDiscount(subtotal);
      if (calculatedDiscount > 0) {
        discount = calculatedDiscount;
        appliedCoupon = couponDoc;
      }
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
      coupon: appliedCoupon ? appliedCoupon.code : null,
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
    const newOrder = await order.create({
      userId: notes.userId,
      paymentIntentId: razorpay_payment_id,
      paymentMethod: "online",
      products,
      subtotal: notes.subtotal,
      total: razorpayOrder.amount / 100,
      shipping: {
        email: notes.email,
        addressId: notes.addressId,
      },
      payment_status: "paid",
    });

    // Increment coupon redemption count if coupon was used
    if (notes.coupon) {
      const couponDoc = await Coupon.findOne({ code: notes.coupon });
      if (couponDoc) {
        await couponDoc.incrementRedemption();
      }
    }

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

    // Fetch complete order details with populated products for email
    const orderDetails = await order
      .findById(newOrder._id)
      .populate({
        path: "products.productId",
        select: "name price brand image color",
      })
      .populate({
        path: "userId",
        select: "name email addresses",
      });

    // Get shipping address
    let shippingAddress = null;
    if (notes.addressId && orderDetails.userId.addresses) {
      shippingAddress = orderDetails.userId.addresses.find(
        (addr) => addr._id.toString() === notes.addressId
      );
    }

    // Format order date
    const orderDate = new Date(orderDetails.createdAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Build product list HTML
    const productListHTML = orderDetails.products
      .map((item) => {
        const productInfo = item.productId;
        return `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <img src="${productInfo.image}" alt="${productInfo.name}" style="width: 60px; height: 60px; object-fit: contain; border-radius: 8px; background: #f3f4f6;" />
                <div>
                  <p style="margin: 0; font-weight: 600; color: #111827;">${productInfo.brand} ${productInfo.name}</p>
                  <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">Color: ${productInfo.color} | Size: UK ${item.size} | Qty: ${item.quantity}</p>
                </div>
              </div>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #111827;">₹${(productInfo.price * item.quantity).toFixed(2)}</td>
          </tr>
        `;
      })
      .join("");

    // Build address HTML
    const addressHTML = shippingAddress
      ? `
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-top: 8px;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #111827;">${shippingAddress.fullName}</p>
          <p style="margin: 0 0 4px 0; color: #374151;">${shippingAddress.addressLine1}</p>
          ${shippingAddress.addressLine2 ? `<p style="margin: 0 0 4px 0; color: #374151;">${shippingAddress.addressLine2}</p>` : ""}
          ${shippingAddress.landmark ? `<p style="margin: 0 0 4px 0; color: #374151;">Near ${shippingAddress.landmark}</p>` : ""}
          <p style="margin: 0; color: #374151;">${shippingAddress.city}, ${shippingAddress.state} - ${shippingAddress.pincode}</p>
          <p style="margin: 8px 0 0 0; color: #374151;">Phone: ${shippingAddress.phone}</p>
        </div>
      `
      : "<p style='color: #6b7280;'>Address not available</p>";

    // Calculate discount
    const discount = notes.discount || 0;
    const finalTotal = razorpayOrder.amount / 100;

    // Send order confirmation email
    try {
      await sendEmail({
        email: notes.email,
        subject: `Order Confirmation - Order #${newOrder._id.toString().slice(-8).toUpperCase()}`,
        message: `
          <div style="background-color: #FFF0E3; padding: 20px; font-family: Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);">
              <div style="padding: 30px;">
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #111827; margin: 0 0 10px 0; font-size: 28px;">Order Confirmed!</h1>
                  <p style="color: #6b7280; margin: 0;">Thank you for your purchase, ${orderDetails.userId.name}!</p>
                </div>

                <!-- Order Summary -->
                <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
                  <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 20px;">Order Summary</h2>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #6b7280;">Order ID:</span>
                    <span style="font-weight: 600; color: #111827;">#${newOrder._id.toString().slice(-8).toUpperCase()}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #6b7280;">Order Date:</span>
                    <span style="font-weight: 600; color: #111827;">${orderDate}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #6b7280;">Payment ID:</span>
                    <span style="font-weight: 600; color: #111827;">${razorpay_payment_id}</span>
                  </div>
                </div>

                <!-- Products -->
                <div style="margin-bottom: 24px;">
                  <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 20px;">Items Ordered</h2>
                  <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                      <tr style="background: #f3f4f6;">
                        <th style="padding: 12px; text-align: left; color: #374151; font-weight: 600;">Product</th>
                        <th style="padding: 12px; text-align: right; color: #374151; font-weight: 600;">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${productListHTML}
                    </tbody>
                  </table>
                </div>

                <!-- Price Breakdown -->
                <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
                  <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 20px;">Price Breakdown</h2>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #6b7280;">Subtotal:</span>
                    <span style="font-weight: 600; color: #111827;">₹${notes.subtotal.toFixed(2)}</span>
                  </div>
                  ${discount > 0 ? `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #10b981;">
                      <span>Discount:</span>
                      <span style="font-weight: 600;">-₹${discount.toFixed(2)}</span>
                    </div>
                  ` : ""}
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #6b7280;">Shipping:</span>
                    <span style="font-weight: 600; color: #111827;">Free</span>
                  </div>
                  <div style="border-top: 2px solid #e5e7eb; margin-top: 12px; padding-top: 12px; display: flex; justify-content: space-between;">
                    <span style="font-weight: 700; color: #111827; font-size: 18px;">Total:</span>
                    <span style="font-weight: 700; color: #111827; font-size: 18px;">₹${finalTotal.toFixed(2)}</span>
                  </div>
                </div>

                <!-- Shipping Address -->
                <div style="margin-bottom: 24px;">
                  <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 20px;">Shipping Address</h2>
                  ${addressHTML}
                </div>

                <!-- Payment Info -->
                <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; border-left: 4px solid #10b981; margin-bottom: 24px;">
                  <p style="margin: 0; color: #065f46; font-weight: 600;">✓ Payment Successful</p>
                  <p style="margin: 8px 0 0 0; color: #047857; font-size: 14px;">Your payment of ₹${finalTotal.toFixed(2)} has been successfully processed.</p>
                </div>

                <!-- Footer -->
                <div style="text-align: center; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                  <p style="color: #6b7280; margin: 0 0 8px 0; font-size: 14px;">We'll send you another email when your order ships.</p>
                  <p style="color: #6b7280; margin: 0; font-size: 14px;">If you have any questions, feel free to contact us.</p>
                  <p style="color: #111827; margin: 24px 0 0 0; font-weight: 600;">Thanks for shopping with Tiara Steps!</p>
                </div>
              </div>
            </div>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send order confirmation email:", emailError);
      // Don't fail the order creation if email fails
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
export const cashOnDelivery = asyncErrorHandler(async (req, res) => {
  const id = req.tokenId;
  const email = req.tokenEmail;
  const { coupon, addressId } = req.body;

  if (!addressId) {
    return res.status(400).json({
      success: false,
      message: "Delivery address is required for Cash on Delivery orders",
    });
  }

  const userObj = await user
    .findById(id)
    .populate({
      path: "cart.items.productId",
      select: "name price image brand sizeQuantity",
    })
    .select("cart name email addresses");

  if (!userObj || !userObj.cart || userObj.cart.items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Your cart is empty",
    });
  }

  const formattedCart = userObj.cart.items
    .map((item) => {
      if (!item.productId) return null;
      const sizeInfo = item.productId.sizeQuantity.find(
        (size) => size.size === item.size
      );
      const availableQty = sizeInfo ? sizeInfo.quantity : 0;
      const safeQty = Math.max(
        0,
        Math.min(item.qty, availableQty)
      );
      if (safeQty === 0) return null;

      return {
        productId: item.productId._id,
        name: `${item.productId.brand} ${item.productId.name}`,
        image: item.productId.image,
        qty: safeQty,
        size: item.size,
        price: item.productId.price,
      };
    })
    .filter(Boolean);

  if (formattedCart.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Selected items are unavailable in the requested quantities",
    });
  }

  const subtotal = formattedCart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  // Apply coupon discount from database
  let discount = 0;
  let appliedCoupon = null;
  if (coupon && coupon !== "") {
    const couponCode = coupon.toUpperCase().trim();
    const couponDoc = await Coupon.findOne({ code: couponCode });

    if (couponDoc && couponDoc.isValid()) {
      const calculatedDiscount = couponDoc.calculateDiscount(subtotal);
      if (calculatedDiscount > 0) {
        discount = calculatedDiscount;
        appliedCoupon = couponDoc;
      }
    }
  }

  const total = Math.max(subtotal - discount, 0);
  const shippingAddress = userObj.addresses?.find(
    (addr) => addr._id.toString() === addressId
  );

  if (!shippingAddress) {
    return res.status(404).json({
      success: false,
      message: "Selected address was not found",
    });
  }

  const codReference = `COD-${Date.now()}`;

  const newOrder = await order.create({
    userId: id,
    paymentIntentId: codReference,
    paymentMethod: "cod",
    products: formattedCart.map((item) => ({
      productId: item.productId,
      quantity: item.qty,
      size: item.size,
    })),
    subtotal,
    total,
    shipping: {
      email: email || userObj.email,
      addressId: shippingAddress._id,
      address: {
        fullName: shippingAddress.fullName,
        addressLine1: shippingAddress.addressLine1,
        addressLine2: shippingAddress.addressLine2,
        landmark: shippingAddress.landmark,
        city: shippingAddress.city,
        state: shippingAddress.state,
        pincode: shippingAddress.pincode,
        phone: shippingAddress.phone,
        addressType: shippingAddress.addressType,
      },
      method: "COD",
    },
    payment_status: "cod_pending",
  });

  // Update product quantities
  for (const item of formattedCart) {
    const productObj = await product.findById(item.productId);
    if (productObj) {
      productObj.sizeQuantity = productObj.sizeQuantity
        .map((size) => {
          if (size.size === item.size) {
            size.quantity -= item.qty;
          }
          return size;
        })
        .filter((size) => size.quantity > 0);
      await productObj.save();
    }
  }

  // Clear cart
  userObj.cart.items = [];
  userObj.cart.totalPrice = 0;
  await userObj.save();

  try {
    await sendEmail({
      email: email || userObj.email,
      subject: `Cash on Delivery Order Placed - #${newOrder._id
        .toString()
        .slice(-8)
        .toUpperCase()}`,
      message: `
        <div style="font-family: Arial, sans-serif; color: #111827;">
          <h2>Thanks for choosing Cash on Delivery!</h2>
          <p>Your order has been placed successfully. Please keep ₹${total.toFixed(
            2
          )} ready at the time of delivery.</p>
          <p><strong>Order ID:</strong> #${newOrder._id
            .toString()
            .slice(-8)
            .toUpperCase()}</p>
          <p><strong>Delivery Address:</strong> ${shippingAddress.fullName}, ${
        shippingAddress.addressLine1
      }, ${shippingAddress.city} - ${shippingAddress.pincode}</p>
        </div>
      `,
    });
  } catch (emailError) {
    console.error("Failed to send COD confirmation email:", emailError);
  }

  res.json({
    success: true,
    message: "Cash on Delivery order placed successfully",
    orderId: newOrder._id,
  });
});

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
