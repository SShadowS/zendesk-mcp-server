# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides comprehensive access to the Zendesk API. It implements tools for managing tickets, users, organizations, and other Zendesk resources through a standardized MCP interface.

**Key Features:**
- OAuth 2.1 authentication with PKCE for secure access
- HTTP-based server using Streamable HTTP transport
- Per-session Zendesk clients with automatic token management
- Comprehensive retry logic with exponential backoff
- AI-powered document and image analysis

## Commands

### Development
- `npm start` - Start the HTTP server with OAuth support
- `npm run dev` - Start the server with auto-restart on file changes
- `npm run inspect` - Launch the MCP Inspector to test server functionality
- `node test-oauth-flow.js` - Test OAuth authorization flow

### Installation
- `npm install` - Install dependencies

### Testing
- Visit `http://localhost:3030/oauth/authorize` to start OAuth flow
- Visit `http://localhost:3030/health` to check server health
- Visit `http://localhost:3030/.well-known/oauth-protected-resource` for RFC9728 metadata

Note: This project has no build step, test suite, or linting configured. The code runs directly as ES modules.

## Architecture

### Core Components

1. **Entry Point** (`src/index.js`):
   - Loads environment variables with dotenv
   - Starts HTTP server with OAuth support
   - No longer uses stdio transport (migrated to HTTP)

2. **HTTP Server** (`src/http-server.js`):
   - Express server with Streamable HTTP transport
   - Handles OAuth 2.1 authorization flow
   - Manages per-session MCP connections
   - Provides health check and metadata endpoints
   - Enforces Bearer token authentication on `/mcp` endpoint

3. **OAuth Handler** (`src/auth/oauth-handler.js`):
   - Implements OAuth 2.1 with PKCE (S256 challenge method)
   - Generates authorization URLs with state and code challenge
   - Exchanges authorization codes for access tokens
   - Handles token refresh with exponential backoff
   - Validates OAuth configuration on startup

4. **Session Store** (`src/auth/session-store.js`):
   - Manages OAuth sessions with MCP access tokens
   - Maps MCP tokens (24h TTL) to Zendesk tokens (2h TTL)
   - Automatic token refresh when Zendesk token expires
   - In-memory storage (⚠️ use Redis for production)
   - Automatic cleanup of expired sessions

5. **MCP Server Configuration** (`src/server.js`):
   - Creates and configures the McpServer instance
   - Registers all tool modules
   - Provides documentation resources via `zendesk://docs/{section}` URIs
   - Connection test removed (requires OAuth tokens per-session)

6. **Zendesk Client** (`src/zendesk-client.js`):
   - **OAuth-only authentication** (API tokens no longer supported)
   - Per-session client instances (not singleton)
   - Methods: `setAccessToken()`, `clearAccessToken()`, `isTokenExpired()`
   - Provides methods for all Zendesk resources
   - Includes retry logic with exponential backoff
   - 60-second timeout for API requests

7. **Request Context** (`src/request-context.js`):
   - Uses AsyncLocalStorage for per-session context
   - Tools call `getZendeskClient()` to access session's client
   - Eliminates need to pass session IDs through MCP protocol
   - Automatic cleanup on session close

8. **Tool Modules** (`src/tools/*.js`):
   - Each file exports an array of tool definitions
   - Tools call `getZendeskClient()` to access per-session client
   - Follow consistent pattern with name, schema, handler, and description
   - Organized by Zendesk product area (support, talk, chat, help-center)

9. **Tool Mode Configuration** (`src/config/tool-modes.js`):
   - Controls which tools are exposed based on `MODE` environment variable
   - `full` mode (default): All 55 tools available
   - `lite` mode: Only 10 essential tools for reduced context usage
   - Functions: `getToolMode()`, `filterToolsByMode()`, `logToolModeInfo()`

### Tool Modes

The server supports two tool modes controlled by the `MODE` environment variable:

