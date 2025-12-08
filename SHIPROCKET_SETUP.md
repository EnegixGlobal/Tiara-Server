# Ship Rocket Integration Setup Guide

This guide explains how to set up and use Ship Rocket integration in the Tiara Steps e-commerce platform.

## Prerequisites

1. A Ship Rocket account (sign up at https://www.shiprocket.in/)
2. **IMPORTANT**: You must create a dedicated API user (NOT your regular account credentials)
   - Log in to Ship Rocket dashboard
   - Go to **Settings** > **API**
   - Click **Configure** > **Create an API user**
   - Enter a different email (must be different from your registered email) and password
   - Click **Generate API Credential**
   - Use these API user credentials in your `.env` file

## Environment Variables

Add the following environment variables to your `.env` file:

```env
# Ship Rocket API User Credentials (NOT your regular account credentials!)
# Create an API user in Ship Rocket dashboard: Settings > API > Create API user
SHIPROCKET_EMAIL=your-api-user-email@example.com
SHIPROCKET_PASSWORD=your-api-user-password

# Optional: Pickup Location Name (defaults to "Home" if not set)
# Check your Ship Rocket dashboard > Settings > Pickup Locations for the exact name
SHIPROCKET_PICKUP_LOCATION=Home
```

### ⚠️ Important Notes:

- **DO NOT use your regular Ship Rocket account email/password**
- You **MUST** create a dedicated API user in the Ship Rocket dashboard
- The API user email must be different from your registered Ship Rocket email
- If you get a 403 Forbidden error, it means you're using regular account credentials instead of API user credentials

## Features

### Automatic Shipment Creation

When an order is placed (both online payment and COD), the system automatically creates a shipment in Ship Rocket if:
- Ship Rocket credentials are configured
- Shipping address is available
- Order is successfully created

If Ship Rocket creation fails, the order is still created successfully, and you can create the shipment manually later.

### Admin Endpoints

All Ship Rocket endpoints are protected with admin authentication. Base URL: `/api/v1/shiprocket`

#### 1. Create Shipment for an Order
```
POST /api/v1/shiprocket/create
Body: { "orderId": "order_id_here" }
```

#### 2. Track Shipment
```
GET /api/v1/shiprocket/track?shipmentId=12345
OR
GET /api/v1/shiprocket/track?orderId=order_id_here
```

#### 3. Generate AWB (Airway Bill)
```
POST /api/v1/shiprocket/awb
Body: {
  "shipmentId": 12345,
  "courierId": 1,
  "orderId": "order_id_here" // optional
}
```

#### 4. Cancel Shipment
```
POST /api/v1/shiprocket/cancel
Body: {
  "shipmentId": 12345,
  "orderId": "order_id_here" // optional
}
```

#### 5. Get Shipping Rates
```
POST /api/v1/shiprocket/rates
Body: {
  "pickup_pincode": "110001",
  "delivery_pincode": "400001",
  "weight": 0.5,
  "cod_amount": 1000 // optional
}
```

#### 6. Get All Shipments
```
GET /api/v1/shiprocket/shipments?status=all&page=1&limit=10
```

#### 7. Get Shipment by ID
```
GET /api/v1/shiprocket/shipments/:shipmentId
```

#### 8. Request Pickup
```
POST /api/v1/shiprocket/pickup
Body: {
  "shipmentIds": [12345, 12346],
  "orderIds": ["order_id_1", "order_id_2"] // alternative to shipmentIds
}
```

#### 9. Generate Manifest
```
POST /api/v1/shiprocket/manifest
Body: {
  "shipmentIds": [12345, 12346],
  "orderIds": ["order_id_1", "order_id_2"] // alternative to shipmentIds
}
```

#### 10. Get Order Shipment Details
```
GET /api/v1/shiprocket/order/:orderId
```

## Order Model Updates

The Order model now includes a `shiprocket` field with the following structure:

```javascript
shiprocket: {
  shipmentId: Number,        // Ship Rocket shipment ID
  orderId: String,           // Ship Rocket order ID
  awbCode: String,          // AWB tracking code
  courierName: String,      // Courier company name
  courierId: Number,        // Courier company ID
  status: String,           // Shipment status
  trackingUrl: String,      // Tracking URL
  labelUrl: String,         // Shipping label URL
  manifestUrl: String,      // Manifest URL
  createdAt: Date,
  updatedAt: Date
}
```

## Installation

1. Install the axios dependency:
```bash
cd server
npm install axios
```

2. Ensure your `.env` file has the Ship Rocket credentials

3. Restart your server

## Usage Flow

### Automatic Flow (Recommended)

1. Customer places an order
2. System automatically creates Ship Rocket shipment
3. Admin can generate AWB when ready to ship
4. Admin can request pickup
5. System tracks shipment status

### Manual Flow

1. Customer places an order
2. Admin creates shipment manually via `/api/v1/shiprocket/create`
3. Admin generates AWB
4. Admin requests pickup
5. System tracks shipment status

## Error Handling

- If Ship Rocket API is unavailable or credentials are invalid, orders are still created successfully
- Shipment creation errors are logged but don't block order creation
- Admin can create shipments manually for orders that failed automatic creation

## Testing

1. Place a test order
2. Check the order document in the database for `shiprocket` field
3. Use the admin endpoints to manage shipments
4. Track shipments using the tracking endpoint

## Notes

- Ship Rocket authentication token is cached and automatically refreshed
- Weight calculation defaults to 0.5kg per item (adjustable in `shiprocket.js`)
- COD orders automatically set payment method to COD in Ship Rocket
- All Ship Rocket operations are logged for debugging

## Support

For Ship Rocket API documentation, visit: https://apidocs.shiprocket.in/

For issues with this integration, check server logs for detailed error messages.

