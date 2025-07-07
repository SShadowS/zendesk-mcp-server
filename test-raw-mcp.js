#!/usr/bin/env node
/**
 * Raw MCP protocol test - shows exact JSON-RPC messages
 * 
 * This script demonstrates the raw JSON-RPC communication between
 * MCP client and server, useful for debugging parameter issues.
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

let messageId = 1;

function sendMessage(proc, method, params = {}) {
  const message = {
    jsonrpc: '2.0',
    id: messageId++,
    method,
    params
  };
  
  const json = JSON.stringify(message);
  console.log(`\n${colors.blue}→ CLIENT:${colors.reset}`);
  console.log(colors.gray + JSON.stringify(message, null, 2) + colors.reset);
  
  proc.stdin.write(json + '\n');
  return message.id;
}

async function runRawTest() {
  console.log(`${colors.cyan}🔬 Raw MCP Protocol Test${colors.reset}\n`);

  // Check environment
  const required = ['ZENDESK_SUBDOMAIN', 'ZENDESK_EMAIL', 'ZENDESK_API_TOKEN'];
  const missing = required.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error(`${colors.red}❌ Missing: ${missing.join(', ')}${colors.reset}`);
    process.exit(1);
  }

  // Spawn server
  const serverPath = join(__dirname, 'dist', 'index.js');
  console.log(`${colors.yellow}Starting server: ${serverPath}${colors.reset}`);
  
  const proc = spawn('node', [serverPath], {
    env: { ...process.env, DEBUG: 'true' },
    stdio: ['pipe', 'pipe', 'inherit']
  });

  // Read responses
  const rl = createInterface({
    input: proc.stdout,
    crlfDelay: Infinity
  });

  rl.on('line', (line) => {
    try {
      const message = JSON.parse(line);
      console.log(`\n${colors.green}← SERVER:${colors.reset}`);
      console.log(colors.gray + JSON.stringify(message, null, 2) + colors.reset);
    } catch (e) {
      // Not JSON, ignore
    }
  });

  // Wait a bit for server to start
  await new Promise(resolve => setTimeout(resolve, 500));

  // Send initialize
  console.log(`\n${colors.yellow}1. INITIALIZE${colors.reset}`);
  sendMessage(proc, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {
      roots: {}
    },
    clientInfo: {
      name: 'test-raw-client',
      version: '1.0.0'
    }
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send initialized notification
  console.log(`\n${colors.yellow}2. INITIALIZED NOTIFICATION${colors.reset}`);
  proc.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  }) + '\n');

  await new Promise(resolve => setTimeout(resolve, 500));

  // List tools
  console.log(`\n${colors.yellow}3. LIST TOOLS${colors.reset}`);
  sendMessage(proc, 'tools/list');

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Call get_ticket with string parameters (as MCP sends them)
  console.log(`\n${colors.yellow}4. CALL TOOL - get_ticket (string parameters)${colors.reset}`);
  sendMessage(proc, 'tools/call', {
    name: 'get_ticket',
    arguments: {
      id: "215696",              // String, not number
      include_comments: "true"    // String, not boolean
    }
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Call with number parameters (to show the difference)
  console.log(`\n${colors.yellow}5. CALL TOOL - get_ticket (number parameters - should fail)${colors.reset}`);
  sendMessage(proc, 'tools/call', {
    name: 'get_ticket',
    arguments: {
      id: 215696,                // Number
      include_comments: true      // Boolean
    }
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Clean up
  console.log(`\n${colors.yellow}Closing...${colors.reset}`);
  proc.kill();
}

runRawTest().catch(console.error);