**Full Mode (default):**
```bash
npm start
# or
MODE=full npm start
```
All 55 tools are registered and available.

**Lite Mode:**
```bash
MODE=lite npm start
```
Only 10 essential tools are registered to reduce context usage:
- `search` - Search across Zendesk data
- `get_user` - Get user details
- `list_tickets` - List tickets
- `get_ticket` - Get ticket with comments
- `get_ticket_comments` - Get ticket comments
- `add_ticket_comment` - Add comment to ticket
- `get_ticket_attachments` - Get ticket attachments
- `analyze_ticket_images` - AI image analysis
- `analyze_ticket_documents` - AI document analysis
- `get_document_summary` - Document summary

To modify the lite mode tool list, edit `LITE_MODE_TOOLS` in `src/config/tool-modes.js`.

### OAuth 2.1 Authentication Flow

The server uses OAuth 2.1 with PKCE for secure authentication:

**Environment Variables Required:**
```bash
ZENDESK_SUBDOMAIN=your-subdomain                          # Zendesk subdomain
ZENDESK_OAUTH_CLIENT_ID=your_client_id                    # From OAuth app
ZENDESK_OAUTH_CLIENT_SECRET=your_client_secret            # From OAuth app
ZENDESK_OAUTH_REDIRECT_URI=http://localhost:3030/zendesk/oauth/callback
```

**Flow Steps:**

1. **Authorization Request** (`GET /oauth/authorize`):
   - Server generates PKCE challenge (S256 method)
   - Creates session with state and code verifier
   - Redirects to Zendesk authorization page

2. **User Authorization**:
   - User approves app in Zendesk UI
   - Zendesk redirects back with authorization code and state

3. **Token Exchange** (`GET /zendesk/oauth/callback`):
   - Validates state parameter (CSRF protection)
   - Exchanges code for access token using PKCE verifier
   - Creates MCP access token (24h TTL)
   - Returns MCP token to client

4. **API Requests** (`ALL /mcp`):
   - Client sends MCP token in Authorization header
   - Middleware validates token and loads session
   - Auto-refreshes Zendesk token if expiring (60s buffer)
   - Creates/updates per-session Zendesk client
   - Executes MCP tools with session context

**Token Management:**
- **MCP Token**: 24-hour lifetime, used by clients to authenticate with MCP server
- **Zendesk Token**: 2-hour lifetime, automatically refreshed by server
- **Refresh Logic**: Exponential backoff (2 attempts), skips 4xx errors
- **Session Cleanup**: Hourly cleanup of expired sessions

**Security Features:**
- PKCE (Proof Key for Code Exchange) prevents authorization code interception
- State parameter prevents CSRF attacks
- Token-scoped sessions isolate client requests
- WWW-Authenticate headers follow RFC 6750
- Security headers on OAuth callback (Cache-Control, CSP, Referrer-Policy)

### Per-Session Architecture

To prevent race conditions and ensure proper token isolation:

1. **Session Creation**:
   - Each OAuth authorization creates a unique session
   - Session stores Zendesk OAuth tokens and MCP access token
   - Session mapped by MCP token for quick lookup

2. **Client Instance Management**:
   - Each session gets its own `ZendeskClient` instance
   - Client created on first MCP request for session
   - Tokens updated automatically when refreshed
   - Client cleaned up when session closes

3. **Request Context Flow**:
   ```
   HTTP Request → authenticateBearer middleware
   → Get/create ZendeskClient for session
   → Store in request context (AsyncLocalStorage)
   → runInContext() wraps MCP handler
   → Tools call getZendeskClient() to access client
   ```

4. **Lifecycle**:
   - Transport created per session
   - Client instance created per session
   - Both cleaned up when transport closes
   - Sessions auto-cleaned after 24h or on expiry

### Tool Pattern

All tools follow this updated structure with per-session client access:

