import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import order from "../models/order.js";
import product from "../models/product.js";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Request Return for a product in an order
export const requestReturn = asyncErrorHandler(async (req, res, next) => {
  const userId = req.tokenId;
  const { orderId, productId, reason, returnQuantity } = req.body;

  if (!orderId || !productId || !reason || !returnQuantity) {
    return next(new errorHandler("Please provide all required fields", 400));
  }

  const orderObj = await order.findById(orderId);
  if (!orderObj) {
    return next(new errorHandler("Order not found", 404));
  }

  if (orderObj.userId.toString() !== userId.toString()) {
    return next(new errorHandler("Unauthorized access", 403));
  }

  // Check if order is delivered (handle variations like "order Delivered", "delivered", etc.)
  const deliveryStatus = (orderObj.delivery_status || "").toLowerCase().trim();
  if (!deliveryStatus.includes("delivered")) {
    return next(
      new errorHandler("You can only return items from delivered orders", 400)
    );
  }

  // Find the product in the order
  const productItem = orderObj.products.find(
    (p) => p.productId.toString() === productId.toString()
  );

  if (!productItem) {
    return next(new errorHandler("Product not found in this order", 404));
  }

  // Check if return quantity is valid
  if (returnQuantity > productItem.quantity) {
    return next(
      new errorHandler(
        "Return quantity cannot exceed ordered quantity",
        400
      )
    );
  }

  // Check if return is already requested or processed
  const returnStatus = productItem.returnRequest?.status || "none";
  if (returnStatus !== "none") {
    return next(
      new errorHandler(
        `Return already ${returnStatus}`,
        400
      )
    );
  }

  // Check if order is within return window (e.g., 7 days from delivery)
  const orderDate = new Date(orderObj.updatedAt || orderObj.createdAt);
  const daysSinceOrder = Math.floor(
    (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceOrder > 7) {
    return next(
      new errorHandler(
        "Return window has expired. Returns are only allowed within 7 days of delivery",
        400
      )
    );
  }

  // Update return request
  productItem.returnRequest = {
    status: "requested",
    reason,
    requestedAt: new Date(),
    returnQuantity,
  };

  await orderObj.save();

  res.status(200).json({
    success: true,
    message: "Return request submitted successfully",
  });
});

// Get all return requests (for admin)
export const getAllReturns = asyncErrorHandler(async (req, res, next) => {
  const { page = 1, limit = 10, status } = req.query;

  // Build query to find orders with return requests
  const query = {
    "products.returnRequest.status": { $ne: "none" },
  };

  if (status && status !== "all") {
    query["products.returnRequest.status"] = status;
  }

  const orders = await order
    .find(query)
    .populate({ path: "userId", select: "name email" })
    .populate({
      path: "products.productId",
      select: "name price brand image slug color",
    })
    .sort("-createdAt")
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  // Format return requests
  const returnRequests = [];
  orders.forEach((ord) => {
    ord.products.forEach((prod) => {
      if (prod.returnRequest.status !== "none") {
        returnRequests.push({
          _id: `${ord._id}_${prod._id}`,
          orderId: ord._id,
          productItemId: prod._id,
          user: {
            name: ord.userId.name,
            email: ord.userId.email,
          },
          product: {
            _id: prod.productId._id,
            name: `${prod.productId.brand} ${prod.productId.name}`,
            image: prod.productId.image,
            color: prod.productId.color,
            size: prod.size,
            price: prod.productId.price,
            orderedQuantity: prod.quantity,
          },
          returnRequest: {
            status: prod.returnRequest.status,
            reason: prod.returnRequest.reason,
            returnQuantity: prod.returnRequest.returnQuantity,
            requestedAt: prod.returnRequest.requestedAt,
            approvedAt: prod.returnRequest.approvedAt,
            returnedAt: prod.returnRequest.returnedAt,
            refundId: prod.returnRequest.refundId,
          },
          orderTotal: ord.total,
          paymentMethod: ord.paymentMethod,
          paymentIntentId: ord.paymentIntentId,
          orderDate: ord.createdAt,
        });
      }
    });
  });

  const count = returnRequests.length;

  res.status(200).json({
    success: true,
    returns: returnRequests,
    count,
  });
});

// Approve Return Request
export const approveReturn = asyncErrorHandler(async (req, res, next) => {
  const { orderId, productItemId } = req.body;

  if (!orderId || !productItemId) {
    return next(new errorHandler("Order ID and Product Item ID are required", 400));
  }

  const orderObj = await order.findById(orderId);
  if (!orderObj) {
    return next(new errorHandler("Order not found", 404));
  }

  const productItem = orderObj.products.id(productItemId);
  if (!productItem) {
    return next(new errorHandler("Product item not found", 404));
  }

  if (productItem.returnRequest.status !== "requested") {
    return next(
      new errorHandler("Return request is not in requested status", 400)
    );
  }

  // Update return status to approved
  productItem.returnRequest.status = "approved";
  productItem.returnRequest.approvedAt = new Date();

  await orderObj.save();

  res.status(200).json({
    success: true,
    message: "Return request approved successfully",
  });
});

// Reject Return Request
export const rejectReturn = asyncErrorHandler(async (req, res, next) => {
  const { orderId, productItemId } = req.body;

  if (!orderId || !productItemId) {
    return next(new errorHandler("Order ID and Product Item ID are required", 400));
  }

  const orderObj = await order.findById(orderId);
  if (!orderObj) {
    return next(new errorHandler("Order not found", 404));
  }

  const productItem = orderObj.products.id(productItemId);
  if (!productItem) {
    return next(new errorHandler("Product item not found", 404));
  }

  if (productItem.returnRequest.status !== "requested") {
    return next(
      new errorHandler("Return request is not in requested status", 400)
    );
  }

  // Update return status to rejected
  productItem.returnRequest.status = "rejected";

  await orderObj.save();

  res.status(200).json({
    success: true,
    message: "Return request rejected",
  });
});

// Mark Return as Completed and Process Refund
export const completeReturn = asyncErrorHandler(async (req, res, next) => {
  const { orderId, productItemId } = req.body;

  if (!orderId || !productItemId) {
    return next(new errorHandler("Order ID and Product Item ID are required", 400));
  }

  const orderObj = await order.findById(orderId);
  if (!orderObj) {
    return next(new errorHandler("Order not found", 404));
  }

  const productItem = orderObj.products.id(productItemId);
  if (!productItem) {
    return next(new errorHandler("Product item not found", 404));
  }

  if (productItem.returnRequest.status !== "approved") {
    return next(
      new errorHandler("Return must be approved before completion", 400)
    );
  }

  // Populate product to get price
  await orderObj.populate({
    path: "products.productId",
    select: "price",
  });

  // Calculate refund amount
  const productObj = await product.findById(productItem.productId);
  if (!productObj) {
    return next(new errorHandler("Product not found", 404));
  }

  const refundAmount =
    (productObj.price * productItem.returnRequest.returnQuantity) *
    100; // Convert to paise

  // Process refund if payment was online
  let refundId = "";
  if (orderObj.paymentMethod === "online" && orderObj.paymentIntentId) {
    try {
      // Check if paymentIntentId is a valid Razorpay payment ID
      if (orderObj.paymentIntentId.startsWith("pay_")) {
        const refund = await razorpay.payments.refund(
          orderObj.paymentIntentId,
          {
            amount: refundAmount,
            notes: {
              reason: "Product return",
              orderId: orderId.toString(),
              productId: productItem.productId.toString(),
            },
          }
        );
        refundId = refund.id;
      } else {
        // For COD or other payment methods, just mark as refunded
        refundId = `REF-${Date.now()}`;
      }
    } catch (error) {
      console.error("Refund error:", error);
      // Continue with return even if refund fails - admin can process manually
      refundId = `REF-PENDING-${Date.now()}`;
    }
  } else {
    // For COD, no refund needed
    refundId = `COD-RETURN-${Date.now()}`;
  }

  // Update return status
  productItem.returnRequest.status = "returned";
  productItem.returnRequest.returnedAt = new Date();
  productItem.returnRequest.refundId = refundId;

  // Restore product quantity (productObj already fetched above)
  const sizeQuantity = productObj.sizeQuantity.find(
    (sq) => sq.size === productItem.size
  );
  if (sizeQuantity) {
    sizeQuantity.quantity += productItem.returnRequest.returnQuantity;
    await productObj.save();
  }

  await orderObj.save();

  res.status(200).json({
    success: true,
    message: "Return completed and refund processed",
    refundId,
  });
});

// Get user's return requests
export const getUserReturns = asyncErrorHandler(async (req, res, next) => {
  const userId = req.tokenId;

  const orders = await order
    .find({ userId })
    .populate({
      path: "products.productId",
      select: "name price brand image slug color",
    })
    .sort("-createdAt");

  const returnRequests = [];
  orders.forEach((ord) => {
    ord.products.forEach((prod) => {
      if (prod.returnRequest.status !== "none") {
        returnRequests.push({
          orderId: ord._id,
          productItemId: prod._id,
          product: {
            _id: prod.productId._id,
            name: `${prod.productId.brand} ${prod.productId.name}`,
            image: prod.productId.image,
            color: prod.productId.color,
            size: prod.size,
            price: prod.productId.price,
            slug: prod.productId.slug,
          },
          returnRequest: {
            status: prod.returnRequest.status,
            reason: prod.returnRequest.reason,
            returnQuantity: prod.returnRequest.returnQuantity,
            requestedAt: prod.returnRequest.requestedAt,
            approvedAt: prod.returnRequest.approvedAt,
            returnedAt: prod.returnRequest.returnedAt,
            refundId: prod.returnRequest.refundId,
          },
          orderDate: ord.createdAt,
          deliveryStatus: ord.delivery_status,
        });
      }
    });
  });

  res.status(200).json({
    success: true,
    returns: returnRequests,
  });
});

