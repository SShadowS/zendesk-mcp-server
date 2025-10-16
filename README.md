<div align="center">

# 🎫 Zendesk MCP Server

[![npm version](https://img.shields.io/npm/v/@sshadows/zendesk-mcp-server)](https://www.npmjs.com/package/@sshadows/zendesk-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@sshadows/zendesk-mcp-server)](https://nodejs.org)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.com)

**A powerful Model Context Protocol server for seamless Zendesk API integration**

[Features](#-features) • [Quick Start](#-quick-start) • [Installation](#-installation) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## 🌟 Overview

Zendesk MCP Server provides a comprehensive interface to the Zendesk API through the Model Context Protocol, enabling AI assistants to interact with your support system. With built-in AI-powered ticket analysis, OAuth 2.1 security, and full API coverage, it's the perfect tool for automating and enhancing your customer support workflows.

> 💡 **Based on** [mattcoatsworth/zendesk-mcp-server](https://github.com/mattcoatsworth/zendesk-mcp-server) with significant enhancements including AI-powered features, OAuth 2.1 authentication, improved error handling, and comprehensive security improvements.

> 🔒 **Security First**: Now uses OAuth 2.1 with PKCE for secure authentication. API tokens are no longer supported for enhanced security.

## ✨ Features

<table>
<tr>
<td>

### 🎯 Core Features
- 🔄 **Full Zendesk API Coverage**
- 🎫 Complete ticket management
- 👥 User and organization control
- 🤖 Automation and macro support
- 📊 Views and reporting

</td>
<td>

### 🚀 Enhanced Capabilities
- 🧠 **AI-Powered Analysis**
- 🖼️ Image analysis with Claude Vision
- 💬 Smart comment generation
- 🔍 Advanced search functionality
- 📎 Attachment handling
- 🔒 **OAuth 2.1 Security** with PKCE

</td>
</tr>
</table>

## 🚀 Quick Start

### 1️⃣ Create OAuth App in Zendesk
1. Log in to **Zendesk Admin Center**
2. Navigate to **Apps and integrations** → **APIs** → **Zendesk API** → **OAuth Clients**
3. Click **Add OAuth client**
4. Configure:
   - **Client Name**: `AI Support MCP`
   - **Redirect URLs**: `http://localhost:3030/zendesk/oauth/callback`
   - **Scopes**: Select `read` and `write`
5. Save and copy the **Client ID** and **Client Secret**

### 2️⃣ Install & Configure
```bash
# Install the server
npm install -g @sshadows/zendesk-mcp-server

# Or run from source
git clone https://github.com/SShadowS/zendesk-mcp-server.git
cd zendesk-mcp-server
npm install
```

Create `.env` file:
```bash
ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_OAUTH_CLIENT_ID=your_oauth_client_id
ZENDESK_OAUTH_CLIENT_SECRET=your_oauth_client_secret
ZENDESK_OAUTH_REDIRECT_URI=http://localhost:3030/zendesk/oauth/callback
ANTHROPIC_API_KEY=your-anthropic-api-key  # For AI features
```

### 3️⃣ Start Server & Authorize
```bash
# Start the HTTP server
npm start

# In your browser, visit:
# http://localhost:3030/oauth/authorize

# Complete OAuth authorization
# Copy the access token from the response
```

### 4️⃣ Use with MCP Client
Configure your MCP client to use the server with Bearer token:
```http
Authorization: Bearer mcp_your_access_token_here
```

Your AI assistant can now interact with Zendesk! Try:
- "List all open tickets"
- "Analyze images in ticket #123"
- "Create a new user"

## 📦 Installation

### Prerequisites

| Requirement | Version | Required |
|------------|---------|----------|
| Node.js | ≥ 18.0.0 | ✅ |
| Zendesk Account | Any | ✅ |
| Zendesk OAuth App | - | ✅ |
| Anthropic API Key | - | ✅ (for AI features) |

### Installation Methods

<details>
<summary><b>📦 npm (Recommended)</b></summary>

```bash
# Global installation
npm install -g @sshadows/zendesk-mcp-server

# Local installation
npm install @sshadows/zendesk-mcp-server
```
</details>

<details>
<summary><b>🔧 From Source</b></summary>

```bash
git clone https://github.com/SShadowS/zendesk-mcp-server.git
cd zendesk-mcp-server
npm install
npm start
```
</details>

<details>
<summary><b>🐳 Docker (Coming Soon)</b></summary>

```bash
# Docker support planned for future release
docker run -e ZENDESK_SUBDOMAIN=... sshadows/zendesk-mcp-server
```
</details>

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in your project root:

```bash
# Zendesk OAuth Configuration
ZENDESK_SUBDOMAIN=mycompany                           # Your Zendesk subdomain
ZENDESK_OAUTH_CLIENT_ID=your_oauth_client_id          # From OAuth app
ZENDESK_OAUTH_CLIENT_SECRET=your_oauth_client_secret  # From OAuth app
ZENDESK_OAUTH_REDIRECT_URI=http://localhost:3030/zendesk/oauth/callback

# Optional: Server Configuration
PORT=3030                                             # HTTP server port (default: 3030)
SERVER_BASE_URL=http://localhost:3030                 # Base URL for OAuth (production: https://your-domain.com)

# AI Features
ANTHROPIC_API_KEY=sk-ant-...                          # For vision & analysis features

# Optional: Debugging
ZENDESK_DEBUG=false                                   # Enable debug logging
```

### 🔑 Setting Up Authentication

<details>
<summary><b>Create Zendesk OAuth App</b></summary>

1. Log in to **Zendesk Admin Center**
2. Navigate to **Apps and integrations** → **APIs** → **Zendesk API**
3. Click on **OAuth Clients** tab
4. Click **Add OAuth client**
5. Fill in the details:
   - **Client Name**: AI Support MCP (or your preferred name)
   - **Description**: MCP Server for AI-powered support automation
   - **Company**: Your company name
   - **Logo**: Optional
   - **Unique Identifier**: Leave auto-generated or customize
   - **Redirect URLs**: `http://localhost:3030/zendesk/oauth/callback`
     - For production: `https://your-domain.com/zendesk/oauth/callback`
   - **Scopes**: Select `read` and `write` (required for full functionality)
6. Click **Save**
7. Copy the **Client ID** and **Client Secret** immediately (secret is only shown once!)
8. Add these to your `.env` file

**Production Notes:**
- Use HTTPS for production redirect URLs
- Store Client Secret securely (environment variables, secrets manager)
- Consider using different OAuth apps for development and production

</details>

<details>
<summary><b>Get Anthropic API Key</b></summary>

1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Navigate to **API Keys**
3. Click **Create Key**
4. Give it a descriptive name (e.g., "Zendesk MCP Server")
5. Copy and save securely in your `.env` file

**Note**: Anthropic API key is only required if you use AI-powered features like image analysis.

</details>

<details>
<summary><b>Complete OAuth Authorization</b></summary>

After configuring your `.env` file:

1. Start the server: `npm start`
2. Visit `http://localhost:3030/oauth/authorize` in your browser
3. You'll be redirected to Zendesk to authorize the app
4. Click **Allow** to grant permissions
5. You'll be redirected back with an access token in JSON format
6. Copy the `access_token` value
7. Token is valid for 24 hours (automatically refreshed by the server)

**Token Format:**
```json
{
  "success": true,
  "access_token": "mcp_abc123...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "read write"
}
```

**Using the Token:**
- Include in all requests: `Authorization: Bearer mcp_abc123...`
- Tokens expire after 24 hours
- Server automatically refreshes Zendesk tokens (2-hour TTL)
- Re-authorize if you see 401 errors

</details>

## 📖 Documentation

### 🛠️ Available Tools

<details>
<summary><b>🎫 Ticket Management</b></summary>

| Tool | Description | Example |
|------|-------------|---------|
| `list_tickets` | List all tickets with filters | `list_tickets(status: "open")` |
| `get_ticket` | Get ticket details | `get_ticket(id: 123, include_comments: true)` |
| `create_ticket` | Create new ticket | `create_ticket(subject: "Help needed")` |
| `update_ticket` | Update ticket | `update_ticket(id: 123, status: "solved")` |
| `analyze_ticket_images` | AI analysis of attachments | `analyze_ticket_images(id: 123)` |

</details>

<details>
<summary><b>👥 User Management</b></summary>

| Tool | Description |
|------|-------------|
| `list_users` | List all users |
| `get_user` | Get user details |
| `create_user` | Create new user |
| `update_user` | Update user info |
| `delete_user` | Delete a user |

</details>

<details>
<summary><b>🏢 Organizations</b></summary>

| Tool | Description |
|------|-------------|
| `list_organizations` | List all organizations |
| `get_organization` | Get organization details |
| `create_organization` | Create new organization |
| `update_organization` | Update organization |
| `delete_organization` | Delete organization |

</details>

<details>
<summary><b>🤖 Automation & Workflows</b></summary>

| Category | Tools |
|----------|-------|
| **Groups** | `list_groups`, `get_group`, `create_group`, `update_group`, `delete_group` |
| **Macros** | `list_macros`, `get_macro`, `create_macro`, `update_macro`, `delete_macro` |
| **Views** | `list_views`, `get_view`, `create_view`, `update_view`, `delete_view` |
| **Triggers** | `list_triggers`, `get_trigger`, `create_trigger`, `update_trigger`, `delete_trigger` |
| **Automations** | `list_automations`, `get_automation`, `create_automation`, `update_automation`, `delete_automation` |

</details>

<details>
<summary><b>📚 Help Center & Communication</b></summary>

| Category | Tools |
|----------|-------|
| **Search** | `search` - Search across all Zendesk data |
| **Help Center** | `list_articles`, `get_article`, `create_article`, `update_article`, `delete_article` |
| **Talk** | `get_talk_stats` - Get phone support statistics |
| **Chat** | `list_chats` - List chat conversations |

</details>

### 💡 Usage Examples

<details>
<summary><b>Basic Ticket Operations</b></summary>

```javascript
// List open tickets
await list_tickets({ status: "open", sort_by: "created_at" });

// Get ticket with comments
await get_ticket({ id: 123, include_comments: true });

// Create a high-priority ticket
await create_ticket({
  subject: "Urgent: System Down",
  comment: { body: "Production system is not responding" },
  priority: "urgent",
  type: "incident"
});
```
</details>

<details>
<summary><b>AI-Powered Features</b></summary>

```javascript
// Analyze images in a ticket
await analyze_ticket_images({
  id: 123,
  analysis_prompt: "Identify any error messages or UI issues"
});

// Add an AI-generated response
await add_ticket_comment({
  id: 123,
  body: "Based on the error screenshot, please try restarting...",
  type: "public"
});
```
</details>

## 🧪 Development

### Running Locally

```bash
# Start the HTTP server (OAuth mode)
npm start

# Development mode with auto-reload
npm run dev

# Test OAuth flow
node test-oauth-flow.js

# Test with MCP Inspector (requires OAuth token)
npm run inspect
```

### Server Architecture

The server now runs in **HTTP mode** using Streamable HTTP transport:

- **Entry Point**: `src/index.js` - Starts HTTP server
- **HTTP Server**: `src/http-server.js` - Express server with OAuth endpoints
- **OAuth Handler**: `src/auth/oauth-handler.js` - OAuth 2.1 with PKCE
- **Session Store**: `src/auth/session-store.js` - In-memory sessions (use Redis in production)
- **MCP Server**: `src/server.js` - MCP server configuration
- **Zendesk Client**: `src/zendesk-client.js` - OAuth-authenticated API client
- **Request Context**: `src/request-context.js` - Per-session client management
- **Tools**: `src/tools/*.js` - MCP tool implementations

### Project Structure

```
zendesk-mcp-server/
├── src/
│   ├── index.js              # Entry point (HTTP mode)
│   ├── http-server.js        # Express server with OAuth
│   ├── server.js             # MCP server setup
│   ├── zendesk-client.js     # OAuth API client
│   ├── request-context.js    # Per-session context
│   ├── auth/
│   │   ├── oauth-handler.js  # OAuth 2.1 with PKCE
│   │   └── session-store.js  # Session management
│   ├── tools/                # Tool implementations
│   └── utils/                # Error handling, retry logic
├── test-oauth-flow.js        # OAuth flow test script
├── .env.example              # Environment template
├── package.json              # Dependencies
└── README.md                # You are here!
```

### Testing OAuth Flow

```bash
# 1. Configure .env with OAuth credentials
cp .env.example .env
# Edit .env with your OAuth app credentials

# 2. Start server
npm start

# 3. Run automated tests
node test-oauth-flow.js

# 4. Manual authorization (in browser)
open http://localhost:3030/oauth/authorize

# 5. Test MCP endpoint with token
curl -H "Authorization: Bearer mcp_your_token" \
     http://localhost:3030/mcp
```

## 🤝 Contributing

We love contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Contribution Guide

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🐛 Troubleshooting

<details>
<summary><b>Common Issues</b></summary>

### OAuth Configuration Error
```
OAuth not configured. Please set ZENDESK_OAUTH_CLIENT_ID...
```
**Solution**:
- Ensure `.env` file exists with all OAuth credentials
- Verify `ZENDESK_OAUTH_CLIENT_ID` and `ZENDESK_OAUTH_CLIENT_SECRET` are set
- Check redirect URI matches OAuth app configuration

### 401 Unauthorized
```
Error: No valid OAuth access token
```
**Solutions**:
- Complete OAuth authorization flow: visit `http://localhost:3030/oauth/authorize`
- Check if token expired (24-hour TTL) - re-authorize if needed
- Ensure Bearer token is included in request: `Authorization: Bearer mcp_xxx`
- Verify token format (should start with `mcp_`)

### Token Refresh Failed
```
Token refresh failed. Please re-authorize.
```
**Solutions**:
- Complete OAuth flow again to get new token
- Check if OAuth app credentials are still valid in Zendesk
- Verify network connectivity to Zendesk servers
- Check Zendesk OAuth app is still active and not revoked

### API Rate Limits
```
Error: 429 Too Many Requests
```
**Solution**:
- Server includes exponential backoff retry logic
- Consider implementing caching for repeated requests
- Upgrade Zendesk plan for higher rate limits
- Check if multiple clients are using same token

### Missing AI Features
```
Error: ANTHROPIC_API_KEY not set
```
**Solution**: Add your Anthropic API key to `.env` file (only needed for AI features)

### Session Lost on Server Restart
```
Error: Invalid or expired token (after server restart)
```
**Solution**:
- This is expected with in-memory session storage
- Re-authorize to get new token
- For production: Implement Redis session store (see `src/auth/session-store.js`)

### PKCE Challenge Failed
```
Error: Token exchange failed: invalid_grant
```
**Solutions**:
- Ensure redirect URI matches exactly in OAuth app settings
- Check for URL encoding issues in redirect URI
- Verify state parameter hasn't been modified
- Try creating a new OAuth app if issue persists

</details>

## 📊 Stats & Info

<div align="center">

| Statistic | Value |
|-----------|-------|
| Total Tools | 40+ |
| API Coverage | 100% |
| Response Time | <100ms |
| Active Users | Growing! |

</div>

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Original implementation by [@mattcoatsworth](https://github.com/mattcoatsworth)
- Built with [Model Context Protocol](https://modelcontextprotocol.com)
- Powered by [Anthropic Claude](https://anthropic.com) for AI features
- Zendesk API for the comprehensive platform

---

<div align="center">

**[⬆ back to top](#-zendesk-mcp-server)**

Made with ❤️ by [SShadowS](https://github.com/SShadowS)

</div>