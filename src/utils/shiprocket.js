import "dotenv/config";
import axios from "axios";

// Ship Rocket API v2 Base URL
const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";
let authToken = null;
let tokenExpiry = null;

/**
 * Authenticate with Ship Rocket and get access token
 */
const authenticate = async () => {
  try {
    // Check if credentials are configured
    if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) {
      throw new Error("Ship Rocket credentials not configured. Please set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in your .env file");
    }

    // Check if we have a valid token
    if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
      return authToken;
    }

    const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    });

    if (response.data && response.data.token) {
      authToken = response.data.token;
      // Token expires in 24 hours, but we'll refresh after 23 hours to be safe
      tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
      return authToken;
    }

    throw new Error("Failed to authenticate with Ship Rocket");
  } catch (error) {
    console.error("Ship Rocket authentication error:", error.response?.data?.message || error.message);
    throw new Error(`Ship Rocket authentication failed: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Make authenticated request to Ship Rocket API
 */
const makeRequest = async (method, endpoint, data = null) => {
  try {
    const token = await authenticate();
    const config = {
      method,
      url: `${SHIPROCKET_BASE_URL}${endpoint}`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Ship Rocket API error (${method} ${endpoint}):`, error.response?.data?.message || error.message);
    throw new Error(
      `Ship Rocket API error (${method} ${endpoint}): ${error.response?.data?.message || error.message}`
    );
  }
};

/**
 * Create a shipment order in Ship Rocket
 * @param {Object} orderData - Order data from database
 * @param {Object} shippingAddress - Shipping address object
 * @param {Array} products - Array of products with details
 * @returns {Object} Ship Rocket shipment response
 */
export const createShipment = async (orderData, shippingAddress, products) => {
  try {
    // Calculate total weight (assuming average weight per product)
    // You can adjust this based on your product weights
    const totalWeight = products.reduce((sum, item) => sum + item.quantity, 0) * 0.5; // 0.5kg per item

    // Prepare order items for Ship Rocket
    const orderItems = products.map((item) => ({
      name: item.name || "Product",
      sku: item.sku || `SKU-${item.productId}`,
      units: item.quantity,
      selling_price: item.price || 0,
    }));

    const shipmentData = {
      order_id: orderData._id.toString(),
      order_date: new Date(orderData.createdAt).toISOString().split("T")[0],
      pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || "Home",
      billing_customer_name: shippingAddress.fullName,
      billing_last_name: "",
      billing_address: shippingAddress.addressLine1,
      billing_address_2: shippingAddress.addressLine2 || "",
      billing_city: shippingAddress.city,
      billing_pincode: shippingAddress.pincode,
      billing_state: shippingAddress.state,
      billing_country: "India",
      billing_email: orderData.shipping?.email || "",
      billing_phone: shippingAddress.phone,
      shipping_is_billing: true,
      shipping_customer_name: shippingAddress.fullName,
      shipping_last_name: "",
      shipping_address: shippingAddress.addressLine1,
      shipping_address_2: shippingAddress.addressLine2 || "",
      shipping_city: shippingAddress.city,
      shipping_pincode: shippingAddress.pincode,
      shipping_country: "India",
      shipping_state: shippingAddress.state,
      shipping_email: orderData.shipping?.email || "",
      shipping_phone: shippingAddress.phone,
      order_items: orderItems,
      payment_method: orderData.paymentMethod === "cod" ? "COD" : "Prepaid",
      sub_total: orderData.subtotal,
      length: 10,
      breadth: 10,
      height: 10,
      weight: totalWeight,
    };

    // Add COD amount if payment method is COD
    if (orderData.paymentMethod === "cod") {
      shipmentData.total_discount = orderData.subtotal - orderData.total;
      shipmentData.shipping_charges = 0;
      shipmentData.cod_amount = orderData.total;
    } else {
      shipmentData.total_discount = orderData.subtotal - orderData.total;
      shipmentData.shipping_charges = 0;
    }

    const response = await makeRequest("POST", "/orders/create/adhoc", shipmentData);
    
    // Check if response indicates an error (Ship Rocket returns errors in response body, not as HTTP error)
    if (response.message && response.message.includes("Wrong Pickup location")) {
      const availableLocations = response.data?.data || [];
      if (availableLocations.length > 0) {
        const locationNames = availableLocations.map(l => l.pickup_location).join(", ");
        const errorMsg = `Wrong pickup location "${shipmentData.pickup_location}". Available locations: ${locationNames}. Please set SHIPROCKET_PICKUP_LOCATION=${availableLocations[0].pickup_location} in your .env file`;
        console.error("Ship Rocket Error:", errorMsg);
        throw new Error(errorMsg);
      }
      throw new Error(response.message);
    }
    
    // Check if response has error structure
    if (response.message && !response.order_id && !response.shipment_id) {
      throw new Error(response.message);
    }
    
    // Log response for debugging (only if successful)
    if (response.order_id || response.shipment_id) {
      console.log("Ship Rocket shipment created successfully");
    }
    
    return response;
  } catch (error) {
    console.error("Error creating Ship Rocket shipment:", error.message);
    throw error;
  }
};

