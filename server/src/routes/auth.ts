// Authentication routes: register, login, logout, profile, and password reset

import { Router } from "express";
import bcrypt from "bcryptjs";
import passport from "passport";
import { User } from "../models/User";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../utils/email";

const router = Router();

// POST /register — create a new user account and auto-login
router.post("/register", async (req, res, next) => {
  try {
    console.log("Register endpoint hit with body:", req.body);
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    console.log("Checking for existing user with email:", email);
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already used" });

    console.log("Hashing password...");
    const passwordHash = await bcrypt.hash(password, 10);
    console.log("Creating user...");
    const user = await User.create({ email, passwordHash });
    console.log("User created:", user.id);

    console.log("Logging in user...");
    req.login(user, err => {
      if (err) {
        console.error("Login error during registration:", err);
        return next(err);
      }
      console.log("Registration successful for user:", user.id);
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
router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err: any, user: any, info: any) => {
    if (err) {
      console.error("Login error:", err);
      return next(err);
    }
    if (!user) {
      console.log("Login failed:", info);
      return res.status(401).json({ message: info?.message || "Invalid credentials" });
    }
    req.login(user, (err) => {
      if (err) {
        console.error("Session creation error:", err);
        return next(err);
      }
      console.log("Login successful, user:", user);
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
router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists for security
      return res.json({ message: "If an account exists, a reset link will be sent" });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    user.resetToken = resetToken;
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
router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);
    user.passwordHash = passwordHash;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    console.log(`Password reset successful for ${user.email}`);
    res.json({ message: "Password has been reset successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
