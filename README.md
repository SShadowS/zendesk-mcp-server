<div align="center">

# Zendesk MCP Server

[![npm version](https://img.shields.io/npm/v/@sshadows/zendesk-mcp-server)](https://www.npmjs.com/package/@sshadows/zendesk-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@sshadows/zendesk-mcp-server)](https://nodejs.org)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.com)

**A Model Context Protocol server for Zendesk API integration with AI-powered ticket analysis**

[Quick Start](#quick-start) &bull; [Configuration](#configuration) &bull; [Tools](#available-tools) &bull; [Architecture](#architecture) &bull; [Development](#development)

</div>

---

## Overview

Zendesk MCP Server provides comprehensive access to the Zendesk API through the Model Context Protocol. It supports **two transport modes** that are auto-detected from environment variables:

- **Stdio mode** &mdash; API token auth, for CLI-based MCP clients (Claude Code, Cursor, etc.)
- **HTTP mode** &mdash; OAuth 2.1 with PKCE, for web-based MCP clients

Both modes expose the same set of tools. No code changes are needed to switch between them.

> Based on [mattcoatsworth/zendesk-mcp-server](https://github.com/mattcoatsworth/zendesk-mcp-server) with significant enhancements including AI-powered features, dual-mode authentication, improved error handling, and comprehensive retry logic.

## Quick Start

### Stdio Mode (API Token)

Best for CLI-based MCP clients like Claude Code or Cursor. Each user only needs their own email + API token.

**1. Get your API token** from Zendesk Admin Center &rarr; Apps and integrations &rarr; APIs &rarr; Zendesk API &rarr; Add API token.

**2. Configure your MCP client:**

```json
{
  "zendesk": {
    "type": "stdio",
    "command": "npx",
    "args": ["@sshadows/zendesk-mcp-server"],
    "env": {
      "ZENDESK_SUBDOMAIN": "your-subdomain",
      "ZENDESK_EMAIL": "you@example.com",
      "ZENDESK_API_TOKEN": "your-api-token"
    }
  }
}
```

That's it. The server auto-detects stdio mode and connects.

### HTTP Mode (OAuth 2.1)

Best for web-based MCP clients or multi-user deployments with centralized OAuth.

**1. Create an OAuth app** in Zendesk Admin Center &rarr; Apps and integrations &rarr; APIs &rarr; OAuth Clients.

**2. Create a `.env` file:**

```bash
ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_OAUTH_CLIENT_ID=your_client_id
ZENDESK_OAUTH_CLIENT_SECRET=your_client_secret
ZENDESK_OAUTH_REDIRECT_URI=http://localhost:3030/zendesk/oauth/callback
```

**3. Start and authorize:**

```bash
npm start
# Visit http://localhost:3030/oauth/authorize in your browser
```

**4. Use the token** with your MCP client: `Authorization: Bearer mcp_...`

## Installation

| Requirement | Version | Notes |
|------------|---------|-------|
| Node.js | >= 18.0.0 | Required |
| Zendesk Account | Any plan | Required |
| Anthropic API Key | - | Only for AI analysis features |

```bash
# npm (recommended)
npm install -g @sshadows/zendesk-mcp-server

# Or from source
git clone https://github.com/SShadowS/zendesk-mcp-server.git
cd zendesk-mcp-server
npm install
```

## Configuration

### Environment Variables

The server auto-detects which mode to use based on which variables are set.

**Stdio mode** (set `ZENDESK_EMAIL` + `ZENDESK_API_TOKEN`, without `ZENDESK_OAUTH_CLIENT_ID`):

```bash
ZENDESK_SUBDOMAIN=mycompany
ZENDESK_EMAIL=user@example.com
ZENDESK_API_TOKEN=your-api-token
```

**HTTP mode** (set `ZENDESK_OAUTH_CLIENT_ID`):

```bash
ZENDESK_SUBDOMAIN=mycompany
ZENDESK_OAUTH_CLIENT_ID=your_client_id
ZENDESK_OAUTH_CLIENT_SECRET=your_client_secret
ZENDESK_OAUTH_REDIRECT_URI=http://localhost:3030/zendesk/oauth/callback
```

**Common (both modes):**

```bash
MODE=full                    # 'full' (all 55 tools) or 'lite' (10 essential tools)
ANTHROPIC_API_KEY=sk-ant-... # Required for AI image/document analysis
ZENDESK_DEBUG=false          # Enable debug logging
```

**HTTP mode only:**

```bash
PORT=3030
SERVER_BASE_URL=http://localhost:3030  # Use https:// in production
```

See [`.env.example`](.env.example) for the full list.

### Tool Modes

Control which tools are exposed with the `MODE` environment variable:

- **`full`** (default) &mdash; All 55 tools available.
- **`lite`** &mdash; 10 essential tools for reduced context usage: `search`, `get_user`, `list_tickets`, `get_ticket`, `get_ticket_comments`, `add_ticket_comment`, `get_ticket_attachments`, `analyze_ticket_images`, `analyze_ticket_documents`, `get_document_summary`.

```bash
MODE=lite npm start
```

## Available Tools

<details>
<summary><b>Ticket Management</b></summary>

| Tool | Description |
|------|-------------|
| `list_tickets` | List tickets with filters (status, assignee, etc.) |
| `get_ticket` | Get ticket details with optional comments |
| `create_ticket` | Create a new ticket |
| `update_ticket` | Update ticket fields |
| `get_ticket_comments` | Get all comments on a ticket |
| `add_ticket_comment` | Add public or internal comment |
| `get_ticket_attachments` | Get ticket attachments |
| `analyze_ticket_images` | AI-powered image analysis with Claude Vision |
| `analyze_ticket_documents` | AI-powered document analysis |
| `get_document_summary` | Quick document summary |

</details>

<details>
<summary><b>User Management</b></summary>

| Tool | Description |
|------|-------------|
| `list_users` | List all users |
| `get_user` | Get user details |
| `create_user` | Create new user |
| `update_user` | Update user info |
| `delete_user` | Delete a user |

</details>

<details>
<summary><b>Organizations</b></summary>

| Tool | Description |
|------|-------------|
| `list_organizations` | List all organizations |
| `get_organization` | Get organization details |
| `create_organization` | Create new organization |
| `update_organization` | Update organization |
| `delete_organization` | Delete organization |

</details>

<details>
<summary><b>Automation & Workflows</b></summary>

| Category | Tools |
|----------|-------|
| **Groups** | `list_groups`, `get_group`, `create_group`, `update_group`, `delete_group` |
| **Macros** | `list_macros`, `get_macro`, `create_macro`, `update_macro`, `delete_macro` |
| **Views** | `list_views`, `get_view`, `create_view`, `update_view`, `delete_view` |
| **Triggers** | `list_triggers`, `get_trigger`, `create_trigger`, `update_trigger`, `delete_trigger` |
| **Automations** | `list_automations`, `get_automation`, `create_automation`, `update_automation`, `delete_automation` |

</details>

<details>
<summary><b>Help Center, Search, Talk & Chat</b></summary>

| Category | Tools |
|----------|-------|
| **Search** | `search` &mdash; Search across all Zendesk data |
| **Help Center** | `list_articles`, `get_article`, `create_article`, `update_article`, `delete_article` |
| **Talk** | `get_talk_stats` &mdash; Phone support statistics |
| **Chat** | `list_chats` &mdash; Chat conversations |

</details>

## Architecture

### Transport Modes

```
src/index.js (auto-detection)
├── ZENDESK_EMAIL + ZENDESK_API_TOKEN  →  Stdio mode
│   ├── ZendeskClient.setApiTokenAuth()
│   ├── setDefaultZendeskClient(client)
│   └── StdioServerTransport (stdin/stdout)
│
└── ZENDESK_OAUTH_CLIENT_ID  →  HTTP mode
    ├── Express server (src/http-server.js)
    ├── OAuth 2.1 with PKCE (src/auth/)
    ├── Per-session ZendeskClient instances
    └── StreamableHTTPServerTransport
```

Tools are identical in both modes. They call `getZendeskClient()` which resolves to:
- **HTTP mode**: Per-session client via AsyncLocalStorage
- **Stdio mode**: Singleton default client

### Project Structure

```
zendesk-mcp-server/
├── src/
│   ├── index.js                 # Entry point (auto-detects mode)
│   ├── http-server.js           # Express server with OAuth (HTTP mode only)
│   ├── server.js                # MCP server setup and tool registration
│   ├── request-context.js       # Per-session + default client context
│   ├── auth/
│   │   ├── oauth-handler.js     # OAuth 2.1 with PKCE
│   │   ├── session-store.js     # Session management
│   │   └── middleware.js        # Bearer token auth middleware
│   ├── zendesk-client/
│   │   ├── base.js              # Auth, HTTP requests, retry logic
│   │   ├── index.js             # Mixin composition
│   │   ├── tickets.js           # Ticket API methods
│   │   ├── users.js             # User API methods
│   │   └── ...                  # Other API domain mixins
│   ├── tools/                   # MCP tool implementations
│   ├── config/
│   │   └── tool-modes.js        # Full/lite mode filtering
│   └── utils/
│       ├── errors.js            # Classified error types
│       ├── retry.js             # Exponential backoff
│       ├── ticket-context.js    # AI prompt context builder
│       ├── document-handler.js  # Document routing
│       └── converter-client.js  # Office-to-PDF conversion
├── tests/                       # Vitest test suite
├── .env.example                 # Environment variable template
└── CLAUDE.md                    # AI assistant project guide
```

### Key Design Decisions

- **Dual auth in one client**: `ZendeskClientBase` supports both `setApiTokenAuth()` (Basic) and `setAccessToken()` (Bearer). The `_authMode` field determines which header `getAuthHeader()` returns.
- **Default client fallback**: AsyncLocalStorage doesn't propagate through StdioServerTransport's event callbacks. Instead of fighting that, `getZendeskClient()` falls back to a module-level default client in stdio mode. Zero changes needed in any tool file.
- **Console.error everywhere**: In stdio mode, stdout is the MCP transport. All diagnostic logging in shared code paths uses `console.error`.
- **HTTP mode is unchanged**: `src/http-server.js` and `src/auth/*` are only imported in HTTP mode. No changes were needed.

## Development

```bash
npm start          # Start server (auto-detects mode)
npm run dev        # Start with auto-reload
npm test           # Run all tests
npm run test:watch # Run tests in watch mode
npm run inspect    # Launch MCP Inspector
```

### Testing

Tests use [Vitest](https://vitest.dev/) and are in `tests/` mirroring the `src/` directory:

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
```

Integration tests (against real Zendesk + Anthropic APIs) require `.env` credentials and are automatically skipped when credentials are missing.

### HTTP Mode Endpoints

| Endpoint | Description |
|----------|-------------|
| `ALL /mcp` | Main MCP endpoint (requires Bearer token) |
| `GET /oauth/authorize` | Start OAuth flow |
| `GET /zendesk/oauth/callback` | OAuth callback |
| `POST /oauth/token` | Token exchange |
| `POST /oauth/register` | Dynamic client registration (RFC 7591) |
| `GET /.well-known/oauth-authorization-server` | OAuth metadata (RFC 8414) |
| `GET /.well-known/oauth-protected-resource` | Protected resource metadata (RFC 9728) |
| `GET /health` | Health check |

## Troubleshooting

<details>
<summary><b>Missing configuration error on startup</b></summary>

The server needs either API token or OAuth credentials. Set one of:

```bash
# Stdio mode
ZENDESK_SUBDOMAIN=... ZENDESK_EMAIL=... ZENDESK_API_TOKEN=...

# HTTP mode
ZENDESK_SUBDOMAIN=... ZENDESK_OAUTH_CLIENT_ID=... ZENDESK_OAUTH_CLIENT_SECRET=...
```

</details>

<details>
<summary><b>401 Unauthorized (OAuth / HTTP mode)</b></summary>

- Complete OAuth flow: visit `http://localhost:3030/oauth/authorize`
- Check if token expired (24-hour TTL) &mdash; re-authorize if needed
- Ensure Bearer token is included: `Authorization: Bearer mcp_xxx`
- Token format should start with `mcp_`

</details>

<details>
<summary><b>401 Unauthorized (API token / stdio mode)</b></summary>

- Verify `ZENDESK_EMAIL` is correct
- Verify `ZENDESK_API_TOKEN` is a valid API token (not a password)
- Verify `ZENDESK_SUBDOMAIN` is correct
- Check the connection test output in stderr on startup

</details>

<details>
<summary><b>Session lost after server restart (HTTP mode)</b></summary>

In-memory sessions are cleared on restart. Re-authorize to get a new token. For production, implement a Redis-based session store (see `src/auth/session-store.js`).

</details>

<details>
<summary><b>AI analysis features not working</b></summary>

Set `ANTHROPIC_API_KEY` in your environment. This is only needed for `analyze_ticket_images`, `analyze_ticket_documents`, and `get_document_summary`.

</details>

<details>
<summary><b>Rate limiting (429 errors)</b></summary>

The server includes exponential backoff retry logic. If you hit rate limits frequently, consider using `MODE=lite` to reduce API calls, or check if multiple clients share the same credentials.

</details>

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Run tests (`npm test`)
4. Commit your changes
5. Open a Pull Request

## License

MIT License &mdash; see [LICENSE](LICENSE) for details.

## Acknowledgments

- Original implementation by [@mattcoatsworth](https://github.com/mattcoatsworth)
- Built with [Model Context Protocol](https://modelcontextprotocol.com)
- AI features powered by [Anthropic Claude](https://anthropic.com)

---

<div align="center">

Made with care by [SShadowS](https://github.com/SShadowS)

</div>
