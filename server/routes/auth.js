const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/User");

const router = express.Router();

/**
 * ✅ Signup - Create user + set session
 * POST /api/auth/signup
 * body: { name, email, password }
 */
router.post("/signup", async (req, res) => {
  try {
    const { name = "", email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email & password required" });
    }

    const existing = await User.findOne({ email }).lean();
    if (existing) return res.status(400).json({ error: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });

    // ✅ IMPORTANT: session set
    req.session.userId = String(user._id);

    return res.json({
      user: { _id: user._id, name: user.name, email: user.email },
    });
  } catch (e) {
    console.error("signup error:", e);
    return res.status(500).json({ error: "Signup failed" });
  }
});

/**
 * ✅ Login - Verify user + set session
 * POST /api/auth/login
 * body: { email, password }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email & password required" });
    }

    const user = await User.findOne({ email }).lean();
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    // ✅ IMPORTANT: session set
    req.session.userId = String(user._id);

    return res.json({
      user: { _id: user._id, name: user.name, email: user.email },
    });
  } catch (e) {
    console.error("login error:", e);
    return res.status(500).json({ error: "Login failed" });
  }
});

/**
 * ✅ Current user from session
 * GET /api/auth/me
 */
router.get("/me", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.json({ user: null });

    const user = await User.findById(userId).select("_id name email").lean();
    return res.json({ user: user || null });
  } catch (e) {
    console.error("me error:", e);
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

/**
 * ✅ Logout - destroy session + clear sid cookie
 * POST /api/auth/logout
 */
router.post("/logout", (req, res) => {
  try {
    req.session.destroy(() => {
      res.clearCookie("sid"); // this matches session cookie name in server
      return res.json({ ok: true });
    });
  } catch (e) {
    console.error("logout error:", e);
    return res.status(500).json({ error: "Logout failed" });
  }
});

module.exports = router;
