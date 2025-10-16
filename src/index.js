#!/usr/bin/env node
import dotenv from 'dotenv';
import { startHttpServer } from './http-server.js';

// Load environment variables
dotenv.config();

console.log('Starting Zendesk MCP Server in HTTP mode...');

// Start HTTP server
startHttpServer();
