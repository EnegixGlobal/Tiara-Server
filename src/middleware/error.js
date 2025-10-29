import errorHandler from "../utils/errorHandler.js";

const errorHandlerMiddleware = (err, req, res, next) => {
  console.log(err);

  err.statusCode = err.statusCode || 500;
  err.message = err.message || "Internal Server Error";

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((value) => value.message)
      .join(", ");
    err = new errorHandler(message, 400);
  }

  // Invalid MongoDB ObjectId error
  if (err.name === "CastError") {
    const message = `Resource not found. Invalid: ${err.path}`;
    err = new errorHandler(message, 400);
  }

  // Duplicate key error (MongoDB)
  if (err.code === 11000) {
    const message = `Duplicate ${Object.keys(err.keyValue)} entered`;
    err = new errorHandler(message, 400);
  }

  // Invalid JWT token
  if (err.name === "JsonWebTokenError") {
    const message = "JSON Web Token is invalid. Please try again.";
    err = new errorHandler(message, 400);
  }

  // Expired JWT token
  if (err.name === "TokenExpiredError") {
    const message = "JSON Web Token has expired. Please try again.";
    err = new errorHandler(message, 400);
  }

  res.status(err.statusCode).json({
    success: false,
    message: err.message,
  });
};

export default errorHandlerMiddleware;
