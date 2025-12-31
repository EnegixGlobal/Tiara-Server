import "dotenv/config";
import mongoose from "mongoose";
import product from "../models/product.js";
import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import order from "../models/order.js";
import user from "../models/user.js";
import brands from "../models/brands.js";
import category from "../models/category.js";
import color from "../models/colors.js";
import { deleteImageFile, getImagesToDelete } from "../utils/fileUtils.js";

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
  // Default to updatedAt_desc so newly added AND updated products appear first
  const sortParam = req.query.sortBy?.value || "updatedAt_desc";
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
    isActive: true,
  };

  // Only add name filter if search term is provided
  if (search && search.trim() !== "") {
    query.name = { $regex: search.trim(), $options: "i" };
  }

  // Only apply price filter if both min and max are valid and provided
  // Skip price filter if it's the default full range (0 to 1999) to include all products
  if (hasMinPrice && hasMaxPrice && !Number.isNaN(parsedMinPrice) && !Number.isNaN(parsedMaxPrice)) {
    // Skip filter if it's the default full range (0 to 1999) - this means "show all products"
    const isDefaultRange = parsedMinPrice === 0 && parsedMaxPrice === 1999;
    
    if (!isDefaultRange) {
      // Only apply price filter when user has actually changed from default range
      query.price = {
        $gte: parsedMinPrice,
        $lte: parsedMaxPrice
      };
    }
  } else if (hasMinPrice && !Number.isNaN(parsedMinPrice) && parsedMinPrice > 0) {
    // Only min price provided (and it's not 0, meaning user set a minimum)
    query.price = { $gte: parsedMinPrice };
  } else if (hasMaxPrice && !Number.isNaN(parsedMaxPrice) && parsedMaxPrice < 1999) {
    // Only max price provided (and it's less than max, meaning user set a maximum)
    query.price = { $lte: parsedMaxPrice };
  }

  if (brandValues.length > 0) {
    query.brand = { $in: brandValues };
  }

  if (colorValues.length > 0) {
    // Handle color as array - check if any color in the array matches
    query.color = { $in: colorValues.map((c) => new RegExp(`^${c}$`, "i")) };
  }

  if (sizeValues.length > 0) {
    query["sizeQuantity.size"] = { $in: sizeValues };
  }

  if (categoryValues.length > 0) {
    // Categories are now stored as arrays, so we can use simple $in operator
    // Normalize to lowercase for matching
    const normalizedCats = categoryValues.map((cat) => cat.trim().toLowerCase());
    
    // Use $in to match if any of the selected categories are in the product's category array
    // This is much faster than regex and can use indexes
    query.category = { $in: normalizedCats };
  }

  let sortField = "updatedAt"; // Default to updatedAt so updated products appear first
  let sortOrder = -1; // Default to descending (newest/updated first)

  if (sortParam) {
    const [field, order] = sortParam.split("_");
    sortField = field || "updatedAt"; // Fallback to updatedAt if field parsing fails
    sortOrder = order?.toLowerCase() === "desc" ? -1 : order?.toLowerCase() === "asc" ? 1 : -1;
  }

  const products = await product
    .find(query)
    .sort({ [sortField]: sortOrder })
    .skip(page * limit)
    .limit(limit);

  const colorOption = await color.find({}).select("name");
  // Get distinct colors from products - handle array format
  const allProductsForColors = await product.find({ isActive: true }).select("color");
  const colorSet = new Set();
  allProductsForColors.forEach((product) => {
    if (Array.isArray(product.color)) {
      product.color.forEach((c) => colorSet.add(c));
    } else if (typeof product.color === 'string' && product.color) {
      colorSet.add(product.color);
    }
  });
  const colorOptions = Array.from(colorSet).sort();
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

  const variantGroupId = productExists.variantGroupId || productExists._id;
  if (!productExists.variantGroupId) {
    productExists.variantGroupId = variantGroupId;
    await productExists.save();
  }

  const variants = await product
    .find({ variantGroupId, isActive: true })
    .select("_id name slug image images color price mrp isActive")
    .sort({ createdAt: 1 });

  return res.status(200).json({
    success: true,
    data: productExists,
    variants,
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
    mrp,
    sizeQuantity,
    color,
    material,
    featured,
    isNew,
    category: cat,
    parentProductId,
  } = req.body;

  // Convert color to array if it's a string (comma-separated)
  let colorArray = color;
  if (typeof color === 'string') {
    colorArray = color.split(',').map(c => c.trim()).filter(c => c.length > 0);
  } else if (!Array.isArray(color)) {
    colorArray = [];
  }

  // Convert category to array if it's a string (comma-separated) - for backward compatibility
  let categoryArray = cat;
  if (typeof cat === 'string') {
    categoryArray = cat.split(',').map(c => c.trim().toLowerCase()).filter(c => c.length > 0);
  } else if (!Array.isArray(cat)) {
    categoryArray = [];
  }

  if (
    !sku ||
    !name ||
    !brand ||
    !image ||
    !desc ||
    price === undefined ||
    price === null ||
    !colorArray ||
    colorArray.length === 0 ||
    !material ||
    !categoryArray ||
    categoryArray.length === 0 ||
    sizeQuantity.length === 0
  ) {
    return next(new errorHandler("Please fill all fields", 400));
  }

  const parsedPrice = Number(price);
  if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
    return next(new errorHandler("Please provide a valid price", 400));
  }
  let parsedMrp = Number(mrp);
  if (mrp === undefined || mrp === null || mrp === "") {
    parsedMrp = parsedPrice;
  }
  if (Number.isNaN(parsedMrp) || parsedMrp <= 0) {
    parsedMrp = parsedPrice;
  }
  if (parsedMrp < parsedPrice) {
    parsedMrp = parsedPrice;
  }

  const productExists = await product.findOne({ sku });
  if (productExists) {
    return next(new errorHandler("Product already exists", 400));
  }

  let variantGroupId = new mongoose.Types.ObjectId();
  let parentProductRef = null;

  if (parentProductId) {
    const parentProduct = await product.findById(parentProductId);
    if (!parentProduct) {
      return next(new errorHandler("Selected linked product was not found", 404));
    }
    if (!parentProduct.variantGroupId) {
      parentProduct.variantGroupId = parentProduct._id;
      await parentProduct.save();
    }
    variantGroupId = parentProduct.variantGroupId;
    parentProductRef = parentProduct._id;
  }

  await product.create({
    sku,
    name,
    brand,
    image,
    images: images && Array.isArray(images) ? images : [],
    description: desc,
    price: parsedPrice,
    mrp: parsedMrp,
    sizeQuantity,
    color: colorArray,
    material,
    category: categoryArray,
    isFeatured: featured,
    isNew: Boolean(isNew),
    variantGroupId,
    parentProduct: parentProductRef,
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
    mrp,
    sizeQuantity,
    color,
    material,
    featured,
    isNew,
    category: cat,
    parentProductId,
  } = req.body;

  // Convert color to array if it's a string (comma-separated)
  let colorArray = color;
  if (typeof color === 'string') {
    colorArray = color.split(',').map(c => c.trim()).filter(c => c.length > 0);
  } else if (!Array.isArray(color)) {
    colorArray = [];
  }

  // Category must be an array (new format only - no backward compatibility for updates)
  if (!Array.isArray(cat)) {
    return next(new errorHandler("Category must be an array. Please use the new format.", 400));
  }

  // Normalize category array: trim, lowercase, and filter empty values
  const categoryArray = cat
    .map(c => (typeof c === 'string' ? c.trim().toLowerCase() : String(c).toLowerCase().trim()))
    .filter(c => c.length > 0);

  if (
    !sku ||
    !name ||
    !brand ||
    !image ||
    !desc ||
    price === undefined ||
    price === null ||
    !colorArray ||
    colorArray.length === 0 ||
    !material ||
    !categoryArray ||
    categoryArray.length === 0 ||
    sizeQuantity.length === 0
  ) {
    return next(new errorHandler("Please fill all fields", 400));
  }

  const parsedPrice = Number(price);
  if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
    return next(new errorHandler("Please provide a valid price", 400));
  }
  let parsedMrp = Number(mrp);
  if (mrp === undefined || mrp === null || mrp === "") {
    parsedMrp = parsedPrice;
  }
  if (Number.isNaN(parsedMrp) || parsedMrp <= 0) {
    parsedMrp = parsedPrice;
  }
  if (parsedMrp < parsedPrice) {
    parsedMrp = parsedPrice;
  }

  const productExists = await product.findOne({ slug });
  if (!productExists) {
    return next(new errorHandler("Product does not exist", 404));
  }

  // Store old images for comparison
  const oldMainImage = productExists.image;
  const oldImages = Array.isArray(productExists.images) ? [...productExists.images] : [];

  let variantGroupIdToUse = productExists.variantGroupId || productExists._id;
  let parentProductRef = productExists.parentProduct || null;

  if (parentProductId) {
    if (String(parentProductId) === String(productExists._id)) {
      return next(new errorHandler("Product cannot be linked to itself", 400));
    }
    const parentProduct = await product.findById(parentProductId);
    if (!parentProduct) {
      return next(new errorHandler("Selected linked product was not found", 404));
    }
    if (!parentProduct.variantGroupId) {
      parentProduct.variantGroupId = parentProduct._id;
      await parentProduct.save();
    }
    parentProductRef = parentProduct._id;
    variantGroupIdToUse = parentProduct.variantGroupId;
  } else if (parentProductId === "" || parentProductId === null) {
    parentProductRef = null;
    if (!variantGroupIdToUse) {
      variantGroupIdToUse = productExists._id;
    }
  }

  Object.assign(productExists, {
    sku,
    name,
    brand,
    image,
    images: images && Array.isArray(images) ? images : [],
    description: desc,
    price: parsedPrice,
    mrp: parsedMrp,
    sizeQuantity,
    color: colorArray,
    material,
    isFeatured: featured,
    category: categoryArray,
    isNew: typeof isNew === "boolean" ? isNew : productExists.isNew,
    parentProduct: parentProductRef,
    variantGroupId: variantGroupIdToUse,
  });

  await productExists.save();

  // Delete old image files that are no longer in use
  // Only delete local uploads (contain /uploads/ in URL)
  const imagesToDelete = [];

  // Check if main image changed and old one is a local upload
  if (oldMainImage && oldMainImage !== image) {
    if (typeof oldMainImage === "string" && oldMainImage.includes("/uploads/")) {
      imagesToDelete.push(oldMainImage);
    }
  }

  // Check images array for removed images
  const newImages = images && Array.isArray(images) ? images : [];
  const removedImages = getImagesToDelete(oldImages, newImages);
  
  // Only delete local uploads
  removedImages.forEach((imgUrl) => {
    if (typeof imgUrl === "string" && imgUrl.includes("/uploads/")) {
      imagesToDelete.push(imgUrl);
    }
  });

  // Delete the old image files
  if (imagesToDelete.length > 0) {
    imagesToDelete.forEach((imgUrl) => {
      deleteImageFile(imgUrl);
    });
    console.log(`Deleted ${imagesToDelete.length} old image file(s) for product ${productExists._id}`);
  }

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
  // Get all colors from products - handle both array and string formats
  const allProducts = await product.find({ isActive: true }).select("color");
  const colorSet = new Set();
  allProducts.forEach((product) => {
    if (Array.isArray(product.color)) {
      product.color.forEach((c) => colorSet.add(c));
    } else if (typeof product.color === 'string' && product.color) {
      colorSet.add(product.color);
    }
  });
  const colors = Array.from(colorSet).sort();
  
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
