import "dotenv/config";
import express from "express";
import cors from "cors";

import connectDatabase from "./src/config/connectDB.js";
import errorHandlerMiddleware from "./src/middleware/error.js";

// Import Routes
import userRoute from "./src/routes/user.js";
import productRoute from "./src/routes/product.js";
import cartRoute from "./src/routes/cart.js";
import paymentRoute from "./src/routes/payments.js";
import adminRoute from "./src/routes/admin.js";
import brandRoute from "./src/routes/brands.js";
import categoryRoute from "./src/routes/category.js";
import colorRoute from "./src/routes/colors.js";

import { verifyToken, adminOnly } from "./src/middleware/auth.js";
import { webhook } from "./src/controllers/payments.js";

const app = express();


// Correct CORS setup
app.use(
  cors({
    origin: "http://localhost:5173", // frontend URL
    credentials: true, // allow cookies / auth headers
  })
);

// Middleware setup
app.use(express.static("./public"));

// Webhook (needs raw body handling before express.json)
app.post("/webhook", express.raw({ type: "application/json" }), webhook);

// Must come **after** webhook route
app.use(express.json());

// Root route
app.get("/", (req, res) => {
  res.json({
    project: "TiaraSteps API",
    description:
      "This is an API for a shoes E-commerce application. It provides endpoints for managing products, orders, and users.",
    author: {
      name: "Egenix Global",
      portfolio: "https://mustaks-portfolio.netlify.app/",
    },
    version: "1.0.0",
  });
});

// Route registration
app.use("/api/v1/payment", verifyToken, paymentRoute);
app.use("/api/v1/", userRoute);
app.use("/api/v1/product", productRoute);
app.use("/api/v1/cart", verifyToken, cartRoute);
app.use("/api/v1/admin", adminOnly, adminRoute);
app.use("/api/v1/brands", adminOnly, brandRoute);
app.use("/api/v1/category", adminOnly, categoryRoute);
app.use("/api/v1/colors", adminOnly, colorRoute);

// Catch-all route
app.use((req, res) => {
  res.status(404).send("404 Page not found");
});


// Global Error Middleware
app.use(errorHandlerMiddleware);

// Start Server
const port = process.env.PORT || 5000;

const StartServer = async () => {
  try {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Server is running on http://localhost:${port}`);
    });

    await connectDatabase(process.env.MONGO_URI);
  } catch (error) {
    console.log(error);
  }
};

StartServer();
