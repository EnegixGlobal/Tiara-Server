import user from "../models/user.js";
import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import order from "../models/order.js";
import product from "../models/product.js";
import Razorpay from "razorpay";
import brands from "../models/brands.js";
import Coupon from "../models/coupon.js";
import { deleteImageFile, deleteImageFiles } from "../utils/fileUtils.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Get All Users
export const getAllUsers = asyncErrorHandler(async (req, res) => {
  const users = await user
    .find({ role: "user" })
    .select("name email createdAt");
  const maxIndex = Math.max(users.length, 100);
  const usersWithFormattedDate = users.map((userItem) => ({
    ...userItem._doc,
    createdAt: new Date(userItem.createdAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    index: `#${(users.indexOf(userItem) + 1)
      .toString()
      .padStart(maxIndex.toString().length, "0")}`,
  }));

  res.status(200).json({
    success: true,
    users: usersWithFormattedDate,
  });
});

// Get All Orders
export const getAllOrders = asyncErrorHandler(async (req, res) => {
  console.log("orders");
  const { page, limit } = req.query;

  const orders = await order
    .find()
    .populate({ path: "userId", select: "name" })
    .populate({
      path: "products.productId",
      select: "name price brand image slug color",
    })
    .select(
      "user products createdAt delivery_status total paymentIntentId paymentMethod payment_status"
    )
    .sort("-createdAt")
    .skip((page - 1) * limit)
    .limit(limit);

  const count = await order.countDocuments();

  const ordersWithFormattedDate = orders.map((ord) => ({
    _id: ord._id,
    user: ord.userId.name,
    products: ord.products.map((product) => ({
      _id: product._id,
      name: `${product.productId.brand} ${product.productId.name}`,
      desc: `${product.productId.color}, UK ${product.size}, ${product.quantity} unit`,
      image: product.productId.image,
      slug: product.productId.slug,
    })),
    total: ord.total,
    delivered: ord.delivery_status,
    paymentId: ord.paymentIntentId,
    paymentMethod: ord.paymentMethod || "online",
    paymentStatus: ord.payment_status || "",
    createdAt: new Date(ord.createdAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  }));

  res.status(200).json({
    success: true,
    orders: ordersWithFormattedDate,
    count,
  });
});

// Update Order Status
export const updateOrderStatus = asyncErrorHandler(async (req, res) => {
  const { id, status, paymentId, paymentStatus } = req.body;

  if (!id) {
    return errorHandler(res, 400, "Order id is required.");
  }

  const updatePayload = {};

  if (status) {
    updatePayload.delivery_status = status;
  }

  if (paymentStatus) {
    updatePayload.payment_status = paymentStatus;
  }

  if (Object.keys(updatePayload).length === 0) {
    return errorHandler(res, 400, "No update fields provided.");
  }

  await order.findByIdAndUpdate(id, updatePayload);

  if (status === "Cancelled" && paymentId) {
    try {
      // Create refund in Razorpay
      const refund = await razorpay.payments.refund(paymentId, {
        amount: null, // Full refund
        notes: {
          reason: "Order cancelled",
          orderId: id,
        },
      });
      console.log("Refund processed:", refund.id);
    } catch (error) {
      console.error("Refund error:", error);
      // Continue even if refund fails
    }
  }

  const message = paymentStatus
    ? "Payment status updated successfully."
    : "Order status updated successfully.";

  res.status(200).json({
    success: true,
    message,
  });
});

// Get Coupons
export const getCoupons = asyncErrorHandler(async (req, res) => {
  const coupons = await Coupon.find().sort("-createdAt");

  const formattedCoupons = coupons.map((c) => ({
    id: c.code,
    percent_off: c.discountType === "percentage" ? c.percentOff : null,
    discount: c.discountType === "fixed" ? c.discount : null,
    discountType: c.discountType,
    duration: c.duration,
    duration_in_months: c.durationInMonths || null,
    max_redemptions: c.maxRedemptions,
    times_redeemed: c.timesRedeemed,
    redemption_left:
      c.maxRedemptions === 999
        ? `${c.timesRedeemed}/∞`
        : `${c.timesRedeemed}/${c.maxRedemptions}`,
    validFrom: c.validFrom,
    validUntil: c.validUntil,
    isActive: c.isActive,
    minPurchaseAmount: c.minPurchaseAmount,
    maxDiscount: c.maxDiscount || null,
  }));

  res.status(200).json({
    success: true,
    data: formattedCoupons,
  });
});

// Create Coupon
export const createCoupon = asyncErrorHandler(async (req, res) => {
  const {
    name,
    discount,
    duration,
    duration_in_months,
    max_redemptions,
    max_discount,
  } = req.body.formData;

  if (!name || !discount || !duration || max_redemptions === undefined) {
    return errorHandler(res, 400, "Please provide all required fields.");
  }

  // Check if coupon code already exists
  const existingCoupon = await Coupon.findOne({
    code: name.toUpperCase().trim(),
  });

  if (existingCoupon) {
    return errorHandler(res, 400, "Coupon code already exists.");
  }

  // Determine discount type based on discount value
  // If discount is between 0-100, treat as percentage, otherwise fixed
  const discountType = discount <= 100 ? "percentage" : "fixed";
  const discountValue = parseFloat(discount);
  const percentOff = discountType === "percentage" ? discountValue : null;

  // Validate duration_in_months for repeating coupons
  if (duration === "repeating" && !duration_in_months) {
    return errorHandler(
      res,
      400,
      "Duration in months is required for repeating coupons."
    );
  }

  const couponData = {
    code: name.toUpperCase().trim(),
    discountType,
    discount: discountValue,
    percentOff,
    duration,
    maxRedemptions: parseInt(max_redemptions) || 999,
    isActive: true,
  };

  if (duration === "repeating" && duration_in_months) {
    couponData.durationInMonths = parseInt(duration_in_months);
  }

  // Add max discount if provided (only relevant for percentage discounts)
  if (max_discount && max_discount !== "" && discountType === "percentage") {
    couponData.maxDiscount = parseFloat(max_discount);
  }

  const newCoupon = await Coupon.create(couponData);

  res.status(201).json({
    success: true,
    message: "Coupon created successfully.",
    data: newCoupon,
  });
});

// Delete Coupon
export const deleteCoupon = asyncErrorHandler(async (req, res) => {
  const couponCode = req.params.id.toUpperCase().trim();

  const deletedCoupon = await Coupon.findOneAndDelete({ code: couponCode });

  if (!deletedCoupon) {
    return errorHandler(res, 404, "Coupon not found.");
  }

  res.status(200).json({
    success: true,
    message: "Coupon deleted successfully.",
  });
});

// Get All Products
export const getAllProducts = asyncErrorHandler(async (req, res) => {
  const { page, limit, searchTerm } = req.query;
  const normalizedSearch = searchTerm ?? "";

  const products = await product
    .find({ name: { $regex: normalizedSearch, $options: "i" } })
    .skip((page - 1) * limit)
    .limit(limit)
    .sort("brand name");

  const count = await product.countDocuments({
    name: { $regex: normalizedSearch, $options: "i" },
  });

  const formattedList = products.map((prod) => {
    const ratingCount = prod.ratings?.length || 0;
    const average =
      ratingCount > 0 ? (prod.ratingScore / ratingCount).toFixed(1) : "0.0";
    const colorLabel = Array.isArray(prod.color)
      ? prod.color.join(", ")
      : prod.color || "No color";

    return {
      _id: prod._id,
      image: prod.image,
      name: prod.name,
      desc: `${average} stars, ${colorLabel}`,
      size: prod.sizeQuantity
        .map((size) => `${size.size} (${size.quantity} unit)`)
        .join(", "),
      brand: prod.brand,
      status: prod.isActive ? "Active" : "Inactive",
      price: prod.price,
      slug: prod.slug,
      isNew: prod.isNew || false,
      variantGroupId: prod.variantGroupId,
      parentProduct: prod.parentProduct,
    };
  });

  res.status(200).json({
    success: true,
    count,
    products: formattedList,
  });
});

// Toggle "New" status for a product (controls New badge in frontend)
export const toggleNewStatus = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;

  const currentProduct = await product.findById(id);

  if (!currentProduct) {
    return res.status(404).json({
      success: false,
      message: "Product not found.",
    });
  }

  currentProduct.isNew = !currentProduct.isNew;
  await currentProduct.save();

  res.status(200).json({
    success: true,
    message: currentProduct.isNew
      ? "Product marked as New successfully."
      : "Product removed from New tag successfully.",
    isNew: currentProduct.isNew,
  });
});

