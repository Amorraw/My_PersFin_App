// Authentication routes: register, login, logout, profile, and password reset

import { Router } from "express";
import bcrypt from "bcryptjs";
import passport from "passport";
import rateLimit from "express-rate-limit";
import { User } from "../models/User";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../utils/email";
import { hashToken } from "../utils/crypto";

const router = Router();

const MIN_PASSWORD_LENGTH = 8;

// Throttle credential-guessing endpoints (login, register, reset-password)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

// Stricter limit for password-reset emails to prevent inbox bombing of other users
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

// POST /register — create a new user account and auto-login
router.post("/register", authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Email and password required" });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already used" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash });

    req.login(user, err => {
      if (err) {
        console.error("Login error during registration:", err);
        return next(err);
      }
      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          province: user.province || "ON",
          demoProfileIndex: user.demoProfileIndex ?? null,
        }
      });
    });
  } catch (err) {
    console.error("Registration error:", err);
    next(err);
  }
});

// POST /login — authenticate with email/password via Passport local strategy
router.post("/login", authLimiter, (req, res, next) => {
  passport.authenticate("local", (err: any, user: any, info: any) => {
    if (err) {
      console.error("Login error:", err);
      return next(err);
    }
    if (!user) {
      return res.status(401).json({ message: info?.message || "Invalid credentials" });
    }
    req.login(user, (err) => {
      if (err) {
        console.error("Session creation error:", err);
        return next(err);
      }
      res.json({ user: { id: user.id || user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, province: user.province || "ON", demoProfileIndex: user.demoProfileIndex ?? null } });
    });
  })(req, res, next);
});

// POST /logout — destroy the current session
router.post("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

// GET /me — return the currently authenticated user's profile
router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ user: null });
  const user = req.user as any;
  res.json({
    user: {
      id: user.id || user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      province: user.province || "ON",
      demoProfileIndex: user.demoProfileIndex ?? null,
    },
  });
});

// PUT /profile — update firstName, lastName, and/or province for the logged-in user
router.put("/profile", async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const userId = (req.user as any)._id;
    const { firstName, lastName, province } = req.body;

    const VALID_PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];
    if (province && !VALID_PROVINCES.includes(province)) {
      return res.status(400).json({ message: "Invalid province code" });
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { ...(firstName !== undefined && { firstName }),
        ...(lastName  !== undefined && { lastName  }),
        ...(province  !== undefined && { province  }) },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "User not found" });

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        province: updated.province || "ON",
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /forgot-password — send a one-hour password reset link to the user's email
router.post("/forgot-password", passwordResetLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (typeof email !== "string" || !email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists for security
      return res.json({ message: "If an account exists, a reset link will be sent" });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    user.resetTokenHash = hashToken(resetToken);
    user.resetTokenExpires = resetTokenExpires;
    await user.save();

    const appUrl = process.env.APP_URL || "http://localhost:5176";
    await sendPasswordResetEmail(email, resetToken, appUrl);

    res.json({ message: "If an account exists, a reset link will be sent" });
  } catch (err) {
    next(err);
  }
});

// POST /reset-password — validate token and replace the user's password
router.post("/reset-password", authLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (typeof token !== "string" || typeof password !== "string" || !token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const user = await User.findOne({
      resetTokenHash: hashToken(token),
      resetTokenExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);
    user.passwordHash = passwordHash;
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    console.log(`Password reset successful for ${user.email}`);
    res.json({ message: "Password has been reset successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
