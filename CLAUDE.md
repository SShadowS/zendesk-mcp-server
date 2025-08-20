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

## Document Analysis with External Converter

### Office Document Processing
The system uses an external converter API to process Office documents (DOCX, XLSX, etc.) into PDFs for comprehensive Claude analysis:

1. **Converter API** (`src/utils/converter-client.js`):
   - Converts Office documents to PDF format via https://converter.sshadows.dk
   - Preserves embedded images and formatting
   - Handles rate limiting (20 requests per 5 minutes)
   - 30-second timeout for large files
   - Configurable via `CONVERTER_API_KEY` and `CONVERTER_API_URL` environment variables

2. **Document Handler** (`src/utils/document-handler.js`):
   - Routes Office files to converter API
   - Returns PDF for Claude to analyze
   - Includes proper error handling and retry logic

3. **Benefits**:
   - Claude can analyze embedded images in documents
   - No local LibreOffice installation required
   - Simplified codebase without complex dependencies (removed mammoth, xlsx, libreoffice-convert)
   - Better handling of image-heavy documents
   - Consistent PDF output for all Office formats

### Testing Document Analysis
Use the test scripts to verify document processing:

**Test converter API directly:**
```bash
node test-converter.js
```

**Test document analysis with a ticket:**
```bash
node test-document-integration.js <ticket-id>
```

These scripts:
- Load environment variables from `.env`
- Test the converter API integration
- Verify PDF conversion works correctly
- Help debug conversion issues
- Bypass MCP Inspector caching issues

### Debugging Document Conversion Issues

If you encounter issues with document conversion:

1. **Rate limiting**: API allows 20 conversions per 5 minutes - wait if rate limited
2. **Verify code is updated**: The MCP Inspector may cache code - kill all node processes and restart
3. **Use test scripts**: `node test-converter.js` tests the API directly
4. **Check API key**: Ensure CONVERTER_API_KEY is set correctly (default provided)
5. **Kill cached processes**: `pkill -9 -f node` then restart MCP Inspector
6. **Network issues**: Check internet connection and proxy settings if applicable

### Environment Variable Loading
**CRITICAL**: Always load dotenv at the start of modules that use environment variables:
```javascript
import dotenv from 'dotenv';
dotenv.config();
// THEN import other modules and initialize clients
```

The Anthropic client must be initialized AFTER dotenv loads, otherwise you'll get API key errors.

### Known Issues & Solutions

1. **MCP Inspector not picking up changes**: 
   - Kill all node processes: `pkill -9 -f node`
   - Restart inspector: `npm run inspect`
   - Check tool description for version marker

2. **Converter API rate limiting**:
   - API allows 20 conversions per 5 minutes
   - Error message will indicate retry time
   - Consider implementing caching for repeated conversions

3. **API key not found errors**:
   - Ensure dotenv.config() is called before creating Anthropic client
   - Check .env file exists and has ANTHROPIC_API_KEY set

4. **Image-heavy DOCX files**:
   - Now automatically converted to PDF via external API
   - Claude can directly analyze embedded images in the PDF
   - No local LibreOffice installation needed
   - OCR still required for text extraction from scanned images

5. **Converter API downtime**:
   - Check service health with `converter.healthCheck()`
   - Fallback: Manual PDF conversion and upload to ticket
   - API URL can be configured via CONVERTER_API_URL env var