#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initializeServer } from './server.js';
import { logger } from './utils/logger.js';

// Don't load dotenv when running as MCP server - environment is provided by MCP
// Only load for local development
if (process.env.NODE_ENV === 'development') {
  const dotenv = await import('dotenv');
  dotenv.config();
}

// Debug: Log environment variables (without exposing secrets)
logger.debug('Environment check', {
  ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN,
  ZENDESK_EMAIL: process.env.ZENDESK_EMAIL,
  hasZendeskApiToken: !!process.env.ZENDESK_API_TOKEN,
  hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
  nodeEnv: process.env.NODE_ENV,
  cwd: process.cwd()
});

async function main(): Promise<void> {
  // Get version from package.json
  const { readFileSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
  const version = packageJson.version;
  
  logger.info(`Starting Zendesk API MCP server v${version}...`);
  logger.debug('Environment loaded, debug mode:', logger.isDebugEnabled());

  try {
    // Initialize server and test connection
    logger.debug('Initializing server...');
    const server = await initializeServer();

    // Start receiving messages on stdin and sending messages on stdout
    logger.debug('Creating StdioServerTransport...');
    const transport = new StdioServerTransport();
    
    logger.debug('Connecting server to transport...');
    await server.connect(transport);
    
    logger.info('MCP server started successfully, waiting for connections...');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});