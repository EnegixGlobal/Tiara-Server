import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get uploads directory path
const uploadsDir = path.join(__dirname, "../../uploads");

/**
 * Extract filename from image URL
 * Handles both full URLs (https://api.tiarasteps.com/uploads/filename.jpg) 
 * and relative paths (/uploads/filename.jpg)
 */
export const extractFilenameFromUrl = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string") {
    return null;
  }

  // Remove query parameters if any
  const urlWithoutQuery = imageUrl.split("?")[0];

  // Extract filename from URL
  // Handles: /uploads/filename.jpg, https://domain.com/uploads/filename.jpg, etc.
  const match = urlWithoutQuery.match(/\/uploads\/([^\/]+)$/);
  if (match && match[1]) {
    return match[1];
  }

  // Fallback: try to get filename from path
  const pathParts = urlWithoutQuery.split("/");
  const filename = pathParts[pathParts.length - 1];
  
  // Only return if it looks like a valid filename (has extension)
  if (filename && filename.includes(".")) {
    return filename;
  }

  return null;
};

/**
 * Delete a single image file from uploads folder
 */
export const deleteImageFile = (imageUrl) => {
  try {
    const filename = extractFilenameFromUrl(imageUrl);
    if (!filename) {
      console.warn(`Could not extract filename from URL: ${imageUrl}`);
      return false;
    }

    const filePath = path.join(uploadsDir, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Deleted image file: ${filename}`);
      return true;
    } else {
      console.warn(`Image file not found: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`Error deleting image file ${imageUrl}:`, error.message);
    return false;
  }
};

/**
 * Delete multiple image files from uploads folder
 */
export const deleteImageFiles = (imageUrls) => {
  if (!Array.isArray(imageUrls)) {
    return { deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;

  imageUrls.forEach((url) => {
    if (deleteImageFile(url)) {
      deleted++;
    } else {
      failed++;
    }
  });

  return { deleted, failed };
};

/**
 * Get images that need to be deleted (old images not in new images list)
 */
export const getImagesToDelete = (oldImages, newImages) => {
  if (!Array.isArray(oldImages) || oldImages.length === 0) {
    return [];
  }

  if (!Array.isArray(newImages) || newImages.length === 0) {
    // If no new images, delete all old images
    return oldImages;
  }

  // Extract filenames for comparison
  const oldFilenames = oldImages
    .map(extractFilenameFromUrl)
    .filter(Boolean);
  const newFilenames = newImages
    .map(extractFilenameFromUrl)
    .filter(Boolean);

  // Find old images that are not in new images
  const imagesToDelete = oldImages.filter((oldUrl) => {
    const oldFilename = extractFilenameFromUrl(oldUrl);
    return oldFilename && !newFilenames.includes(oldFilename);
  });

  return imagesToDelete;
};