// Toggle Product Status
export const productStatus = asyncErrorHandler(async (req, res) => {
  const currentProduct = await product.findById(req.params.id);
  const productBrand = await brands.findOne({ name: currentProduct.brand });

  productBrand.activeProducts += currentProduct.isActive ? -1 : 1;
  currentProduct.isActive = !currentProduct.isActive;

  await currentProduct.save();
  await productBrand.save();

  res.status(200).json({
    success: true,
    message: "Product status updated successfully.",
  });
});

// Delete Product
export const deleteProduct = asyncErrorHandler(async (req, res) => {
  const currentProduct = await product.findById(req.params.id);
  
  if (!currentProduct) {
    return res.status(404).json({
      success: false,
      message: "Product not found.",
    });
  }

  // Delete associated image files before deleting the product
  const imagesToDelete = [];
  
  // Add main image if it exists and is a local upload
  if (currentProduct.image) {
    const imageUrl = currentProduct.image;
    // Only delete if it's a local upload (contains /uploads/)
    if (typeof imageUrl === "string" && imageUrl.includes("/uploads/")) {
      imagesToDelete.push(imageUrl);
    }
  }
  
  // Add all images from images array if they exist and are local uploads
  if (Array.isArray(currentProduct.images) && currentProduct.images.length > 0) {
    currentProduct.images.forEach((imgUrl) => {
      if (typeof imgUrl === "string" && imgUrl.includes("/uploads/")) {
        imagesToDelete.push(imgUrl);
      }
    });
  }

  // Delete all image files
  if (imagesToDelete.length > 0) {
    const result = deleteImageFiles(imagesToDelete);
    console.log(`Deleted ${result.deleted} image file(s) for product ${currentProduct._id}`);
  }

  const productBrand = await brands.findOne({ name: currentProduct.brand });
  
  if (productBrand) {
    productBrand.totalProducts -= 1;
    if (currentProduct.isActive) {
      productBrand.activeProducts -= 1;
    }
    await productBrand.save();
  }

  await product.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: "Product deleted successfully.",
  });
});

