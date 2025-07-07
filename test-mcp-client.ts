#!/usr/bin/env tsx
/**
 * Test client for Zendesk MCP Server
 * 
 * This script simulates how Claude Code calls MCP server tools,
 * useful for debugging authentication and parameter issues.
 * 
 * Usage:
 *   npm install -g tsx
 *   tsx test-mcp-client.ts [tool-name] [--debug]
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
const toolName = args.find(arg => !arg.startsWith('--')) || 'list_tickets';
const debug = args.includes('--debug');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logDebug(message: string, data?: any) {
  if (debug) {
    console.error(`${colors.gray}[DEBUG] ${message}${colors.reset}`);
    if (data) {
      console.error(colors.gray + JSON.stringify(data, null, 2) + colors.reset);
    }
  }
}

// Test scenarios for different tools
const testScenarios: Record<string, { tool: string; args: any }> = {
  // Tickets
  list_tickets: {
    tool: 'list_tickets',
    args: { limit: 5 }
  },
  get_ticket: {
    tool: 'get_ticket',
    args: { 
      id: "215696",  // String to simulate MCP parameter passing
      include_comments: "true"  // String boolean
    }
  },
  create_ticket: {
    tool: 'create_ticket',
    args: {
      subject: "Test ticket from MCP client",
      description: "This is a test ticket created to verify MCP integration",
      priority: "normal",
      type: "incident"
    }
  },
  update_ticket: {
    tool: 'update_ticket',
    args: {
      id: "215696",
      status: "pending",
      comment: "Testing MCP update functionality"
    }
  },
  
  // Users
  list_users: {
    tool: 'list_users',
    args: { limit: 5 }
  },
  get_user: {
    tool: 'get_user',
    args: { id: "123456" }
  },
  
  // Organizations
  list_organizations: {
    tool: 'list_organizations',
    args: { limit: 5 }
  },
  
  // Search
  search: {
    tool: 'search',
    args: {
      query: "type:ticket status:open",
      limit: "5"
    }
  }
};

async function runTest() {
  log('🚀 Zendesk MCP Server Test Client', colors.bright);
  log('================================\n', colors.bright);

  // Check environment variables
  const requiredEnvVars = ['ZENDESK_SUBDOMAIN', 'ZENDESK_EMAIL', 'ZENDESK_API_TOKEN'];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    log(`❌ Missing required environment variables: ${missingVars.join(', ')}`, colors.red);
    log('\nPlease set the following environment variables:', colors.yellow);
    log('  export ZENDESK_SUBDOMAIN=your-subdomain', colors.gray);
    log('  export ZENDESK_EMAIL=your-email@example.com', colors.gray);
    log('  export ZENDESK_API_TOKEN=your-api-token', colors.gray);
    process.exit(1);
  }

  log('✅ Environment variables configured', colors.green);
  log(`  Subdomain: ${process.env.ZENDESK_SUBDOMAIN}`, colors.gray);
  log(`  Email: ${process.env.ZENDESK_EMAIL}`, colors.gray);
  log(`  API Token: ${process.env.ZENDESK_API_TOKEN ? '***' : 'NOT SET'}\n`, colors.gray);

  // Create transport by spawning the server process
  const serverPath = join(__dirname, 'dist', 'index.js');
  log(`📦 Starting server: ${serverPath}`, colors.cyan);
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      DEBUG: debug ? 'true' : ''
    }
  });

  // Create client
  const client = new Client({
    name: 'test-mcp-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  try {
    // Connect to server
    log('🔌 Connecting to server...', colors.cyan);
    logDebug('Client connecting with transport');
    
    await client.connect(transport);
    
    log('✅ Connected successfully\n', colors.green);

    // List available tools
    log('🔧 Available Tools:', colors.blue);
    const tools = await client.listTools();
    logDebug('Available tools:', tools);
    
    const toolNames = tools.tools.map(t => t.name);
    for (const tool of toolNames.slice(0, 10)) {
      log(`  - ${tool}`, colors.gray);
    }
    if (toolNames.length > 10) {
      log(`  ... and ${toolNames.length - 10} more`, colors.gray);
    }
    log('');

    // Get test scenario
    const scenario = testScenarios[toolName];
    if (!scenario) {
      log(`❌ Unknown test scenario: ${toolName}`, colors.red);
      log('\nAvailable test scenarios:', colors.yellow);
      Object.keys(testScenarios).forEach(name => {
        log(`  - ${name}`, colors.gray);
      });
      process.exit(1);
    }

    // Call the tool
    log(`📞 Calling tool: ${scenario.tool}`, colors.blue);
    log(`   Parameters: ${JSON.stringify(scenario.args, null, 2)}`, colors.gray);
    logDebug('Sending tool call request:', { name: scenario.tool, arguments: scenario.args });

    const startTime = Date.now();
    const result = await client.callTool({
      name: scenario.tool,
      arguments: scenario.args
    });
    const duration = Date.now() - startTime;

    logDebug('Tool call response:', result);

    // Display results
    log(`\n✅ Tool executed successfully (${duration}ms)`, colors.green);
    log('\n📊 Results:', colors.blue);
    
    if (result.content && result.content.length > 0) {
      for (const content of result.content) {
        if (content.type === 'text') {
          // Try to parse and pretty print JSON
          try {
            const data = JSON.parse(content.text);
            console.log(JSON.stringify(data, null, 2));
          } catch {
            // Not JSON, print as-is
            console.log(content.text);
          }
        }
      }
    } else {
      log('No content returned', colors.gray);
    }

  } catch (error: any) {
    log(`\n❌ Error: ${error.message}`, colors.red);
    logDebug('Full error:', error);
    
    if (error.code === 'ENOENT') {
      log('\n💡 Server not found. Make sure to build the TypeScript project first:', colors.yellow);
      log('   npm run build', colors.gray);
    } else if (error.message.includes('Authentication')) {
      log('\n💡 Authentication failed. Check your Zendesk credentials:', colors.yellow);
      log('   - Verify ZENDESK_SUBDOMAIN is correct', colors.gray);
      log('   - Verify ZENDESK_EMAIL is correct', colors.gray);
      log('   - Verify ZENDESK_API_TOKEN is valid', colors.gray);
      log('   - Make sure the API token has the necessary permissions', colors.gray);
    }
    
    process.exit(1);
  } finally {
    // Clean up
    log('\n🧹 Closing connection...', colors.cyan);
    await client.close();
    log('✅ Connection closed', colors.green);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  log('\n\n⚠️  Interrupted, cleaning up...', colors.yellow);
  process.exit(0);
});

// Run the test
runTest().catch(error => {
  log(`\n💥 Unexpected error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});