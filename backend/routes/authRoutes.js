const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const { signup, login } = require("../controllers/authControllers");

// Stricter limit here than the general API — login/signup are the classic
// brute-force / credential-stuffing target, so they get a tighter cap.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." }
});

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);

module.exports = router;