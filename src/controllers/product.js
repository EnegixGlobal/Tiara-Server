import "dotenv/config";
import product from "../models/product.js";
import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import order from "../models/order.js";
import user from "../models/user.js";
import brands from "../models/brands.js";
import category from "../models/category.js";

// Get all products
export const getAllProducts = asyncErrorHandler(async (req, res) => {
  const products = await product.find({});
  res.status(200).json({
    success: true,
    products,
  });
});

// Get products with filters, pagination, and sorting
export const getProducts = asyncErrorHandler(async (req, res) => {
  const page = parseInt(req.query.page) - 1 || 0;
  const limit = parseInt(req.query.limit) || 12;
  const search = req.query.search || "";
  const sortParam = req.query.sortBy?.value || "createdAt_asc";
  const colors = req.query.color;
  const sizes = req.query.size;
  const brand = req.query.brand;
  const priceRange = req.query.price || {};
  const categoryOpt = req.query.category;

  const query = {
    name: { $regex: search, $options: "i" },
    price: {
      $gte: parseInt(priceRange.minPrice) || 0,
      $lte: parseInt(priceRange.maxPrice) || Infinity,
    },
    isActive: true,
  };

  if (brand && brand.length > 0) {
    query.brand = { $in: brand.map((b) => b) };
  }

  if (colors && colors.length > 0) {
    query.color = { $in: colors.map((c) => new RegExp(`^${c}$`, "i")) };
  }

  if (sizes && sizes.length > 0) {
    query["sizeQuantity.size"] = { $in: sizes.map(Number) };
  }

  if (categoryOpt) {
    query.category = { $regex: categoryOpt, $options: "i" };
  }

  let sortField = "createdAt";
  let sortOrder = 1;

  if (sortParam) {
    const [field, order] = sortParam.split("_");
    sortField = field || "createdAt";
    sortOrder = order?.toLowerCase() === "desc" ? -1 : 1;
  }

  const products = await product
    .find(query)
    .sort({ [sortField]: sortOrder })
    .skip(page * limit)
    .limit(limit);

  const colorOptions = await product.distinct("color");
  const brandOption = await brands.find({}).select("name");
  const brandOptions = brandOption.map((b) => b.name);
  const categoryOption = await category.find({}).select("name");
  const categoryOptions = categoryOption.map((c) => c.name);
  const total = await product.countDocuments(query);

  res.status(200).json({
    success: true,
    count: total,
    products,
    colorOptions,
    brandOptions,
    categoryOptions,
  });
});

// Get specific product by slug
export const getProduct = asyncErrorHandler(async (req, res, next) => {
  const { slug } = req.params;
  const productExists = await product.findOne({ slug, isActive: true });
  if (!productExists) {
    return next(new errorHandler("No such product exist", 404));
  }

  return res.status(200).json({
    success: true,
    data: productExists,
  });
});

// Create new product
export const createProduct = asyncErrorHandler(async (req, res, next) => {
  const {
    sku,
    name,
    brand,
    image,
    desc,
    price,
    sizeQuantity,
    color,
    material,
    featured,
    category: cat,
  } = req.body;

  if (
    !sku ||
    !name ||
    !brand ||
    !image ||
    !desc ||
    !price ||
    !color ||
    !material ||
    !cat ||
    sizeQuantity.length === 0
  ) {
    return next(new errorHandler("Please fill all fields", 400));
  }

  const productExists = await product.findOne({ sku });
  if (productExists) {
    return next(new errorHandler("Product already exists", 400));
  }

  await product.create({
    sku,
    name,
    brand,
    image,
    description: desc,
    price,
    sizeQuantity,
    color,
    material,
    category: cat,
    isFeatured: featured,
  });

  const productBrand = await brands.findOne({ name: brand });
  productBrand.totalProducts += 1;
  productBrand.activeProducts += 1;
  await productBrand.save();

  res.status(201).json({
    success: true,
    message: "Product created successfully",
  });
});

// Update Product by slug
export const updateProduct = asyncErrorHandler(async (req, res, next) => {
  const { slug } = req.params;
  const {
    sku,
    name,
    brand,
    image,
    desc,
    price,
    sizeQuantity,
    color,
    material,
    featured,
    category: cat,
  } = req.body;

  if (
    !sku ||
    !name ||
    !brand ||
    !image ||
    !desc ||
    !price ||
    !color ||
    !material ||
    !cat ||
    sizeQuantity.length === 0
  ) {
    return next(new errorHandler("Please fill all fields", 400));
  }

  const productExists = await product.findOne({ slug });
  if (!productExists) {
    return next(new errorHandler("Product does not exist", 404));
  }

  Object.assign(productExists, {
    sku,
    name,
    brand,
    image,
    description: desc,
    price,
    sizeQuantity,
    color,
    material,
    isFeatured: featured,
    category: cat,
  });

  await productExists.save();

  res.status(200).json({
    success: true,
    message: "Product updated successfully",
  });
});

// Review rating / feedback update
export const updateReview = asyncErrorHandler(async (req, res, next) => {
  const id = req.tokenId;
  const { rating, review, productId, orderId } = req.body;
  const userObj = await user.findById(id).select("name");
  if (!userObj) {
    return next(new errorHandler("Invalid Token", 401));
  }
  const productObj = await product.findById(productId);
  if (!productObj) {
    return next(new errorHandler("Invalid Product id", 404));
  }
  productObj.ratings.push({ rating, review, name: userObj.name });
  productObj.ratingScore += rating;
  await productObj.save();

  const orderObj = await order.findById(orderId);
  orderObj.products = orderObj.products.map((item) => {
    if (String(item.productId) === String(productId)) {
      item.isReviewed = true;
    }
    return item;
  });
  await orderObj.save();
  return res.status(200).json({
    success: true,
    message: "Review added successfully",
  });
});

// Get featured and trending products
export const getFeaturedProducts = asyncErrorHandler(async (req, res) => {
  const featured = await product
    .find({ isActive: true, isFeatured: true })
    .limit(8);
  const trending = await product
    .find({ isActive: true })
    .sort({ price: 1 })
    .limit(4);
  res.status(200).json({
    success: true,
    featured,
    trending,
  });
});

// Filter options for UI
export const getFilterOptions = asyncErrorHandler(async (req, res) => {
  const colors = await product.distinct("color");
  const cat = await category.find({}).select("name");
  const brandList = await brands.find({}).select("name");

  res.status(200).json({
    success: true,
    colors,
    brands: brandList,
    category: cat,
  });
});
