import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Types.ObjectId, ref: "User", required: true },
    paymentIntentId: { type: String, required: true },
    paymentMethod: {
      type: String,
      enum: ["online", "cod"],
      default: "online",
    },
    products: [
      {
        productId: {
          type: mongoose.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, default: 1 },
        size: { type: Number, required: true },
        isReviewed: { type: Boolean, default: false },
        returnRequest: {
          status: {
            type: String,
            enum: ["none", "requested", "approved", "rejected", "returned", "refunded"],
            default: "none",
          },
          reason: { type: String, default: "" },
          requestedAt: { type: Date },
          approvedAt: { type: Date },
          returnedAt: { type: Date },
          refundId: { type: String, default: "" },
          returnQuantity: { type: Number, default: 0 },
        },
      },
    ],
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    shipping: { type: Object, required: true },
    delivery_status: { type: String, default: "pending" },
    payment_status: { type: String, required: true },
    shiprocket: {
      shipmentId: { type: Number, default: null },
      orderId: { type: String, default: null },
      awbCode: { type: String, default: null },
      courierName: { type: String, default: null },
      courierId: { type: Number, default: null },
      status: { type: String, default: null },
      trackingUrl: { type: String, default: null },
      labelUrl: { type: String, default: null },
      manifestUrl: { type: String, default: null },
      createdAt: { type: Date },
      updatedAt: { type: Date },
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
