import mongoose from "mongoose";

const colorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    hexCode: {
      type: String,
      required: true,
      trim: true,
    },
    description: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const Color = mongoose.model("Color", colorSchema);

export default Color;

