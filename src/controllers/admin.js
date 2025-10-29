import user from "../models/user.js";
import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import order from "../models/order.js";
import product from "../models/product.js";
import Stripe from "stripe";
import brands from "../models/brands.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    .select("user products createdAt delivery_status total paymentIntentId")
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
  const { id, status, paymentId } = req.body;
  await order.findByIdAndUpdate(id, { delivery_status: status });

  if (status === "Cancelled") {
    await stripe.refunds.create({ payment_intent: paymentId });
  }

  res.status(200).json({
    success: true,
    message: "Order status updated successfully.",
  });
});

// Get Coupons
export const getCoupons = asyncErrorHandler(async (req, res) => {
  const coupons = await stripe.coupons.list({ limit: 100 });

  const data = coupons.data.map((coupon) => ({
    id: coupon.id,
    percent_off: coupon.percent_off,
    duration:
      coupon.duration === "repeating"
        ? coupon.duration_in_months
        : coupon.duration,
    duration_in_months: coupon.duration_in_months,
    max_redemptions: coupon.max_redemptions || 999,
    redemption_left: `${coupon.times_redeemed}/${
      coupon.max_redemptions || "∞"
    }`,
  }));

  res.status(200).json({
    success: true,
    data,
  });
});

// Create Coupon
export const createCoupon = asyncErrorHandler(async (req, res) => {
  const {
    name,
    discount: percent_off,
    duration,
    duration_in_months,
    max_redemptions,
  } = req.body.formData;

  const couponData = {
    id: name.toUpperCase(),
    name: name.toUpperCase(),
    duration: duration === "forever" ? "forever" : "repeating",
    percent_off,
    max_redemptions,
  };

  if (duration !== "forever") {
    couponData.duration_in_months = duration_in_months;
  }

  await stripe.coupons.create(couponData);

  res.status(200).json({
    success: true,
    message: "Coupon created successfully.",
  });
});

// Delete Coupon
export const deleteCoupon = asyncErrorHandler(async (req, res) => {
  await stripe.coupons.del(req.params.id);

  res.status(200).json({
    success: true,
    message: "Coupon deleted successfully.",
  });
});

// Get All Products
export const getAllProducts = asyncErrorHandler(async (req, res) => {
  const { page, limit, searchTerm } = req.query;

  const products = await product
    .find({ name: { $regex: searchTerm, $options: "i" } })
    .skip((page - 1) * limit)
    .limit(limit)
    .sort("brand name");

  const count = await product.countDocuments({
    name: { $regex: searchTerm, $options: "i" },
  });

  const formattedList = products.map((prod) => ({
    _id: prod._id,
    image: prod.image,
    name: prod.name,
    desc: `${(prod.ratingScore / prod.ratings.length || 0).toFixed(1)} stars, ${
      prod.color
    }`,
    size: prod.sizeQuantity
      .map((size) => `${size.size} (${size.quantity} unit)`)
      .join(", "),
    brand: prod.brand,
    status: prod.isActive ? "Active" : "Inactive",
    price: prod.price,
    slug: prod.slug,
  }));

  res.status(200).json({
    success: true,
    count,
    products: formattedList,
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

