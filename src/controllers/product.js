import "dotenv/config";
import product from "../models/product.js";
import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import order from "../models/order.js";
import user from "../models/user.js";
import brands from "../models/brands.js";
import category from "../models/category.js";
import color from "../models/colors.js";

// Get all products
export const getAllProducts = asyncErrorHandler(async (req, res) => {
  const products = await product.find({});
  res.status(200).json({
    success: true,
    products,
  });
});

const toArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [value];
};

// Get products with filters, pagination, and sorting
export const getProducts = asyncErrorHandler(async (req, res) => {
  const page = parseInt(req.query.page) - 1 || 0;
  const limit = parseInt(req.query.limit) || 12;
  const search = req.query.search || "";
  const sortParam = req.query.sortBy?.value || "createdAt_asc";
  const colorValues = toArray(req.query.color).map((item) => item?.trim()).filter(Boolean);
  const sizeValues = toArray(req.query.size)
    .map((size) => Number(size))
    .filter((size) => !Number.isNaN(size));
  const brandValues = toArray(req.query.brand).map((item) => item?.trim()).filter(Boolean);
  
  // Handle price range - support both nested object and flat query params
  let priceRange = req.query.price || {};
  
  // If price is not an object, try to parse from flat params (price[minPrice], price[maxPrice])
  if (typeof priceRange !== 'object' || Array.isArray(priceRange)) {
    priceRange = {};
  }
  
  // Also check for flat query params (in case Express doesn't parse nested)
  if (!priceRange.minPrice && req.query['price[minPrice]'] !== undefined) {
    priceRange.minPrice = req.query['price[minPrice]'];
  }
  if (!priceRange.maxPrice && req.query['price[maxPrice]'] !== undefined) {
    priceRange.maxPrice = req.query['price[maxPrice]'];
  }
  
  const categoryValues = toArray(req.query.category).map((item) => item?.trim()).filter(Boolean);
  const hasMinPrice = priceRange.minPrice !== undefined && priceRange.minPrice !== "" && priceRange.minPrice !== null;
  const hasMaxPrice = priceRange.maxPrice !== undefined && priceRange.maxPrice !== "" && priceRange.maxPrice !== null;
  const parsedMinPrice = Number(priceRange.minPrice);
  const parsedMaxPrice = Number(priceRange.maxPrice);

  const query = {
    name: { $regex: search, $options: "i" },
    isActive: true,
  };

  if (!Number.isNaN(parsedMinPrice) || !Number.isNaN(parsedMaxPrice)) {
    query.price = {};
    if (!Number.isNaN(parsedMinPrice) && hasMinPrice) {
      query.price.$gte = parsedMinPrice;
    }
    if (!Number.isNaN(parsedMaxPrice) && hasMaxPrice) {
      query.price.$lte = parsedMaxPrice;
    }
  }

  if (brandValues.length > 0) {
    query.brand = { $in: brandValues };
  }

  if (colorValues.length > 0) {
    query.color = { $in: colorValues.map((c) => new RegExp(`^${c}$`, "i")) };
  }

  if (sizeValues.length > 0) {
    query["sizeQuantity.size"] = { $in: sizeValues };
  }

  if (categoryValues.length > 0) {
    query.category = {
      $in: categoryValues.map((cat) => new RegExp(`^${cat}$`, "i")),
    };
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

  const colorOption = await color.find({}).select("name");
  const colorOptions = await product.distinct("color");
  const brandOption = await brands.find({}).select("name");
  const brandOptions = brandOption.map((b) => b.name);
  const categoryOption = await category
    .find({ description: { $not: /^dashboard$/i } })
    .select("name");
  const categoryOptions = categoryOption.map((c) => c.name);
  const total = await product.countDocuments(query);



  res.status(200).json({
    success: true,
    count: total,
    products,
    colorOption,
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
    images,
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
    images: images && Array.isArray(images) ? images : [],
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
    images,
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
    images: images && Array.isArray(images) ? images : [],
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

  // Update order only if orderId is provided (for order-based reviews)
  if (orderId) {
    const orderObj = await order.findById(orderId);
    if (orderObj) {
      orderObj.products = orderObj.products.map((item) => {
        if (String(item.productId) === String(productId)) {
          item.isReviewed = true;
        }
        return item;
      });
      await orderObj.save();
    }
  }
  return res.status(200).json({
    success: true,
    message: "Review added successfully",
  });
});

// Edit existing review
export const editReview = asyncErrorHandler(async (req, res, next) => {
  const id = req.tokenId;
  const { productId, reviewIndex, rating, review } = req.body;
  const userObj = await user.findById(id).select("name");
  if (!userObj) {
    return next(new errorHandler("Invalid Token", 401));
  }
  const productObj = await product.findById(productId);
  if (!productObj) {
    return next(new errorHandler("Invalid Product id", 404));
  }
  if (!productObj.ratings || reviewIndex < 0 || reviewIndex >= productObj.ratings.length) {
    return next(new errorHandler("Review not found", 404));
  }
  const existingReview = productObj.ratings[reviewIndex];
  // Verify the review belongs to the current user
  if (existingReview.name !== userObj.name) {
    return next(new errorHandler("You can only edit your own reviews", 403));
  }
  // Update rating score: subtract old rating, add new rating
  productObj.ratingScore = productObj.ratingScore - existingReview.rating + rating;
  // Update the review
  productObj.ratings[reviewIndex].rating = rating;
  productObj.ratings[reviewIndex].review = review;
  productObj.ratings[reviewIndex].date = new Date(); // Update date to current date
  await productObj.save();
  return res.status(200).json({
    success: true,
    message: "Review updated successfully",
  });
});

// Delete review
export const deleteReview = asyncErrorHandler(async (req, res, next) => {
  const id = req.tokenId;
  const { productId, reviewIndex } = req.body;
  const userObj = await user.findById(id).select("name");
  if (!userObj) {
    return next(new errorHandler("Invalid Token", 401));
  }
  const productObj = await product.findById(productId);
  if (!productObj) {
    return next(new errorHandler("Invalid Product id", 404));
  }
  if (!productObj.ratings || reviewIndex < 0 || reviewIndex >= productObj.ratings.length) {
    return next(new errorHandler("Review not found", 404));
  }
  const existingReview = productObj.ratings[reviewIndex];
  // Verify the review belongs to the current user
  if (existingReview.name !== userObj.name) {
    return next(new errorHandler("You can only delete your own reviews", 403));
  }
  // Subtract rating from total score
  productObj.ratingScore -= existingReview.rating;
  // Remove the review
  productObj.ratings.splice(reviewIndex, 1);
  await productObj.save();
  return res.status(200).json({
    success: true,
    message: "Review deleted successfully",
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
  const rawSizes = await product.distinct("sizeQuantity.size");
  const sizes = rawSizes
    .map((size) => Number(size))
    .filter((size) => !Number.isNaN(size))
    .sort((a, b) => a - b);

  res.status(200).json({
    success: true,
    colors,
    brands: brandList,
    category: cat,
    sizes,
  });
});
