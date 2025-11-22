import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import Coupon from "../models/coupon.js";

// Get Active Coupons for Users
// This endpoint returns all active and valid coupons that users can see
export const getActiveCoupons = asyncErrorHandler(async (req, res) => {
  const now = new Date();
  
  const coupons = await Coupon.find({
    isActive: true,
    $or: [
      { validUntil: null },
      { validUntil: { $gte: now } }
    ],
    $or: [
      { validFrom: null },
      { validFrom: { $lte: now } }
    ],
    $expr: { $lt: ["$timesRedeemed", "$maxRedemptions"] }
  }).sort("-createdAt");

  const formattedCoupons = coupons.map((c) => {
    let discountText = "";
    if (c.discountType === "percentage") {
      discountText = `${c.percentOff}% OFF`;
      if (c.maxDiscount) {
        discountText += ` (Max ₹${c.maxDiscount})`;
      }
    } else {
      discountText = `₹${c.discount} OFF`;
    }

    return {
      code: c.code,
      discountText,
      discountType: c.discountType,
      discount: c.discount,
      percentOff: c.percentOff,
      maxDiscount: c.maxDiscount || null,
      minPurchaseAmount: c.minPurchaseAmount,
      validUntil: c.validUntil,
      description: c.minPurchaseAmount > 0 
        ? `Min. purchase: ₹${c.minPurchaseAmount}`
        : "No minimum purchase",
    };
  });

  res.status(200).json({
    success: true,
    coupons: formattedCoupons,
  });
});

// Validate Coupon Code
// This endpoint allows users to validate a coupon code and get discount info
export const validateCoupon = asyncErrorHandler(async (req, res) => {
  const { code, subtotal } = req.body;

  if (!code) {
    return errorHandler(res, 400, "Coupon code is required.");
  }

  const couponCode = code.toUpperCase().trim();
  const couponDoc = await Coupon.findOne({ code: couponCode });

  if (!couponDoc) {
    return res.status(200).json({
      success: false,
      valid: false,
      message: "Invalid coupon code.",
    });
  }

  // Check if coupon is valid
  if (!couponDoc.isValid()) {
    let message = "This coupon is no longer valid.";
    
    if (!couponDoc.isActive) {
      message = "This coupon has been deactivated.";
    } else if (couponDoc.timesRedeemed >= couponDoc.maxRedemptions) {
      message = "This coupon has reached its redemption limit.";
    } else {
      const now = new Date();
      if (couponDoc.validFrom && now < couponDoc.validFrom) {
        message = "This coupon is not yet active.";
      } else if (couponDoc.validUntil && now > couponDoc.validUntil) {
        message = "This coupon has expired.";
      }
    }

    return res.status(200).json({
      success: false,
      valid: false,
      message,
    });
  }

  // Calculate discount if subtotal is provided
  let discountAmount = 0;
  if (subtotal && subtotal > 0) {
    discountAmount = couponDoc.calculateDiscount(subtotal);
    
    // Check minimum purchase amount
    if (subtotal < couponDoc.minPurchaseAmount) {
      return res.status(200).json({
        success: false,
        valid: false,
        message: `Minimum purchase amount of ₹${couponDoc.minPurchaseAmount} required to use this coupon.`,
      });
    }
  }

  res.status(200).json({
    success: true,
    valid: true,
    message: "Coupon applied successfully!",
    data: {
      code: couponDoc.code,
      discountType: couponDoc.discountType,
      discount: couponDoc.discount,
      percentOff: couponDoc.percentOff,
      discountAmount: discountAmount,
      minPurchaseAmount: couponDoc.minPurchaseAmount,
      maxDiscount: couponDoc.maxDiscount || null,
    },
  });
});

