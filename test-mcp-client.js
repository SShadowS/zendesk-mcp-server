#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// Load environment variables
config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Helper function to print colored output
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Test scenarios
const testScenarios = [
  {
    name: "List tickets (first 5)",
    tool: "list_tickets",
    params: {
      per_page: 5,
      sort_by: "created_at",
      sort_order: "desc"
    }
  },
  {
    name: "Get a specific ticket",
    tool: "get_ticket",
    params: {
      id: 1,  // You may need to adjust this ID
      include_comments: true
    }
  },
  {
    name: "Search for tickets",
    tool: "search",
    params: {
      query: "type:ticket status:open",
      per_page: 3
    }
  },
  {
    name: "List users",
    tool: "list_users",
    params: {
      per_page: 5
    }
  }
];

async function testMcpServer() {
  log("\n🔧 MCP Server Test Client", colors.bright + colors.cyan);
  log("=" .repeat(50), colors.dim);

  // Check environment variables
  if (!process.env.ZENDESK_SUBDOMAIN || !process.env.ZENDESK_EMAIL || !process.env.ZENDESK_API_TOKEN) {
    log("\n❌ Error: Missing required environment variables", colors.red);
    log("Please ensure the following are set in your .env file:", colors.yellow);
    log("  - ZENDESK_SUBDOMAIN", colors.yellow);
    log("  - ZENDESK_EMAIL", colors.yellow);
    log("  - ZENDESK_API_TOKEN", colors.yellow);
    process.exit(1);
  }

  // Create client
  const client = new Client({
    name: "test-mcp-client",
    version: "1.0.0"
  }, {
    capabilities: {}
  });

  // Set up transport to spawn the server
  const transport = new StdioClientTransport({
    command: "node",
    args: [join(__dirname, "dist", "index.js")],
    env: {
      ...process.env,
      NODE_ENV: 'development'  // Ensure dotenv loads in the server
    }
  });

  try {
    // Connect to server
    log("\n📡 Connecting to MCP server...", colors.yellow);
    await client.connect(transport);
    log("✅ Connected successfully!", colors.green);

    // Get server info
    const serverCapabilities = client.getServerCapabilities();
    const serverInfo = client.getServerVersion();
    
    log("\n📋 Server Information:", colors.bright);
    log(`  Name: ${serverInfo?.name}`, colors.cyan);
    log(`  Version: ${serverInfo?.version}`, colors.cyan);
    
    if (serverCapabilities?.tools) {
      log("  Supports tools: ✓", colors.green);
    }

    // List available tools
    log("\n🔨 Fetching available tools...", colors.yellow);
    const toolsResponse = await client.listTools();
    log(`✅ Found ${toolsResponse.tools.length} tools`, colors.green);

    // Show first few tools as example
    log("\n📌 Sample tools:", colors.bright);
    toolsResponse.tools.slice(0, 5).forEach(tool => {
      log(`  • ${tool.name}`, colors.cyan);
      if (tool.description) {
        log(`    ${tool.description}`, colors.dim);
      }
    });

    // Get scenario to run from command line or run all
    const scenarioArg = process.argv[2];
    let scenariosToRun = testScenarios;
    
    if (scenarioArg) {
      const scenarioIndex = parseInt(scenarioArg);
      if (!isNaN(scenarioIndex) && scenarioIndex >= 0 && scenarioIndex < testScenarios.length) {
        scenariosToRun = [testScenarios[scenarioIndex]];
      } else {
        log(`\n⚠️  Invalid scenario index. Running all scenarios.`, colors.yellow);
      }
    }

    // Run test scenarios
    log("\n🧪 Running test scenarios...", colors.bright + colors.magenta);
    log("=" .repeat(50), colors.dim);

    for (const scenario of scenariosToRun) {
      log(`\n📍 ${scenario.name}`, colors.bright + colors.blue);
      log(`  Tool: ${scenario.tool}`, colors.cyan);
      log(`  Parameters:`, colors.cyan);
      console.log(JSON.stringify(scenario.params, null, 4));

      try {
        log("\n  ⏳ Calling tool...", colors.yellow);
        
        // This is how Claude Code calls MCP tools
        const result = await client.callTool({
          name: scenario.tool,
          arguments: scenario.params
        });

        log("  ✅ Success! Response:", colors.green);
        
        // Parse and pretty print the response
        if (result.content && result.content.length > 0) {
          const content = result.content[0];
          if (content.type === 'text' && content.text) {
            try {
              const parsed = JSON.parse(content.text);
              console.log(JSON.stringify(parsed, null, 2));
            } catch {
              // If not JSON, print as is
              log(`  ${content.text}`, colors.reset);
            }
          }
        }
      } catch (error) {
        log(`  ❌ Error: ${error.message}`, colors.red);
        if (error.code) {
          log(`  Error code: ${error.code}`, colors.red);
        }
      }
    }

    log("\n" + "=" .repeat(50), colors.dim);
    log("✅ All tests completed!", colors.green);

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, colors.red);
    console.error(error);
  } finally {
    // Clean up
    log("\n🔌 Closing connection...", colors.yellow);
    await client.close();
    log("👋 Goodbye!", colors.cyan);
  }
}

// Show usage if --help is passed
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  log("\n📚 MCP Server Test Client", colors.bright + colors.cyan);
  log("\nUsage:", colors.bright);
  log("  node test-mcp-client.js [scenario-index]", colors.green);
  log("\nExamples:", colors.bright);
  log("  node test-mcp-client.js          # Run all test scenarios", colors.green);
  log("  node test-mcp-client.js 0        # Run only the first scenario", colors.green);
  log("  node test-mcp-client.js 1        # Run only the second scenario", colors.green);
  log("\nAvailable scenarios:", colors.bright);
  testScenarios.forEach((scenario, index) => {
    log(`  ${index}: ${scenario.name}`, colors.cyan);
  });
  process.exit(0);
}

// Run the test
testMcpServer().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});