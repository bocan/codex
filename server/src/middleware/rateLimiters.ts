import rateLimit from "express-rate-limit";

/**
 * Rate limiter for file operations (create, update, delete, rename, move)
 * These are expensive operations that modify the file system and git history
 * Limit: 30 requests per minute per IP
 */
export const fileOperationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: "Too many file operations, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for file transfers (upload/download attachments)
 * These are expensive I/O operations that can consume bandwidth
 * Limit: 60 requests per minute per IP (higher than operations since viewing attachments is common)
 */
export const fileTransferLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { error: "Too many file transfers, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for search operations
 * Search can be expensive as it scans multiple files
 * Limit: 60 requests per minute per IP
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { error: "Too many search requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});
