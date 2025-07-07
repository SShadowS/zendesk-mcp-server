# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides comprehensive access to the Zendesk API. It implements tools for managing tickets, users, organizations, and other Zendesk resources through a standardized MCP interface.

## Commands

### Development
- `npm start` - Start the MCP server
- `npm run dev` - Start the server with auto-restart on file changes
- `npm run inspect` - Launch the MCP Inspector to test server functionality

### Installation
- `npm install` - Install dependencies

Note: This project has no build step, test suite, or linting configured. The code runs directly as ES modules.

## Architecture

### Core Components

1. **Entry Point** (`src/index.js`):
   - Initializes the MCP server using stdio transport
   - Loads environment variables with dotenv
   - Tests Zendesk connection on startup

2. **Server Configuration** (`src/server.js`):
   - Creates and configures the McpServer instance
   - Registers all tool modules
   - Provides documentation resources via `zendesk://docs/{section}` URIs

3. **Zendesk Client** (`src/zendesk-client.js`):
   - Singleton client for all Zendesk API interactions
   - Handles authentication via Basic Auth with API tokens
   - Lazy loads credentials from environment variables
   - Provides methods for all Zendesk resources (tickets, users, organizations, etc.)
   - Includes connection testing on server startup

4. **Tool Modules** (`src/tools/*.js`):
   - Each file exports an array of tool definitions
   - Tools follow a consistent pattern with name, schema, handler, and description
   - Each tool uses the zendeskClient for API calls
   - Organized by Zendesk product area (support, talk, chat, help-center)

### Authentication

The server requires three environment variables:
- `ZENDESK_SUBDOMAIN` - Your Zendesk subdomain (e.g., "mycompany" for mycompany.zendesk.com)
- `ZENDESK_EMAIL` - Email address of the Zendesk user
- `ZENDESK_API_TOKEN` - API token for authentication

These should be configured in a `.env` file at the project root.

### Tool Pattern

All tools follow this structure:
```javascript
export const toolsArray = [
  {
    name: "tool_name",
    description: "Tool description",
    schema: z.object({
      // Zod schema for parameters
    }),
    handler: async (args) => {
      // Implementation using zendeskClient
    }
  }
];
```

### Error Handling

- The client wraps all API errors with descriptive messages
- Connection failures are caught but don't prevent server startup
- API responses include status codes and error details from Zendesk

## MCP Integration

This server is designed to be used with MCP clients. It provides:
- Tools for CRUD operations on all major Zendesk resources
- Documentation resources accessible via special URIs
- Proper error handling and response formatting for MCP

The server uses stdio transport, making it compatible with any MCP client that supports process-based servers.