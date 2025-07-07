#!/usr/bin/env node
/**
 * This script demonstrates the raw JSON-RPC communication between 
 * Claude Code and MCP servers, showing the exact message format.
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Helper to generate unique request IDs
let requestId = 1;
function getNextId() {
  return requestId++;
}

// Helper to send JSON-RPC message
function sendMessage(proc, message) {
  const json = JSON.stringify(message);
  console.log('\n📤 Sending:', JSON.stringify(message, null, 2));
  proc.stdin.write(json + '\n');
}

// Helper to create a JSON-RPC request
function createRequest(method, params = undefined) {
  const request = {
    jsonrpc: "2.0",
    method: method,
    id: getNextId()
  };
  if (params !== undefined) {
    request.params = params;
  }
  return request;
}

async function demonstrateRawCommunication() {
  console.log('🔍 MCP Raw Communication Demo');
  console.log('=' .repeat(50));
  console.log('This shows the exact JSON-RPC messages exchanged.\n');

  // Check environment
  if (!process.env.ZENDESK_SUBDOMAIN || !process.env.ZENDESK_EMAIL || !process.env.ZENDESK_API_TOKEN) {
    console.error('❌ Missing required environment variables!');
    process.exit(1);
  }

  // Spawn the MCP server
  console.log('🚀 Starting MCP server...');
  const serverProcess = spawn('node', [join(__dirname, 'dist', 'index.js')], {
    env: {
      ...process.env,
      NODE_ENV: 'development'
    },
    stdio: ['pipe', 'pipe', 'inherit']
  });

  // Set up readline to parse server responses
  const rl = createInterface({
    input: serverProcess.stdout,
    crlfDelay: Infinity
  });

  // Track pending requests
  const pendingRequests = new Map();

  // Handle server responses
  rl.on('line', (line) => {
    try {
      const message = JSON.parse(line);
      console.log('\n📥 Received:', JSON.stringify(message, null, 2));
      
      // Handle response to our request
      if (message.id && pendingRequests.has(message.id)) {
        const resolver = pendingRequests.get(message.id);
        pendingRequests.delete(message.id);
        resolver(message);
      }
    } catch (error) {
      // Ignore non-JSON lines (e.g., debug output)
    }
  });

  // Helper to send request and wait for response
  function sendRequest(method, params) {
    return new Promise((resolve) => {
      const request = createRequest(method, params);
      pendingRequests.set(request.id, resolve);
      sendMessage(serverProcess, request);
    });
  }

  try {
    // Wait a bit for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n' + '='.repeat(50));
    console.log('📋 Step 1: Initialize connection');
    console.log('='.repeat(50));
    
    // 1. Initialize - This is what Claude Code sends first
    const initResponse = await sendRequest('initialize', {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: {},
        sampling: {}
      },
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    });

    console.log('\n✅ Initialization complete!');
    console.log(`Server: ${initResponse.result.serverInfo.name} v${initResponse.result.serverInfo.version}`);

    // 2. Notify initialized
    console.log('\n' + '='.repeat(50));
    console.log('📋 Step 2: Send initialized notification');
    console.log('='.repeat(50));
    
    sendMessage(serverProcess, {
      jsonrpc: "2.0",
      method: "notifications/initialized"
    });

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    // 3. List available tools
    console.log('\n' + '='.repeat(50));
    console.log('📋 Step 3: List available tools');
    console.log('='.repeat(50));
    
    const toolsResponse = await sendRequest('tools/list');
    console.log(`\n✅ Found ${toolsResponse.result.tools.length} tools`);
    console.log('First 3 tools:', toolsResponse.result.tools.slice(0, 3).map(t => t.name));

    // 4. Call a tool - This is how Claude Code executes tools
    console.log('\n' + '='.repeat(50));
    console.log('📋 Step 4: Call a tool (list_tickets)');
    console.log('='.repeat(50));
    
    const toolCallResponse = await sendRequest('tools/call', {
      name: "list_tickets",
      arguments: {
        per_page: 2,
        sort_order: "desc"
      }
    });

    console.log('\n✅ Tool call successful!');
    if (toolCallResponse.result.content?.[0]?.text) {
      const tickets = JSON.parse(toolCallResponse.result.content[0].text);
      console.log(`Received ${tickets.tickets?.length || 0} tickets`);
    }

    // 5. Call another tool with error handling
    console.log('\n' + '='.repeat(50));
    console.log('📋 Step 5: Call get_ticket (may fail if ID doesn\'t exist)');
    console.log('='.repeat(50));
    
    const ticketResponse = await sendRequest('tools/call', {
      name: "get_ticket",
      arguments: {
        id: 999999,  // Likely doesn't exist
        include_comments: false
      }
    });

    if (ticketResponse.error) {
      console.log('\n❌ Tool returned an error (expected):');
      console.log(`Code: ${ticketResponse.error.code}`);
      console.log(`Message: ${ticketResponse.error.message}`);
    } else if (ticketResponse.result.isError) {
      console.log('\n⚠️  Tool execution failed:');
      const errorContent = JSON.parse(ticketResponse.result.content[0].text);
      console.log(errorContent.error);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Demo completed! This is how Claude Code communicates with MCP servers.');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    // Clean up
    serverProcess.kill();
    rl.close();
  }
}

// Run the demo
demonstrateRawCommunication().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});