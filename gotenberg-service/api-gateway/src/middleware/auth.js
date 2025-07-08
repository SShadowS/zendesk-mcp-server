const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Load API keys from file
const apiKeysPath = path.join(process.cwd(), 'api-keys.json');
let apiKeys = {};

function loadApiKeys() {
  try {
    const data = fs.readFileSync(apiKeysPath, 'utf8');
    apiKeys = JSON.parse(data);
    logger.info(`Loaded ${Object.keys(apiKeys).length} API keys`);
  } catch (error) {
    logger.error('Failed to load API keys:', error);
    process.exit(1);
  }
}

// Reload API keys every 5 minutes
loadApiKeys();
setInterval(loadApiKeys, 5 * 60 * 1000);

// Middleware function
module.exports = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key', message: 'X-API-Key header is required' });
  }
  
  const keyData = apiKeys[apiKey];
  
  if (!keyData) {
    logger.warn(`Invalid API key attempt: ${apiKey.substring(0, 8)}...`);
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  if (keyData.disabled) {
    logger.warn(`Disabled API key used: ${keyData.name}`);
    return res.status(401).json({ error: 'API key disabled' });
  }
  
  // Add key info to request for logging
  req.apiKeyId = keyData.id;
  req.apiKeyName = keyData.name;
  
  next();
};