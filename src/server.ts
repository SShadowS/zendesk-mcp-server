import dotenv from 'dotenv';
dotenv.config();

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { zendeskClient } from './zendesk-client.js';
import { anthropicClient } from './anthropic-client.js';
import { ticketsTools } from './tools/tickets.js';
import { usersTools } from './tools/users.js';
import { organizationsTools } from './tools/organizations.js';
import { groupsTools } from './tools/groups.js';
import { macrosTools } from './tools/macros.js';
import { viewsTools } from './tools/views.js';
import { triggersTools } from './tools/triggers.js';
import { automationsTools } from './tools/automations.js';
import { searchTools } from './tools/search.js';
import { helpCenterTools } from './tools/help-center.js';
import { supportTools } from './tools/support.js';
import { talkTools } from './tools/talk.js';
import { chatTools } from './tools/chat.js';


// Documentation sections
const documentationSections: Record<string, string> = {
  "tickets": "Tickets API allows you to create, modify, and manage support tickets.\nEndpoints: GET /api/v2/tickets, POST /api/v2/tickets, etc.",
  "users": "Users API allows you to create, modify, and manage end users and agents.\nEndpoints: GET /api/v2/users, POST /api/v2/users, etc.",
  "organizations": "Organizations API allows you to create and manage organizations.\nEndpoints: GET /api/v2/organizations, POST /api/v2/organizations, etc.",
  "groups": "Groups API allows you to create and manage agent groups.\nEndpoints: GET /api/v2/groups, POST /api/v2/groups, etc.",
  "macros": "Macros API allows you to create and manage macros for ticket actions.\nEndpoints: GET /api/v2/macros, POST /api/v2/macros, etc.",
  "views": "Views API allows you to create and manage views for filtering tickets.\nEndpoints: GET /api/v2/views, POST /api/v2/views, etc.",
  "triggers": "Triggers API allows you to create and manage triggers for automation.\nEndpoints: GET /api/v2/triggers, POST /api/v2/triggers, etc.",
  "automations": "Automations API allows you to create and manage time-based automations.\nEndpoints: GET /api/v2/automations, POST /api/v2/automations, etc.",
  "search": "Search API allows you to search across Zendesk data.\nEndpoints: GET /api/v2/search, etc.",
  "help_center": "Help Center API allows you to manage articles, categories, and sections.\nEndpoints: GET /api/v2/help_center/articles, etc.",
  "support": "Support API includes core functionality for the Support product.\nEndpoints: Various endpoints for tickets, users, etc.",
  "talk": "Talk API allows you to manage Zendesk Talk phone calls and settings.\nEndpoints: GET /api/v2/channels/voice/stats, etc.",
  "chat": "Chat API allows you to manage Zendesk Chat conversations.\nEndpoints: GET /api/v2/chats, etc.",
  "overview": "The Zendesk API is a RESTful API that uses JSON for serialization. It provides access to Zendesk Support, Talk, Chat, and Guide products."
};

// Create an MCP server for Zendesk API
const server = new McpServer({
  name: "Zendesk API",
  version: "1.0.0"
});

// Register all tools
const allTools = [
  ...ticketsTools,
  ...usersTools,
  ...organizationsTools,
  ...groupsTools,
  ...macrosTools,
  ...viewsTools,
  ...triggersTools,
  ...automationsTools,
  ...searchTools,
  ...helpCenterTools,
  ...supportTools,
  ...talkTools,
  ...chatTools
];

// Register each tool with the server
allTools.forEach((tool: any) => {
  server.tool(
    tool.name,
    tool.handler,
    tool.schema
  );
});

// Add a resource for Zendesk API documentation
server.resource(
  "documentation",
  new ResourceTemplate("zendesk://docs/{section}", { list: undefined }),
  async (uri: URL, args: any) => {
    const section = args.section;

    if (!section || section === "all") {
      return {
        contents: [{
          uri: uri.href,
          text: `Zendesk API Documentation Overview\n\n${Object.keys(documentationSections).map(key => `- ${key}: ${documentationSections[key]!.split('\n')[0]}`).join('\n')}`
        }]
      };
    }

    if (documentationSections[section]) {
      return {
        contents: [{
          uri: uri.href,
          text: `Zendesk API Documentation: ${section}\n\n${documentationSections[section]}`
        }]
      };
    }

    return {
      contents: [{
        uri: uri.href,
        text: `Documentation section '${section}' not found. Available sections: ${Object.keys(documentationSections).join(', ')}`
      }]
    };
  }
);

// Initialize server and test connections
async function initializeServer(): Promise<McpServer> {
  console.log('Initializing Zendesk MCP Server...');
  
  // Test Zendesk connection
  try {
    await zendeskClient.testConnection();
  } catch (error) {
    console.error('Warning: Zendesk connection test failed. The server will start but API calls may fail.');
    console.error('Please verify your environment variables: ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN');
  }
  
  // Test Anthropic connection
  try {
    await anthropicClient.testConnection();
  } catch (error: any) {
    console.error('Warning: Anthropic API connection test failed. Image analysis features may not work.');
    console.error('Please verify your ANTHROPIC_API_KEY environment variable.');
    console.error(`Error: ${error.message}`);
  }
  
  return server;
}

export { server, initializeServer };