// Get Admin Dashboard Details
// export const getAdminDetails = asyncErrorHandler(async (req, res) => {
//   const label1 = [
//     "Jan",
//     "Feb",
//     "Mar",
//     "Apr",
//     "May",
//     "Jun",
//     "Jul",
//     "Aug",
//     "Sep",
//     "Oct",
//     "Nov",
//     "Dec",
//   ];

//   const data1 = [];
//   const label2 = ["Pending", "Delivered", "Cancelled"];
//   const data2 = [];

//   const now = new Date();
//   const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
//   const firstDayOfNextMonth = new Date(
//     now.getFullYear(),
//     now.getMonth() + 1,
//     1
//   );

//   const ordersData = await order.aggregate([
//     {
//       $match: { createdAt: { $gte: new Date(now.getFullYear(), 0, 1) } },
//     },
//     {
//       $group: {
//         _id: { $month: "$createdAt" },
//         totalSales: { $sum: "$total" },
//         count: { $sum: 1 },
//       },
//     },
//     { $sort: { _id: 1 } },
//   ]);

//   Array.from({ length: 12 }, (_, i) => {
//     const monthData = ordersData.find((d) => d._id === i + 1);
//     data1.push(monthData ? Number(monthData.totalSales).toFixed(2) : 0);
//   });

//   const orderUpdate = await order.aggregate([
//     {
//       $match: {
//         createdAt: { $gt: firstDayOfMonth, $lte: firstDayOfNextMonth },
//       },
//     },
//     { $group: { _id: "$delivery_status", count: { $sum: 1 } } },
//   ]);

//   label2.forEach((status) => {
//     const match = orderUpdate.find(
//       (d) => d._id.toLowerCase() === status.toLowerCase()
//     );
//     data2.push(match ? match.count : 0);
//   });

//   const totalUsers = await user.countDocuments({ role: "user" });
//   const totalOrders = await order.countDocuments();
//   const totalProducts = await product.countDocuments();
//   const totalSales = await order.aggregate([
//     { $group: { _id: null, total: { $sum: "$total" } } },
//   ]);

//   res.status(200).json({
//     success: true,
//     bar1: { labels: label1, data: data1 },
//     bar2: { labels: label2, data: data2 },
//     totalUsers,
//     totalOrders,
//     totalProducts,
//     totalSales: totalSales[0].total.toFixed(2),
//   });
// });

// Get Admin Dashboard Details
export const getAdminDetails = asyncErrorHandler(async (req, res) => {
  const label1 = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const data1 = [];
  const label2 = ["Pending", "Delivered", "Cancelled"];
  const data2 = [];

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Monthly sales aggregation
  const ordersData = await order.aggregate([
    { $match: { createdAt: { $gte: new Date(now.getFullYear(), 0, 1) } } },
    {
      $group: {
        _id: { $month: "$createdAt" },
        totalSales: { $sum: "$total" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill missing months with 0
  Array.from({ length: 12 }, (_, i) => {
    const monthData = ordersData.find((d) => d._id === i + 1);
    data1.push(monthData ? Number(monthData.totalSales).toFixed(2) : 0);
  });

  // Order status count (for bar chart 2)
  const orderUpdate = await order.aggregate([
    {
      $match: { createdAt: { $gt: firstDayOfMonth, $lte: firstDayOfNextMonth } },
    },
    { $group: { _id: "$delivery_status", count: { $sum: 1 } } },
  ]);

  label2.forEach((status) => {
    const match = orderUpdate.find(
      (d) => d._id?.toLowerCase() === status.toLowerCase()
    );
    data2.push(match ? match.count : 0);
  });

  // Stats
  const totalUsers = await user.countDocuments({ role: "user" });
  const totalOrders = await order.countDocuments();
  const totalProducts = await product.countDocuments();

  const totalSalesData = await order.aggregate([
    { $group: { _id: null, total: { $sum: "$total" } } },
  ]);
  const totalSales =
    totalSalesData.length > 0 ? totalSalesData[0].total.toFixed(2) : 0;

  // Response
  res.status(200).json({
    success: true,
    bar1: { labels: label1, data: data1 },
    bar2: { labels: label2, data: data2 },
    totalUsers,
    totalOrders,
    totalProducts,
    totalSales,
  });
});

