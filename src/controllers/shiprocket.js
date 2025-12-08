import asyncErrorHandler from "express-async-handler";
import order from "../models/order.js";
import user from "../models/user.js";
import product from "../models/product.js";
import errorHandler from "../utils/errorHandler.js";
import * as shiprocketService from "../utils/shiprocket.js";

/**
 * Create Ship Rocket shipment for an existing order
 */
export const createShipment = asyncErrorHandler(async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return errorHandler(res, 400, "Order ID is required");
  }

  const orderDoc = await order
    .findById(orderId)
    .populate({
      path: "products.productId",
      select: "name price brand image color sku",
    })
    .populate({
      path: "userId",
      select: "name email addresses",
    });

  if (!orderDoc) {
    return errorHandler(res, 404, "Order not found");
  }

  // Check if shipment already exists
  if (orderDoc.shiprocket && orderDoc.shiprocket.shipmentId) {
    return errorHandler(res, 400, "Shipment already exists for this order");
  }

  // Get shipping address
  let shippingAddress = null;
  if (orderDoc.shipping.addressId && orderDoc.userId.addresses) {
    shippingAddress = orderDoc.userId.addresses.find(
      (addr) => addr._id.toString() === orderDoc.shipping.addressId.toString()
    );
  } else if (orderDoc.shipping.address) {
    // For COD orders, address is stored directly
    shippingAddress = orderDoc.shipping.address;
  }

  if (!shippingAddress) {
    return errorHandler(res, 400, "Shipping address not found for this order");
  }

  // Prepare product details
  const productDetails = orderDoc.products.map((item) => ({
    productId: item.productId._id,
    name: `${item.productId.brand} ${item.productId.name}`,
    sku: item.productId.sku || `SKU-${item.productId._id}`,
    quantity: item.quantity,
    price: item.productId.price,
  }));

  try {
    const shiprocketResponse = await shiprocketService.createShipment(
      orderDoc,
      shippingAddress,
      productDetails
    );

    // Update order with Ship Rocket details
    if (shiprocketResponse && shiprocketResponse.order_id) {
      orderDoc.shiprocket = {
        shipmentId: shiprocketResponse.shipment_id || null,
        orderId: shiprocketResponse.order_id || null,
        status: shiprocketResponse.status || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await orderDoc.save();
    }

    res.status(200).json({
      success: true,
      message: "Shipment created successfully",
      data: shiprocketResponse,
    });
  } catch (error) {
    console.error("Ship Rocket shipment creation error:", error);
    return errorHandler(
      res,
      500,
      `Failed to create shipment: ${error.message}`
    );
  }
});

/**
 * Track shipment
 */
export const trackShipment = asyncErrorHandler(async (req, res) => {
  const { shipmentId, orderId } = req.query;

  if (!shipmentId && !orderId) {
    return errorHandler(res, 400, "Shipment ID or Order ID is required");
  }

  try {
    let trackingId = shipmentId;

    // If orderId is provided, get shipment ID from order
    if (orderId && !shipmentId) {
      const orderDoc = await order.findById(orderId);
      if (!orderDoc || !orderDoc.shiprocket || !orderDoc.shiprocket.shipmentId) {
        return errorHandler(res, 404, "Shipment not found for this order");
      }
      trackingId = orderDoc.shiprocket.shipmentId;
    }

    const trackingData = await shiprocketService.trackShipment(trackingId);

    res.status(200).json({
      success: true,
      data: trackingData,
    });
  } catch (error) {
    console.error("Ship Rocket tracking error:", error);
    return errorHandler(res, 500, `Failed to track shipment: ${error.message}`);
  }
});

/**
 * Generate AWB for a shipment
 */
export const generateAWB = asyncErrorHandler(async (req, res) => {
  const { shipmentId, courierId, orderId } = req.body;

  if (!shipmentId && !orderId) {
    return errorHandler(res, 400, "Shipment ID or Order ID is required");
  }

  if (!courierId) {
    return errorHandler(res, 400, "Courier ID is required");
  }

  try {
    let actualShipmentId = shipmentId;

    // If orderId is provided, get shipment ID from order
    if (orderId && !shipmentId) {
      const orderDoc = await order.findById(orderId);
      if (!orderDoc || !orderDoc.shiprocket || !orderDoc.shiprocket.shipmentId) {
        return errorHandler(res, 404, "Shipment not found for this order");
      }
      actualShipmentId = orderDoc.shiprocket.shipmentId;
    }

    const awbResponse = await shiprocketService.generateAWB(
      actualShipmentId,
      courierId
    );

    // Update order with AWB details
    if (orderId) {
      const orderDoc = await order.findById(orderId);
      if (orderDoc && awbResponse && awbResponse.awb_code) {
        orderDoc.shiprocket = {
          ...orderDoc.shiprocket,
          awbCode: awbResponse.awb_code,
          courierName: awbResponse.courier_name || null,
          courierId: courierId,
          labelUrl: awbResponse.label_url || null,
          trackingUrl: awbResponse.tracking_url || null,
          updatedAt: new Date(),
        };
        await orderDoc.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "AWB generated successfully",
      data: awbResponse,
    });
  } catch (error) {
    console.error("AWB generation error:", error);
    return errorHandler(res, 500, `Failed to generate AWB: ${error.message}`);
  }
});

