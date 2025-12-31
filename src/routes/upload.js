import express from "express";
import multer from "multer";
import { upload, uploadSingle, uploadMultiple } from "../controllers/upload.js";
import { verifyToken, adminOnly } from "../middleware/auth.js";

const router = express.Router();

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB.",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum is 10 files.",
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message || "File upload error",
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "File upload error",
    });
  }
  next();
};

// Single file upload route (admin only)
router.post("/single", adminOnly, upload.single("file"), handleMulterError, uploadSingle);

// Multiple files upload route (admin only)
router.post("/multiple", adminOnly, upload.array("files", 10), handleMulterError, uploadMultiple);

export default router;

