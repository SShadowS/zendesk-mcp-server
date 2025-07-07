# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides comprehensive access to the Zendesk API. It implements tools for managing tickets, users, organizations, and other Zendesk resources through a standardized MCP interface. The project is written in TypeScript for enhanced type safety and developer experience.

## Commands

### Development
- `npm start` - Start the MCP server (runs compiled JavaScript from dist/)
- `npm run dev` - Run TypeScript compiler in watch mode
- `npm run build` - Compile TypeScript to JavaScript
- `npm run build:clean` - Clean build directory and compile
- `npm run typecheck` - Run TypeScript type checking without emitting files
- `npm run start:dev` - Run the compiled server with auto-restart on changes
- `npm run inspect` - Launch the MCP Inspector to test server functionality

### Installation
- `npm install` - Install dependencies

## Architecture

### Core Components

1. **Entry Point** (`src/index.ts`):
   - Initializes the MCP server using stdio transport
   - Loads environment variables with dotenv
   - Tests Zendesk connection on startup
   - Includes error handling for graceful startup failures

2. **Server Configuration** (`src/server.ts`):
   - Creates and configures the McpServer instance
   - Registers all tool modules
   - Provides documentation resources via `zendesk://docs/{section}` URIs
   - Fully typed with TypeScript interfaces

3. **Zendesk Client** (`src/zendesk-client.ts`):
   - Singleton client for all Zendesk API interactions
   - Handles authentication via Basic Auth with API tokens
   - Lazy loads credentials from environment variables
   - Provides strongly typed methods for all Zendesk resources
   - Returns typed responses for all API operations
   - Includes connection testing on server startup

4. **Tool Modules** (`src/tools/*.ts`):
   - Each file exports an array of typed tool definitions
   - Tools follow a consistent pattern with name, schema, handler, and description
   - Each tool uses the zendeskClient for API calls
   - Organized by Zendesk product area (support, talk, chat, help-center)
   - All handlers are fully typed with parameter and return types

5. **Type Definitions** (`src/types/*.ts`):
   - Comprehensive type definitions for all Zendesk API resources
   - MCP tool and response type interfaces
   - Configuration and error type definitions
   - Ensures type safety across the entire codebase

### Authentication

The server requires the following environment variables:

**Zendesk Authentication (Required):**
- `ZENDESK_SUBDOMAIN` - Your Zendesk subdomain (e.g., "mycompany" for mycompany.zendesk.com)
- `ZENDESK_EMAIL` - Email address of the Zendesk user
- `ZENDESK_API_TOKEN` - API token for authentication

**Anthropic API (Optional - for image analysis features):**
- `ANTHROPIC_API_KEY` - API key for Anthropic Claude (required for `analyze_ticket_images` function)

These should be configured in a `.env` file at the project root.

### Tool Pattern

All tools follow this TypeScript structure:
```typescript
import { McpTool, McpToolResponse } from '../types/index.js';

export const toolsArray: McpTool[] = [
  {
    name: "tool_name",
    description: "Tool description",
    schema: {
      // Zod schema object for parameters
      param: z.string().describe("Parameter description")
    },
    handler: async (args: { param: string }): Promise<McpToolResponse> => {
      try {
        // Implementation using zendeskClient
        const result = await zendeskClient.someMethod(args.param);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  }
];
```

### Error Handling

- The client wraps all API errors with descriptive messages
- Custom error classes for different error types (rate limits, auth, validation, etc.)
- Retry logic with exponential backoff for transient failures
- Connection failures are caught but don't prevent server startup
- API responses include status codes and error details from Zendesk
- All errors are properly typed and return consistent MCP response format

## TypeScript Build Process

The project uses TypeScript for development with the following setup:

1. **Source Code**: All TypeScript source files are in `src/`
2. **Compiled Output**: JavaScript files are compiled to `dist/`
3. **Type Definitions**: Generated `.d.ts` files for library usage
4. **Source Maps**: Generated for debugging support

### Build Commands
- `npm run build` - Compile TypeScript files
- `npm run typecheck` - Type check without emitting files
- `npm run dev` - Watch mode for development

## MCP Integration

This server is designed to be used with MCP clients. It provides:
- Tools for CRUD operations on all major Zendesk resources
- Documentation resources accessible via special URIs
- Proper error handling and response formatting for MCP
- Fully typed interfaces for all tools and responses

The server uses stdio transport, making it compatible with any MCP client that supports process-based servers.