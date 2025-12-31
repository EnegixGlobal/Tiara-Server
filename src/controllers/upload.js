import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)"));
  }
};

// Configure multer
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// Single file upload handler
export const uploadSingle = asyncErrorHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new errorHandler("No file uploaded", 400));
  }

  // Return the file path relative to the uploads folder
  const filePath = `/uploads/${req.file.filename}`;
  
  res.status(200).json({
    success: true,
    message: "File uploaded successfully",
    url: filePath,
  });
});

// Multiple files upload handler
export const uploadMultiple = asyncErrorHandler(async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(new errorHandler("No files uploaded", 400));
  }

  // Return array of file paths
  const filePaths = req.files.map((file) => `/uploads/${file.filename}`);
  
  res.status(200).json({
    success: true,
    message: "Files uploaded successfully",
    urls: filePaths,
  });
});

