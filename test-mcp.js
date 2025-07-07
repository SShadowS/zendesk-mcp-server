#!/usr/bin/env node
/**
 * Simple MCP test script for Zendesk MCP Server
 * 
 * This JavaScript version can be run directly without TypeScript compilation.
 * It simulates how Claude Code calls MCP server tools.
 * 
 * Usage:
 *   node test-mcp.js [tool-name] [--debug]
 *   
 * Examples:
 *   node test-mcp.js list_tickets
 *   node test-mcp.js get_ticket --debug
 *   ZENDESK_SUBDOMAIN=mycompany ZENDESK_EMAIL=me@example.com ZENDESK_API_TOKEN=abc123 node test-mcp.js
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
const toolName = args.find(arg => !arg.startsWith('--')) || 'list_tickets';
const debug = args.includes('--debug');

// Test scenarios
const scenarios = {
  list_tickets: {
    tool: 'list_tickets',
    args: { limit: 5 }
  },
  get_ticket: {
    tool: 'get_ticket',
    args: { 
      id: "215696",  // String to simulate MCP parameter passing
      include_comments: "true"
    }
  }
};

async function test() {
  console.log('🚀 Testing Zendesk MCP Server\n');

  // Check environment
  const required = ['ZENDESK_SUBDOMAIN', 'ZENDESK_EMAIL', 'ZENDESK_API_TOKEN'];
  const missing = required.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing: ${missing.join(', ')}`);
    console.error('\nSet environment variables:');
    console.error('  export ZENDESK_SUBDOMAIN=your-subdomain');
    console.error('  export ZENDESK_EMAIL=your-email@example.com');
    console.error('  export ZENDESK_API_TOKEN=your-api-token');
    process.exit(1);
  }

  // Create transport
  const serverPath = join(__dirname, 'dist', 'index.js');
  console.log(`📦 Server: ${serverPath}`);
  
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
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  try {
    // Connect
    console.log('🔌 Connecting...');
    await client.connect(transport);
    console.log('✅ Connected\n');

    // Get scenario
    const scenario = scenarios[toolName];
    if (!scenario) {
      console.error(`❌ Unknown scenario: ${toolName}`);
      console.error(`Available: ${Object.keys(scenarios).join(', ')}`);
      process.exit(1);
    }

    // Call tool
    console.log(`📞 Calling: ${scenario.tool}`);
    console.log(`   Args: ${JSON.stringify(scenario.args)}`);

    const result = await client.callTool({
      name: scenario.tool,
      arguments: scenario.args
    });

    // Show results
    console.log('\n📊 Results:');
    if (result.content?.[0]?.type === 'text') {
      try {
        const data = JSON.parse(result.content[0].text);
        console.log(JSON.stringify(data, null, 2));
      } catch {
        console.log(result.content[0].text);
      }
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (debug) console.error(error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✅ Done');
  }
}

test().catch(console.error);