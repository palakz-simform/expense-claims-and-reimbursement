import { rateLimit } from "express-rate-limit";

// Same JSON error shape as the rest of the API
const tooMany = { error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" } };

// Loose safety net for every route (stops a runaway client or a flood)
// 300 requests per minute
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8", // RateLimit-* response headers
  legacyHeaders: false, // no old X-RateLimit-* headers
  message: tooMany,
});

// Strict limit on login only (brute-force protection). Successful logins do not count, so a real user is not locked out by their own correct logins.
// 10 login requests within 15 mins
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: tooMany,
});
