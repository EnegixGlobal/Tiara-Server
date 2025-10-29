import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import category from "../models/category.js";

// Get all categories
export const getCategory = asyncErrorHandler(async (req, res) => {
  const categories = await category.find();
  res.status(200).json({
    success: true,
    categories,
  });
});

// Create a new category
export const createCategory = asyncErrorHandler(async (req, res, next) => {
  const { name, description } = req.body;

  if (!name || !description) {
    return next(new errorHandler("Please fill all the fields.", 400));
  }

  const existingCategory = await category.findOne({ name });
  if (existingCategory) {
    return next(new errorHandler("Category already exists.", 400));
  }

  const newCategory = await category.create({ name, description });

  res.status(200).json({
    success: true,
    message: "Category created successfully.",
    category: newCategory,
  });
});

// Update existing category
export const updateCategory = asyncErrorHandler(async (req, res, next) => {
  const { name, description } = req.body;

  if (!name || !description) {
    return next(new errorHandler("Please fill all the fields.", 400));
  }

  await category.findByIdAndUpdate(req.params.id, { name, description });
  const categories = await category.find();

  res.status(200).json({
    success: true,
    message: "Category updated successfully.",
    categories,
  });
});

// Delete category by ID
export const deleteCategory = asyncErrorHandler(async (req, res) => {
  await category.findByIdAndDelete(req.params.id);
  const categories = await category.find();

  res.status(200).json({
    success: true,
    message: "Category deleted successfully.",
    categories,
  });
});
