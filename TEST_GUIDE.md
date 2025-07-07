# MCP Server Testing Guide

This guide explains how to test the Zendesk MCP server and understand how Claude Code communicates with MCP servers.

## Overview

MCP (Model Context Protocol) servers communicate using JSON-RPC 2.0 over stdio. When Claude Code uses an MCP server:

1. It spawns the server process
2. Sends an `initialize` request
3. Sends an `initialized` notification
4. Can then call tools using `tools/call` requests

## Test Scripts

### 1. `test-mcp-client.js` - High-Level Test Client

This script uses the MCP SDK Client to test the server, similar to how Claude Code would use it.

```bash
# Run all test scenarios
npm run test:client

# Run a specific scenario
npm run test:client 0  # List tickets
npm run test:client 1  # Get a ticket
npm run test:client 2  # Search tickets
npm run test:client 3  # List users

# Show help
node test-mcp-client.js --help
```

### 2. `test-raw-communication.js` - Raw Protocol Demo

This script demonstrates the exact JSON-RPC messages exchanged between Claude Code and the MCP server.

```bash
npm run test:raw
```

This shows:
- The initialize handshake
- How tools are listed
- How tools are called with parameters
- The exact JSON-RPC format

### 3. MCP Inspector (Official Tool)

The official MCP Inspector provides a GUI for testing:

```bash
npm run inspect
```

## Understanding the Communication

### 1. Initialization Flow

```json
// Client → Server
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "id": 1,
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "claude-code",
      "version": "1.0.0"
    }
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "Zendesk API",
      "version": "1.0.0"
    }
  }
}
```

### 2. Tool Call Format

```json
// Client → Server
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": 2,
  "params": {
    "name": "list_tickets",
    "arguments": {
      "per_page": 5,
      "sort_order": "desc"
    }
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"tickets\": [...], \"count\": 5}"
      }
    ]
  }
}
```

## Authentication

The test scripts require the same environment variables as the server:

```bash
# In your .env file:
ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_EMAIL=your-email@example.com
ZENDESK_API_TOKEN=your-api-token
```

## Debugging

To see debug logs from the server while testing:

```bash
DEBUG=* npm run test:client
```

## Common Issues

1. **"Missing required environment variables"**
   - Ensure your `.env` file contains all required Zendesk credentials

2. **"Command failed: node dist/index.js"**
   - Run `npm run build` first to compile TypeScript

3. **Connection timeout**
   - Check that the server starts correctly with `npm start`
   - Verify environment variables are loaded

## Creating Your Own Test

Here's a minimal example of calling an MCP server:

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({
  name: "my-test",
  version: "1.0.0"
});

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: process.env
});

await client.connect(transport);

// Call a tool
const result = await client.callTool({
  name: "list_tickets",
  arguments: { per_page: 10 }
});

console.log(result);
await client.close();
```

## Protocol Details

- **Transport**: stdio (stdin/stdout)
- **Format**: JSON-RPC 2.0
- **Message Delimiter**: Newline (`\n`)
- **Required Methods**:
  - `initialize` - Handshake
  - `tools/list` - List available tools
  - `tools/call` - Execute a tool

## Further Reading

- [MCP Specification](https://modelcontextprotocol.io/docs)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)