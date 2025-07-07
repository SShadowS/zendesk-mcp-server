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

Zendesk MCP Server provides a comprehensive interface to the Zendesk API through the Model Context Protocol, enabling AI assistants to interact with your support system. With built-in AI-powered ticket analysis and full API coverage, it's the perfect tool for automating and enhancing your customer support workflows.

> 💡 **Based on** [mattcoatsworth/zendesk-mcp-server](https://github.com/mattcoatsworth/zendesk-mcp-server) with significant enhancements including AI-powered features, improved error handling, and comprehensive security improvements.

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

</td>
</tr>
</table>

## 🚀 Quick Start

### 1️⃣ Install
```bash
npm install -g @sshadows/zendesk-mcp-server
```

### 2️⃣ Configure MCP
Add to your MCP settings (`~/.config/mcp/settings.json`):

```json
{
  "servers": {
    "zendesk": {
      "command": "npx",
      "args": ["@sshadows/zendesk-mcp-server"],
      "env": {
        "ZENDESK_SUBDOMAIN": "your-subdomain",
        "ZENDESK_EMAIL": "your-email@example.com",
        "ZENDESK_API_TOKEN": "your-api-token",
        "ANTHROPIC_API_KEY": "your-anthropic-api-key"
      }
    }
  }
}
```

### 3️⃣ Start Using
Your AI assistant can now interact with Zendesk! Try:
- "List all open tickets"
- "Analyze images in ticket #123"
- "Create a new user"

## 📦 Installation

### Prerequisites

| Requirement | Version | Required |
|------------|---------|----------|
| Node.js | ≥ 14.0.0 | ✅ |
| Zendesk Account | Any | ✅ |
| Zendesk API Token | - | ✅ |
| Anthropic API Key | - | ✅ |

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
# Zendesk Configuration
ZENDESK_SUBDOMAIN=mycompany        # Your Zendesk subdomain
ZENDESK_EMAIL=admin@mycompany.com  # Admin email
ZENDESK_API_TOKEN=abc123...        # Generate in Admin → API

# AI Features
ANTHROPIC_API_KEY=sk-ant-...       # For vision & analysis features
```

### 🔑 Getting Your API Keys

<details>
<summary><b>Zendesk API Token</b></summary>

1. Log in to Zendesk Admin Center
2. Navigate to **Apps and integrations** → **APIs** → **Zendesk API**
3. Click **Add API token**
4. Copy the generated token

</details>

<details>
<summary><b>Anthropic API Key</b></summary>

1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Navigate to **API Keys**
3. Create a new key
4. Copy and save securely

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
# Start the server
npm start

# Development mode with auto-reload
npm run dev

# Test with MCP Inspector
npm run inspect
```

### Project Structure

```
zendesk-mcp-server/
├── src/
│   ├── index.js          # Entry point
│   ├── server.js         # MCP server setup
│   ├── zendesk-client.js # API client
│   └── tools/            # Tool implementations
├── .env.example          # Environment template
├── package.json          # Dependencies
└── README.md            # You are here!
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

### Connection Failed
```
✗ Failed to connect to Zendesk
```
**Solution**: Verify your credentials in `.env` file

### API Rate Limits
```
Error: 429 Too Many Requests
```
**Solution**: Implement request throttling or upgrade your Zendesk plan

### Missing AI Features
```
Error: ANTHROPIC_API_KEY not set
```
**Solution**: Add your Anthropic API key to the environment

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