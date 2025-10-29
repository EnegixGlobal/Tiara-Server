import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import brand from "../models/brands.js";
import category from "../models/category.js";

// Get all brands
export const getAllBrands = asyncErrorHandler(async (req, res) => {
  const brands = await brand.find();
  res.status(200).json({
    success: true,
    brands,
  });
});

// Create a new brand
export const createBrand = asyncErrorHandler(async (req, res, next) => {
  console.log(req.body);
  const { name, description, email, isActivate } = req.body;

  if (!name || !description || !email) {
    return next(new errorHandler("Please fill all the fields.", 400));
  }

  const existingBrand = await brand.findOne({ name });
  if (existingBrand) {
    return next(new errorHandler("Brand already exists.", 400));
  }

  const newBrand = await brand.create({
    name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
    description,
    email,
    isActivate,
  });

  res.status(200).json({
    success: true,
    message: "Brand created successfully.",
    brand: newBrand,
  });
});

// Update brand
export const updateBrand = asyncErrorHandler(async (req, res, next) => {
  const { name, description, email, isActivate } = req.body;

  if (!name || !description || !email) {
    return next(new errorHandler("Please fill all the fields.", 400));
  }

  await brand.findByIdAndUpdate(req.params.id, {
    name,
    description,
    email,
    isActivate,
  });

  const brands = await brand.find();
  res.status(200).json({
    success: true,
    message: "Brand updated successfully.",
    brands,
  });
});

// Get options (brands + categories)
export const getOptions = asyncErrorHandler(async (req, res) => {
  const brands = await brand.find();
  const brandOptions = brands.map((b) => b.name);

  const categories = await category.find();
  const categoryOptions = categories.map((c) => c.name);

  res.status(200).json({
    success: true,
    brandOptions,
    categoryOptions,
  });
});
