import express from "express";
import {
  createShipment,
  trackShipment,
  generateAWB,
  cancelShipment,
  getShippingRates,
  getAllShipments,
  getShipmentById,
  requestPickup,
  generateManifest,
  getOrderShipment,
} from "../controllers/shiprocket.js";

const router = express.Router();

// Create shipment for an order
router.post("/create", createShipment);

// Track shipment
router.get("/track", trackShipment);

// Generate AWB
router.post("/awb", generateAWB);

// Cancel shipment
router.post("/cancel", cancelShipment);

// Get shipping rates
router.post("/rates", getShippingRates);

// Get all shipments
router.get("/shipments", getAllShipments);

// Get shipment by ID
router.get("/shipments/:shipmentId", getShipmentById);

// Request pickup
router.post("/pickup", requestPickup);

// Generate manifest
router.post("/manifest", generateManifest);

// Get order shipment details
router.get("/order/:orderId", getOrderShipment);

export default router;

