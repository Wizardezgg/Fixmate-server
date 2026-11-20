import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { usersCollection } from "../config/db.js";
import { AuthenticatedUser, UserRole } from "../types/index.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

interface TokenPayload extends JwtPayload {
  id?: string;
  sub?: string;
  email?: string;
  name?: string;
  role?: UserRole;
}

export async function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Missing or malformed authorization token",
      });
      return;
    }

    const token = authHeader.slice(7).trim();
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({
        success: false,
        message: "Server configuration error: JWT_SECRET not set",
      });
      return;
    }

    const decoded = jwt.verify(token, secret) as TokenPayload;
    if (!decoded.email) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid token payload",
      });
      return;
    }

    const dbUser = await usersCollection().findOne({ email: decoded.email });
    if (!dbUser) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: User account not found",
      });
      return;
    }

    req.user = {
      id: dbUser._id ? dbUser._id.toString() : decoded.id || decoded.sub || "",
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role || "customer",
      image: dbUser.image,
    };

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired token",
    });
  }
}

function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Unauthorized: Authentication required",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Requires ${allowedRoles.join(" or ")} role`,
      });
      return;
    }

    next();
  };
}

export const verifyCustomer = requireRole("customer");
export const verifyTechnician = requireRole("technician");
export const verifyAdmin = requireRole("admin");
