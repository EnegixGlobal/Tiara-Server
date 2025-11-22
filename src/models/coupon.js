import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Please provide a coupon code"],
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: [true, "Please provide a discount type"],
      default: "fixed",
    },
    discount: {
      type: Number,
      required: [true, "Please provide a discount value"],
      min: [0, "Discount cannot be negative"],
    },
    percentOff: {
      type: Number,
      min: [0, "Percentage cannot be negative"],
      max: [100, "Percentage cannot exceed 100"],
      default: null,
    },
    duration: {
      type: String,
      enum: ["forever", "repeating", "once"],
      required: [true, "Please provide a duration type"],
      default: "forever",
    },
    durationInMonths: {
      type: Number,
      min: [1, "Duration must be at least 1 month"],
      max: [12, "Duration cannot exceed 12 months"],
      default: null,
    },
    maxRedemptions: {
      type: Number,
      default: 999,
      min: [1, "Max redemptions must be at least 1"],
    },
    timesRedeemed: {
      type: Number,
      default: 0,
      min: [0, "Times redeemed cannot be negative"],
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validUntil: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    minPurchaseAmount: {
      type: Number,
      default: 0,
      min: [0, "Minimum purchase amount cannot be negative"],
    },
    maxDiscount: {
      type: Number,
      default: null,
      min: [0, "Max discount cannot be negative"],
    },
  },
  { timestamps: true }
);

// Index for faster queries
couponSchema.index({ code: 1, isActive: 1 });

// Virtual for redemption left
couponSchema.virtual("redemptionLeft").get(function () {
  if (this.maxRedemptions === 999) {
    return `${this.timesRedeemed}/∞`;
  }
  return `${this.timesRedeemed}/${this.maxRedemptions}`;
});

// Method to check if coupon is valid
couponSchema.methods.isValid = function () {
  if (!this.isActive) return false;
  if (this.timesRedeemed >= this.maxRedemptions) return false;
  
  const now = new Date();
  if (this.validFrom && now < this.validFrom) return false;
  if (this.validUntil && now > this.validUntil) return false;
  
  return true;
};

// Method to calculate discount amount
couponSchema.methods.calculateDiscount = function (subtotal) {
  if (!this.isValid()) return 0;
  if (subtotal < this.minPurchaseAmount) return 0;
  
  let calculatedDiscount = 0;
  
  if (this.discountType === "percentage" && this.percentOff) {
    calculatedDiscount = Math.round((subtotal * this.percentOff) / 100);
  } else if (this.discountType === "fixed") {
    calculatedDiscount = this.discount;
  }
  
  // Apply max discount limit if set (only for percentage discounts)
  if (this.maxDiscount && this.discountType === "percentage") {
    calculatedDiscount = Math.min(calculatedDiscount, this.maxDiscount);
  }
  
  // Don't exceed subtotal
  return Math.min(calculatedDiscount, subtotal);
};

// Increment redemption count
couponSchema.methods.incrementRedemption = async function () {
  this.timesRedeemed += 1;
  await this.save();
};

const Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;

