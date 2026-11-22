const rateLimit = require('express-rate-limit');

// Protects /auth/login from password guessing. Counter is per IP and resets after 15 minutes
// (or when the server restarts). Override with LOGIN_RATE_LIMIT in .env.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT) || 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' },
});

// Limits sign-ups per IP (default 20 per hour). Override with REGISTER_RATE_LIMIT in .env.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.REGISTER_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-up attempts. Please try again later.' },
});

module.exports = { loginLimiter, registerLimiter };