```javascript
import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

export const toolsArray = [
  {
    name: "tool_name",
    description: "Tool description",
    schema: z.object({
      // Zod schema for parameters
    }),
    handler: async (args) => {
      try {
        // Get session-specific Zendesk client from context
        const zendeskClient = getZendeskClient();

        // Use client for API calls
        const result = await zendeskClient.someMethod(args);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  }
];
```

**Key Changes from Previous Version:**
- Tools import `getZendeskClient` instead of singleton `zendeskClient`
- Each handler calls `getZendeskClient()` to get session-specific client
- AsyncLocalStorage automatically provides correct client for current request
- No need to pass session IDs or modify handler signatures

### Error Handling

The server includes comprehensive error handling:

1. **Classified Errors** (`src/utils/errors.js`):
   - `ZendeskAuthError` - OAuth/authentication failures (401)
   - `ZendeskRateLimitError` - Rate limit exceeded (429)
   - `ZendeskValidationError` - Invalid request data (400)
   - `ZendeskNotFoundError` - Resource not found (404)
   - `ZendeskAPIError` - Generic API errors

2. **Retry Logic** (`src/utils/retry.js`):
   - Automatic retry with exponential backoff
   - Retry profiles: default, conservative, aggressive, none
   - Retries network errors and 5xx responses
   - Skips 4xx errors (client errors, no retry)
   - Maximum 3 attempts with configurable delays

3. **OAuth Error Responses**:
   - WWW-Authenticate headers with error details
   - RFC 6750 compliant error responses
   - Helpful error messages with next steps
   - Automatic token refresh on expiry

4. **Session Management**:
   - Automatic cleanup of expired sessions
   - Token refresh failures handled gracefully
   - Invalid tokens return 401 with authorization URL

## MCP Integration

This server is designed to be used with MCP clients over HTTP. It provides:

**Transport:**
- Streamable HTTP transport (SDK 1.20.0+)
- Supports GET (SSE stream), POST (requests), DELETE (cleanup)
- Session-based architecture with per-session state
- Compatible with HTTP-based MCP clients

**Authentication:**
- Bearer token authentication required
- OAuth 2.1 flow for secure token acquisition
- Automatic token management and refresh
- RFC 9728 protected resource metadata

**Features:**
- Tools for CRUD operations on all major Zendesk resources
- Documentation resources accessible via special URIs
- AI-powered image and document analysis
- Proper error handling and response formatting for MCP
- Retry logic with exponential backoff
- Rate limit handling

**Endpoints:**
- `GET /oauth/authorize` - Start OAuth flow
- `GET /zendesk/oauth/callback` - OAuth callback
- `ALL /mcp` - Main MCP endpoint (requires Bearer token)
- `GET /health` - Health check
- `GET /.well-known/oauth-protected-resource` - RFC9728 metadata

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

6. **OAuth token expired (401 errors)**:
   - MCP tokens expire after 24 hours
   - Re-authorize at `http://localhost:3030/oauth/authorize`
   - Check token format starts with `mcp_`
   - Ensure Bearer token included in Authorization header

7. **Session lost after server restart**:
   - In-memory sessions are cleared on restart
   - Re-authorize to get new token
   - For production: Implement Redis-based session store (see `src/auth/session-store.js`)

## Production Deployment

### Requirements

**Infrastructure:**
- Node.js >= 18.0.0
- HTTPS with valid SSL certificate (required for OAuth)
- Persistent session store (Redis recommended)
- Load balancer with sticky sessions (if scaling horizontally)
- Environment variable management (AWS Secrets Manager, etc.)

