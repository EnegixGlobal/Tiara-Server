import jwt from "jsonwebtoken";
import user from "../models/user.js";
import asyncErrorHandler from "express-async-handler";
import errorHandler from "../utils/errorHandler.js";

const secret = process.env.JWT_SECRET;

export const adminOnly = asyncErrorHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new errorHandler("Token not found", 401));
  }

  const token = authHeader.split(" ")[1];
  const { id, email } = jwt.verify(token, secret);

  const newUser = await user.findOne({ _id: id, email });
  if (!newUser) return next(new errorHandler("Invalid User", 401));

  console.log(newUser.role, "role", newUser.role === "admin");

  if (newUser.role !== "admin") {
    return next(new errorHandler("You are not authorized", 403));
  }

  req.tokenId = id;
  req.tokenEmail = email;
  next();
});

export const verifyToken = asyncErrorHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new errorHandler("Token not found", 401));
  }

  const token = authHeader.split(" ")[1];
  const { id, email } = jwt.verify(token, secret);

  req.tokenId = id;
  req.tokenEmail = email;
  next();
});
