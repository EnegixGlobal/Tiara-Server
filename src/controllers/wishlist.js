import user from "../models/user.js";
import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import Product from "../models/product.js";

// Get Wishlist
export const getWishlist = asyncErrorHandler(async (req, res, next) => {
  const userObj = await user.findById(req.tokenId).populate({
    path: "wishlist.productId",
    select: "name price brand image slug sizeQuantity",
  });

  if (!userObj) {
    return next(new errorHandler("Invalid Token", 401));
  }

  // Transform wishlist items to include calculated stock info
  const wishlistWithStock = userObj.wishlist.map(item => {
    const product = item.productId;
    if (!product) return item;
    
    // Calculate total stock from sizeQuantity
    const totalStock = product.sizeQuantity?.reduce((sum, sq) => sum + (sq.quantity || 0), 0) || 0;
    const inStock = totalStock > 0;
    
    return {
      ...item.toObject(),
      productId: {
        ...product.toObject(),
        stock: totalStock,
        inStock: inStock,
      }
    };
  });

  return res.status(200).json({
    success: true,
    wishlist: wishlistWithStock || [],
  });
});

// Add to Wishlist
export const addToWishlist = asyncErrorHandler(async (req, res, next) => {
  const id = req.tokenId;
  const { productId } = req.body;
  const userObj = await user.findById(id);

  if (!userObj) {
    return next(new errorHandler("Invalid Token", 401));
  }

  const productObj = await Product.findById(productId).select("_id");
  if (!productObj) {
    return next(new errorHandler("Invalid Product id", 404));
  }

  // Check if product already exists in wishlist
  const existingItem = userObj.wishlist.find(
    (item) => String(item.productId) === String(productId)
  );

  if (existingItem) {
    return res.status(200).json({
      success: true,
      message: "Product already in wishlist",
    });
  }

  userObj.wishlist.push({ productId });
  await userObj.save();

  return res.status(200).json({
    success: true,
    message: "Product added to wishlist successfully",
  });
});

// Remove from Wishlist
export const removeFromWishlist = asyncErrorHandler(async (req, res, next) => {
  const id = req.tokenId;
  const { productId } = req.params;
  const userObj = await user.findById(id);

  if (!userObj) {
    return next(new errorHandler("Invalid Token", 401));
  }

  const itemIndex = userObj.wishlist.findIndex(
    (item) => String(item.productId) === String(productId)
  );

  if (itemIndex === -1) {
    return next(new errorHandler("Product not found in wishlist", 404));
  }

  userObj.wishlist.splice(itemIndex, 1);
  await userObj.save();

  return res.status(200).json({
    success: true,
    message: "Product removed from wishlist successfully",
  });
});

// Check if product is in wishlist
export const checkWishlist = asyncErrorHandler(async (req, res, next) => {
  const id = req.tokenId;
  const { productId } = req.params;
  const userObj = await user.findById(id);

  if (!userObj) {
    return next(new errorHandler("Invalid Token", 401));
  }

  const isInWishlist = userObj.wishlist.some(
    (item) => String(item.productId) === String(productId)
  );

  return res.status(200).json({
    success: true,
    isInWishlist,
  });
});