**Zendesk Configuration:**
- OAuth app with production redirect URL (https://)
- Separate OAuth apps for dev/staging/production
- API rate limits appropriate for workload
- Scopes: `read` and `write` permissions

**Security:**
- Store OAuth Client Secret securely (never in code/git)
- Use HTTPS for all endpoints
- Implement rate limiting on OAuth endpoints
- Monitor for suspicious OAuth flows
- Regular token rotation policy

### Implementing Redis Session Store

Replace in-memory session store with Redis for production:

1. **Install Redis client**:
```bash
npm install redis
```

2. **Create `src/auth/redis-session-store.js`**:
```javascript
import { createClient } from 'redis';

export class RedisSessionStore {
  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    this.client.connect();
  }

  async createOAuthSession(state, codeVerifier) {
    const session = {
      id: randomUUID(),
      state,
      codeVerifier,
      createdAt: Date.now()
    };
    await this.client.set(`oauth:${state}`, JSON.stringify(session), {
      EX: 600 // 10 minutes
    });
    return session;
  }

  async getSession(mcpAccessToken) {
    const data = await this.client.get(`mcp:${mcpAccessToken}`);
    return data ? JSON.parse(data) : null;
  }

  async completeOAuthFlow(session, tokens) {
    const mcpAccessToken = `mcp_${randomUUID().replace(/-/g, '')}`;
    const mcpExpiresIn = 24 * 60 * 60;

    session.zendeskAccessToken = tokens.access_token;
    session.zendeskRefreshToken = tokens.refresh_token;
    session.zendeskTokenExpiry = Date.now() + (tokens.expires_in * 1000);
    session.mcpAccessToken = mcpAccessToken;
    session.mcpTokenExpiry = Date.now() + (mcpExpiresIn * 1000);
    session.scopes = (tokens.scope || '').split(' ').filter(Boolean);

    await this.client.set(`mcp:${mcpAccessToken}`, JSON.stringify(session), {
      EX: mcpExpiresIn
    });
    await this.client.del(`oauth:${session.state}`);

    return { mcpAccessToken, mcpExpiresIn };
  }
}
```

3. **Update `src/http-server.js`**:
```javascript
import { RedisSessionStore } from './auth/redis-session-store.js';
const sessionStore = new RedisSessionStore();
```

### Environment Variables for Production

```bash
# Zendesk OAuth (Production)
ZENDESK_SUBDOMAIN=your-company
ZENDESK_OAUTH_CLIENT_ID=production_client_id
ZENDESK_OAUTH_CLIENT_SECRET=production_client_secret  # From secrets manager
ZENDESK_OAUTH_REDIRECT_URI=https://your-domain.com/zendesk/oauth/callback

# Server Configuration
PORT=3030
SERVER_BASE_URL=https://your-domain.com
NODE_ENV=production

# Session Store
REDIS_URL=redis://redis-host:6379
REDIS_PASSWORD=redis_password  # If using authentication

# AI Features
ANTHROPIC_API_KEY=sk-ant-...  # From secrets manager

# Monitoring
ZENDESK_DEBUG=false
```

### Deployment Checklist

- [ ] OAuth app created in Zendesk with production redirect URL
- [ ] HTTPS certificate installed and configured
- [ ] Environment variables stored in secrets manager
- [ ] Redis instance provisioned and accessible
- [ ] Session store updated to use Redis
- [ ] Rate limiting configured on OAuth endpoints
- [ ] Monitoring and logging set up
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Health check endpoint monitored
- [ ] Backup OAuth app for disaster recovery
- [ ] Documentation updated with production URLs
- [ ] Security audit completed

### Scaling Considerations

**Horizontal Scaling:**
- Use Redis for shared session state
- Configure load balancer with sticky sessions
- Ensure OAuth callback can reach any instance
- Share session store across all instances

**Vertical Scaling:**
- Monitor memory usage (session storage)
- Adjust Node.js heap size if needed
- Consider session TTL vs memory tradeoffs

**High Availability:**
- Redis cluster or replication
- Multiple OAuth app registrations
- Health check monitoring
- Graceful shutdown handling

### Monitoring

**Key Metrics:**
- OAuth authorization success/failure rate
- Token refresh success/failure rate
- Session count and memory usage
- API request latency
- Zendesk API rate limit usage
- Error rates by type

**Alerts:**
- OAuth failures exceeding threshold
- Token refresh failures
- Redis connection failures
- API rate limit approaching
- High error rates
- Session store memory issues