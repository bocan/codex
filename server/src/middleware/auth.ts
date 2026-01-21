import { Request, Response, NextFunction } from "express";
import { authConfig } from "../config/auth";

// Extend Express session type
declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
  }
}

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // If auth is disabled, allow all requests
  if (!authConfig.isAuthEnabled()) {
    next();
    return;
  }

  // Check if user is authenticated
  if (req.session.authenticated) {
    next();
    return;
  }

  // Not authenticated
  res.status(401).json({ error: "Authentication required" });
};