/**
 * Generate AWB (Airway Bill) for a shipment
 * @param {Number} shipmentId - Ship Rocket shipment ID
 * @param {Number} courierId - Courier company ID
 * @returns {Object} AWB generation response
 */
export const generateAWB = async (shipmentId, courierId) => {
  try {
    const response = await makeRequest("POST", "/orders/create/awb", {
      shipment_id: shipmentId,
      courier_id: courierId,
    });
    return response;
  } catch (error) {
    console.error("Error generating AWB:", error);
    throw error;
  }
};

/**
 * Track shipment
 * @param {String} shipmentId - Ship Rocket shipment ID or AWB code
 * @returns {Object} Tracking information
 */
export const trackShipment = async (shipmentId) => {
  try {
    const response = await makeRequest("GET", `/shipments/track/${shipmentId}`);
    return response;
  } catch (error) {
    console.error("Error tracking shipment:", error);
    throw error;
  }
};

/**
 * Cancel shipment
 * @param {Number} shipmentId - Ship Rocket shipment ID
 * @returns {Object} Cancellation response
 */
export const cancelShipment = async (shipmentId) => {
  try {
    const response = await makeRequest("POST", "/orders/cancel/shipment/awbs", {
      awbs: [shipmentId],
    });
    return response;
  } catch (error) {
    console.error("Error cancelling shipment:", error);
    throw error;
  }
};

/**
 * Get shipping rates
 * @param {Object} rateData - Rate calculation data
 * @returns {Object} Shipping rates
 */
export const getShippingRates = async (rateData) => {
  try {
    const response = await makeRequest("POST", "/courier/serviceability/rate", rateData);
    return response;
  } catch (error) {
    console.error("Error getting shipping rates:", error);
    throw error;
  }
};

/**
 * Get all shipments
 * @param {Object} filters - Optional filters
 * @returns {Object} List of shipments
 */
export const getAllShipments = async (filters = {}) => {
  try {
    let endpoint = "/shipments";
    const queryParams = Object.keys(filters)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(filters[key])}`)
      .join("&");
    
    if (queryParams) {
      endpoint += `?${queryParams}`;
    }
    
    const response = await makeRequest("GET", endpoint);
    return response;
  } catch (error) {
    console.error("Error getting shipments:", error);
    throw error;
  }
};

/**
 * Get shipment by ID
 * @param {Number} shipmentId - Ship Rocket shipment ID
 * @returns {Object} Shipment details
 */
export const getShipmentById = async (shipmentId) => {
  try {
    const response = await makeRequest("GET", `/shipments/${shipmentId}`);
    return response;
  } catch (error) {
    console.error("Error getting shipment:", error);
    throw error;
  }
};

/**
 * Request pickup for shipment
 * @param {Array} shipmentIds - Array of shipment IDs
 * @returns {Object} Pickup request response
 */
export const requestPickup = async (shipmentIds) => {
  try {
    const response = await makeRequest("POST", "/orders/pickup", {
      shipment_id: shipmentIds,
    });
    return response;
  } catch (error) {
    console.error("Error requesting pickup:", error);
    throw error;
  }
};

/**
 * Generate manifest for shipments
 * @param {Array} shipmentIds - Array of shipment IDs
 * @returns {Object} Manifest generation response
 */
export const generateManifest = async (shipmentIds) => {
  try {
    const response = await makeRequest("POST", "/manifests/generate", {
      shipment_id: shipmentIds,
    });
    return response;
  } catch (error) {
    console.error("Error generating manifest:", error);
    throw error;
  }
};