/**
 * Cancel shipment
 */
export const cancelShipment = asyncErrorHandler(async (req, res) => {
  const { shipmentId, orderId } = req.body;

  if (!shipmentId && !orderId) {
    return errorHandler(res, 400, "Shipment ID or Order ID is required");
  }

  try {
    let actualShipmentId = shipmentId;

    // If orderId is provided, get shipment ID from order
    if (orderId && !shipmentId) {
      const orderDoc = await order.findById(orderId);
      if (!orderDoc || !orderDoc.shiprocket || !orderDoc.shiprocket.shipmentId) {
        return errorHandler(res, 404, "Shipment not found for this order");
      }
      actualShipmentId = orderDoc.shiprocket.shipmentId;
    }

    const cancelResponse = await shiprocketService.cancelShipment(
      actualShipmentId
    );

    // Update order status
    if (orderId) {
      const orderDoc = await order.findById(orderId);
      if (orderDoc) {
        orderDoc.shiprocket = {
          ...orderDoc.shiprocket,
          status: "cancelled",
          updatedAt: new Date(),
        };
        orderDoc.delivery_status = "Cancelled";
        await orderDoc.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "Shipment cancelled successfully",
      data: cancelResponse,
    });
  } catch (error) {
    console.error("Shipment cancellation error:", error);
    return errorHandler(
      res,
      500,
      `Failed to cancel shipment: ${error.message}`
    );
  }
});

/**
 * Get shipping rates
 */
export const getShippingRates = asyncErrorHandler(async (req, res) => {
  const {
    pickup_pincode,
    delivery_pincode,
    weight,
    cod_amount,
    order_id,
  } = req.body;

  if (!pickup_pincode || !delivery_pincode || !weight) {
    return errorHandler(
      res,
      400,
      "Pickup pincode, delivery pincode, and weight are required"
    );
  }

  try {
    const rateData = {
      pickup_pincode,
      delivery_pincode,
      weight: parseFloat(weight),
    };

    if (cod_amount) {
      rateData.cod_amount = parseFloat(cod_amount);
    }

    if (order_id) {
      rateData.order_id = order_id;
    }

    const rates = await shiprocketService.getShippingRates(rateData);

    res.status(200).json({
      success: true,
      data: rates,
    });
  } catch (error) {
    console.error("Shipping rates error:", error);
    return errorHandler(
      res,
      500,
      `Failed to get shipping rates: ${error.message}`
    );
  }
});

/**
 * Get all shipments
 */
export const getAllShipments = asyncErrorHandler(async (req, res) => {
  try {
    const filters = {};
    const { page, limit, status } = req.query;

    if (status) {
      filters.status = status;
    }

    const shipments = await shiprocketService.getAllShipments(filters);

    res.status(200).json({
      success: true,
      data: shipments,
    });
  } catch (error) {
    console.error("Get shipments error:", error);
    return errorHandler(
      res,
      500,
      `Failed to get shipments: ${error.message}`
    );
  }
});

/**
 * Get shipment by ID
 */
export const getShipmentById = asyncErrorHandler(async (req, res) => {
  const { shipmentId } = req.params;

  if (!shipmentId) {
    return errorHandler(res, 400, "Shipment ID is required");
  }

  try {
    const shipment = await shiprocketService.getShipmentById(shipmentId);

    res.status(200).json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    console.error("Get shipment error:", error);
    return errorHandler(
      res,
      500,
      `Failed to get shipment: ${error.message}`
    );
  }
});

/**
 * Request pickup for shipments
 */
