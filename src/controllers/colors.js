import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import color from "../models/colors.js";

// Get all colors
export const getColors = asyncErrorHandler(async (req, res) => {
  const colors = await color.find();
  res.status(200).json({
    success: true,
    colors,
  });
});

// Create a new color
export const createColor = asyncErrorHandler(async (req, res, next) => {
  const { name, hexCode, description } = req.body;

  if (!name || !hexCode || !description) {
    return next(new errorHandler("Please fill all the fields.", 400));
  }

  const existingColor = await color.findOne({ name });
  if (existingColor) {
    return next(new errorHandler("Color already exists.", 400));
  }

  const newColor = await color.create({ name, hexCode, description });

  res.status(200).json({
    success: true,
    message: "Color created successfully.",
    color: newColor,
  });
});

// Update existing color
export const updateColor = asyncErrorHandler(async (req, res, next) => {
  const { name, hexCode, description } = req.body;

  if (!name || !hexCode || !description) {
    return next(new errorHandler("Please fill all the fields.", 400));
  }

  await color.findByIdAndUpdate(req.params.id, { name, hexCode, description });
  const colors = await color.find();

  res.status(200).json({
    success: true,
    message: "Color updated successfully.",
    colors,
  });
});

// Delete color by ID
export const deleteColor = asyncErrorHandler(async (req, res) => {
  await color.findByIdAndDelete(req.params.id);
  const colors = await color.find();

  res.status(200).json({
    success: true,
    message: "Color deleted successfully.",
    colors,
  });
});

