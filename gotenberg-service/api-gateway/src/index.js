const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const authMiddleware = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;
const GOTENBERG_URL = process.env.GOTENBERG_URL || 'http://gotenberg:3000';

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for file downloads
}));

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) }}));

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'gotenberg-gateway', version: '1.0.0' });
});

// Apply middleware to all other routes
app.use(authMiddleware);
app.use(rateLimiter);

// Proxy configuration for Gotenberg
const gotenbergProxy = createProxyMiddleware({
  target: GOTENBERG_URL,
  changeOrigin: true,
  // Don't parse the body - let it stream through
  onProxyReq: (proxyReq, req, res) => {
    // Log the request
    logger.info(`Proxying request: ${req.method} ${req.path} from API key: ${req.apiKeyId}`);
    
    // Remove our custom headers before forwarding
    proxyReq.removeHeader('x-api-key');
    proxyReq.removeHeader('x-api-key-id');
  },
  onProxyRes: (proxyRes, req, res) => {
    // Log the response
    logger.info(`Proxy response: ${proxyRes.statusCode} for ${req.method} ${req.path}`);
  },
  onError: (err, req, res) => {
    logger.error('Proxy error:', err);
    res.status(502).json({ error: 'Bad Gateway', message: 'Error communicating with conversion service' });
  },
});

// Proxy all requests to Gotenberg
app.use('/', gotenbergProxy);

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`API Gateway listening on port ${PORT}`);
  logger.info(`Proxying to Gotenberg at ${GOTENBERG_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    logger.info('HTTP server closed');
  });
});