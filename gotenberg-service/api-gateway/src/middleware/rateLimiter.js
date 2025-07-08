const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Create different limiters for different endpoints
const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each API key to 100 requests per windowMs
  message: 'Too many requests from this API key, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.apiKeyId || 'anonymous',
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for API key: ${req.apiKeyName} (${req.apiKeyId})`);
    res.status(429).json({ 
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Stricter limits for conversion endpoints
const conversionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Limit each API key to 20 conversions per 5 minutes
  keyGenerator: (req) => req.apiKeyId || 'anonymous',
});

module.exports = (req, res, next) => {
  // Apply stricter limits to conversion endpoints
  if (req.path.includes('/forms/') || req.path.includes('/convert')) {
    conversionLimiter(req, res, () => defaultLimiter(req, res, next));
  } else {
    defaultLimiter(req, res, next);
  }
};