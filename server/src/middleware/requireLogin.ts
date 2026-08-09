// Middleware that blocks unauthenticated requests with a 401 response
import { Request, Response, NextFunction } from "express";

// Gate route access on Passport's isAuthenticated check
export function requireLogin(req: Request, res: Response, next: NextFunction) {
   if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Not authenticated" });
}

// Export as requireAuth as well for convenience
export const requireAuth = requireLogin;
