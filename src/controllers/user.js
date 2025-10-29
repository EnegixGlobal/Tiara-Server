import "dotenv/config";
import jwt from "jsonwebtoken";
import user from "../models/user.js";
import sendEmail from "../utils/sendEmail.js";
import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";
import order from "../models/order.js";

const secret = process.env.JWT_SECRET;

// Register user
export const register = asyncErrorHandler(async (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return next(new errorHandler("Please fill aldfgdfl fields", 400));
  }

  const emailAlreadyExists = await user.findOne({ email });
  if (emailAlreadyExists) {
    return next(new errorHandler("Email already exists", 400));
  }

  await user.create({ name, email, password });

  res.status(201).json({
    success: true,
    message: "User registered successfully",
  });
});

// User login
export const login = asyncErrorHandler(async (req, res, next) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return next(new errorHandler("Please provide email and password", 400));
  }

  const userExists = await user.findOne({ email, role });
  if (!userExists) {
    return next(new errorHandler("Invalid credentials", 401));
  }

  const isMatch = await userExists.comparePassword(password);
  if (!isMatch) {
    return next(new errorHandler("Invalid credentials", 401));
  }

  const token = jwt.sign(
    { id: userExists._id, email: userExists.email },
    secret,
    { expiresIn: "48h" }
  );

  const cartSize = userExists.cart.items.reduce((a, p) => a + p.qty, 0);

  res.status(200).json({
    success: true,
    message: "User logged in successfully",
    user: {
      name: userExists.name,
      email: userExists.email,
      role: userExists.role,
      cartSize,
    },
    token,
  });
});

// Admin login
export const adminLogin = asyncErrorHandler(async (req, res, next) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return next(new errorHandler("Please provide email and password", 400));
  }

  const userExists = await user.findOne({ email, role });
  if (!userExists) {
    return next(new errorHandler("Invalid credentials", 401));
  }

  const isMatch = await userExists.comparePassword(password);
  if (!isMatch) {
    return next(new errorHandler("Invalid credentials", 401));
  }

  const token = jwt.sign(
    { id: userExists._id, email: userExists.email, role: userExists.role },
    secret,
    { expiresIn: "30d" }
  );

  res.status(200).json({
    success: true,
    message: "Admin logged in successfully",
    user: {
      name: userExists.name,
      email: userExists.email,
    },
    token,
  });
});

// Verify token and return user data
export const verifyUser = asyncErrorHandler(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next(new errorHandler("Token not found", 401));

  const { id } = jwt.verify(token, secret);
  const userObj = await user.findById(id);
  if (!userObj) return next(new errorHandler("Invalid Token", 401));

  const cartSize = userObj.cart.items.reduce((a, p) => a + p.qty, 0);
  res.status(200).json({
    success: true,
    user: {
      name: userObj.name,
      email: userObj.email,
      cartSize,
    },
  });
});

// Get Orders by user token
export const getOrder = asyncErrorHandler(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next(new errorHandler("Token not found", 401));

  const { id } = jwt.verify(token, secret);
  const orderObj = await order.find({ userId: id }).populate({
    path: "products.productId",
    select: "name price brand image slug color",
  });

  const formattedOrders = orderObj.map((order) => ({
    id: order._id,
    paymentId: order.paymentIntentId,
    totalPrice: order.total,
    delivered: order.delivery_status,
    createdAt: order.createdAt,
    items: order.products.map((item) => ({
      id: item.productId._id,
      name: `${item.productId.brand} ${item.productId.name}`,
      price: item.productId.price,
      image: item.productId.image,
      color: item.productId.color,
      slug: item.productId.slug,
      qty: item.quantity,
      size: item.size,
      isReviewed: item.isReviewed,
    })),
  }));

  res.status(200).json({
    success: true,
    orders: formattedOrders.reverse(),
  });
});

// Forgot Password
export const forgetPassword = asyncErrorHandler(async (req, res, next) => {
  const { email } = req.params;
  const userExists = await user.findOne({ email, role: "user" });
  if (!userExists) {
    return next(new errorHandler("User not found", 404));
  }

  const token = jwt.sign({ id: userExists._id }, secret + userExists.password, {
    expiresIn: "5m",
  });

  const resetUrl = `${process.env.CLIENT_URL}/resetpassword?token=${token}&id=${userExists._id}`;
  await sendEmail({
    email,
    subject: "Password Reset Request for Your Account",
    message: `
      <div style="background-color: #FFF0E3; padding: 20px;">
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);">
          <div style="padding: 20px;">
            <h1>Password Reset Request</h1>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 20px 0;">
              <a href="${resetUrl}" style="background-color: #4CAF50; color: white; text-decoration: none; padding: 10px 20px; border-radius: 5px;">Reset Password</a>
            </div>
            <p>Please Note: This link is valid for 5 minutes.</p>
            <p>If you didn't request a password reset, please ignore this email.</p>
            <p>Thanks,<br/>Team TiaraSteps</p>
          </div>
        </div>
      </div>`,
  });

  res.status(200).json({
    success: true,
    message: `Email sent to ${email}`,
  });
});

// Change Reset Password
export const changeResetPassword = asyncErrorHandler(async (req, res, next) => {
  const { password, userId } = req.body;
  const token = req.headers.authorization?.split(" ")[1];

  if (!password || !userId || !token)
    return next(new errorHandler("Please provide all fields", 400));

  const userExists = await user.findById(userId);
  if (!userExists) {
    return next(new errorHandler("User not found", 404));
  }

  const verify = jwt.verify(token, secret + userExists.password);
  if (verify.id !== userId && verify.exp < Date.now() / 1000) {
    return next(new errorHandler("Token has expired", 400));
  }

  userExists.password = password;
  await userExists.save();

  res.status(200).json({
    success: true,
    message: "Password changed successfully",
  });
});
