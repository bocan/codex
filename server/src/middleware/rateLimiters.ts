import rateLimit from "express-rate-limit";

/**
 * Rate limiter for read operations (get pages, list folders, view history)
 * These read from the file system but don't modify it
 * Limit: 120 requests per minute per IP
 */
export const readLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: "Too many read requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for static file serving
 * Used for serving the SPA and static assets
 * Limit: 200 requests per minute per IP (generous for page loads with many assets)
 */
export const staticFileLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  message: { error: "Too many requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for health check and metadata endpoints
 * These are lightweight but should still be protected
 * Limit: 60 requests per minute per IP
 */
export const healthCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { error: "Too many health check requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

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

/**
 * Rate limiter for AI chat operations
 * AI calls are expensive (API costs and server resources)
 * Limit: 20 requests per minute per IP
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { error: "Too many AI requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});