export const requestPickup = asyncErrorHandler(async (req, res) => {
  const { shipmentIds, orderIds } = req.body;

  if (!shipmentIds && !orderIds) {
    return errorHandler(
      res,
      400,
      "Shipment IDs or Order IDs are required"
    );
  }

  try {
    let actualShipmentIds = shipmentIds || [];

    // If orderIds are provided, get shipment IDs from orders
    if (orderIds && !shipmentIds) {
      const orders = await order.find({ _id: { $in: orderIds } });
      actualShipmentIds = orders
        .map((ord) => ord.shiprocket?.shipmentId)
        .filter(Boolean);

      if (actualShipmentIds.length === 0) {
        return errorHandler(
          res,
          404,
          "No shipments found for the provided orders"
        );
      }
    }

    const pickupResponse = await shiprocketService.requestPickup(
      actualShipmentIds
    );

    res.status(200).json({
      success: true,
      message: "Pickup requested successfully",
      data: pickupResponse,
    });
  } catch (error) {
    console.error("Pickup request error:", error);
    return errorHandler(
      res,
      500,
      `Failed to request pickup: ${error.message}`
    );
  }
});

/**
 * Generate manifest for shipments
 */
export const generateManifest = asyncErrorHandler(async (req, res) => {
  const { shipmentIds, orderIds } = req.body;

  if (!shipmentIds && !orderIds) {
    return errorHandler(
      res,
      400,
      "Shipment IDs or Order IDs are required"
    );
  }

  try {
    let actualShipmentIds = shipmentIds || [];

    // If orderIds are provided, get shipment IDs from orders
    if (orderIds && !shipmentIds) {
      const orders = await order.find({ _id: { $in: orderIds } });
      actualShipmentIds = orders
        .map((ord) => ord.shiprocket?.shipmentId)
        .filter(Boolean);

      if (actualShipmentIds.length === 0) {
        return errorHandler(
          res,
          404,
          "No shipments found for the provided orders"
        );
      }
    }

    const manifestResponse = await shiprocketService.generateManifest(
      actualShipmentIds
    );

    // Update orders with manifest URL
    if (orderIds && manifestResponse.manifest_url) {
      await order.updateMany(
        { _id: { $in: orderIds } },
        {
          $set: {
            "shiprocket.manifestUrl": manifestResponse.manifest_url,
            "shiprocket.updatedAt": new Date(),
          },
        }
      );
    }

    res.status(200).json({
      success: true,
      message: "Manifest generated successfully",
      data: manifestResponse,
    });
  } catch (error) {
    console.error("Manifest generation error:", error);
    return errorHandler(
      res,
      500,
      `Failed to generate manifest: ${error.message}`
    );
  }
});

/**
 * Get order shipment details
 */
export const getOrderShipment = asyncErrorHandler(async (req, res) => {
  const { orderId } = req.params;

  if (!orderId) {
    return errorHandler(res, 400, "Order ID is required");
  }

  const orderDoc = await order
    .findById(orderId)
    .populate({
      path: "products.productId",
      select: "name price brand image color sku",
    })
    .populate({
      path: "userId",
      select: "name email addresses",
    });

  if (!orderDoc) {
    return errorHandler(res, 404, "Order not found");
  }

  // If shipment exists, get latest details from Ship Rocket
  if (orderDoc.shiprocket && orderDoc.shiprocket.shipmentId) {
    try {
      const shipmentDetails = await shiprocketService.getShipmentById(
        orderDoc.shiprocket.shipmentId
      );

      // Update order with latest shipment details
      if (shipmentDetails) {
        orderDoc.shiprocket = {
          ...orderDoc.shiprocket,
          status: shipmentDetails.status || orderDoc.shiprocket.status,
          awbCode: shipmentDetails.awb_code || orderDoc.shiprocket.awbCode,
          courierName:
            shipmentDetails.courier_name || orderDoc.shiprocket.courierName,
          trackingUrl:
            shipmentDetails.tracking_url || orderDoc.shiprocket.trackingUrl,
          labelUrl: shipmentDetails.label_url || orderDoc.shiprocket.labelUrl,
          updatedAt: new Date(),
        };
        await orderDoc.save();
      }

      res.status(200).json({
        success: true,
        data: {
          order: orderDoc,
          shipment: shipmentDetails,
        },
      });
    } catch (error) {
      console.error("Error fetching shipment details:", error);
      // Return order data even if Ship Rocket fetch fails
      res.status(200).json({
        success: true,
        data: {
          order: orderDoc,
          shipment: null,
          error: "Failed to fetch latest shipment details",
        },
      });
    }
  } else {
    res.status(200).json({
      success: true,
      data: {
        order: orderDoc,
        shipment: null,
        message: "No shipment created for this order yet",
      },
    });
  }
});

