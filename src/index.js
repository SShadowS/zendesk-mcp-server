#!/usr/bin/env node
import dotenv from 'dotenv';

// Load environment variables before anything else
dotenv.config();

/**
 * Auto-detect transport mode based on environment variables:
 * - ZENDESK_EMAIL + ZENDESK_API_TOKEN (without ZENDESK_OAUTH_CLIENT_ID) → stdio mode
 * - ZENDESK_OAUTH_CLIENT_ID → HTTP mode
 * - Neither → error with usage instructions
 */

const hasApiToken = process.env.ZENDESK_EMAIL && process.env.ZENDESK_API_TOKEN;
const hasOAuth = !!process.env.ZENDESK_OAUTH_CLIENT_ID;

if (hasOAuth) {
  // HTTP + OAuth mode
  console.log('Starting Zendesk MCP Server in HTTP mode...');
  const { startHttpServer } = await import('./http-server.js');
  startHttpServer();

} else if (hasApiToken) {
  // Stdio + API token mode
  // All logging MUST use console.error — stdout is the MCP transport
  console.error('Starting Zendesk MCP Server in stdio mode...');

  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { ZendeskClient } = await import('./zendesk-client/index.js');
  const { setDefaultZendeskClient } = await import('./request-context.js');
  const { initializeServer } = await import('./server.js');

  // Create and configure client with API token auth
  const client = new ZendeskClient();
  client.setApiTokenAuth(process.env.ZENDESK_EMAIL, process.env.ZENDESK_API_TOKEN);
  setDefaultZendeskClient(client);

  // Optionally test the connection
  try {
    const result = await client.testConnection();
    console.error(`[Zendesk] Connected as ${result.user.name} (${result.user.email})`);
  } catch (error) {
    console.error(`[Zendesk] Warning: connection test failed: ${error.message}`);
    console.error('[Zendesk] Continuing anyway — tools will fail if credentials are invalid.');
  }

  // Start MCP server over stdio
  const server = await initializeServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Zendesk MCP Server running on stdio');

} else {
  // No valid configuration
  console.error(`
Zendesk MCP Server — missing configuration.

Configure one of the following authentication modes:

  Stdio mode (API token):
    ZENDESK_SUBDOMAIN=your-subdomain
    ZENDESK_EMAIL=your-email@example.com
    ZENDESK_API_TOKEN=your-api-token

  HTTP mode (OAuth 2.1):
    ZENDESK_SUBDOMAIN=your-subdomain
    ZENDESK_OAUTH_CLIENT_ID=your-client-id
    ZENDESK_OAUTH_CLIENT_SECRET=your-client-secret
    ZENDESK_OAUTH_REDIRECT_URI=http://localhost:3030/zendesk/oauth/callback

See .env.example for the full list of environment variables.
`);
  process.exit(1);
}
