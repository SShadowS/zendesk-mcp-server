#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initializeServer } from './server.js';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';

// Load environment variables
dotenv.config();

async function main(): Promise<void> {
  logger.info('Starting Zendesk API MCP server...');
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