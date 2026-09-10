/**
 * Read-only mode configuration
 *
 * Controls whether the server is permitted to modify Zendesk data.
 * Set READ_ONLY=true to expose only read tools plus internal-note
 * commenting, and to reject every other write at the HTTP layer.
 */

import { ZendeskReadOnlyError } from '../utils/errors.js';

/**
 * Check whether read-only mode is enabled
 * @returns {boolean}
 */
export function isReadOnly() {
  const value = process.env.READ_ONLY?.toLowerCase();
  return value === 'true' || value === '1';
}

/**
 * Tools permitted while read-only mode is active.
 *
 * This is an allowlist rather than a blocklist so the flag fails closed:
 * a write tool added to the server later is unavailable in read-only mode
 * until someone deliberately lists it here.
 *
 * `add_ticket_comment` is the sole mutating entry, and only for internal
 * notes — the transport guard in ZendeskClientBase.request() rejects the
 * public-reply payload shape.
 */
export const READ_ONLY_ALLOWED_TOOLS = [
  // Search
  'search',
  'support_info',

  // Tickets
  'get_ticket',
  'list_tickets',
  'get_ticket_comments',
  'get_ticket_attachments',
  'add_ticket_comment',

  // Analysis
  'analyze_ticket_images',
  'analyze_ticket_documents',
  'get_document_summary',

  // Users & organizations
  'get_user',
  'list_users',
  'get_organization',
  'list_organizations',
  'get_group',
  'list_groups',

  // Business rules
  'get_macro',
  'list_macros',
  'get_view',
  'list_views',
  'get_trigger',
  'list_triggers',
  'get_automation',
  'list_automations',

  // Help Center
  'get_article',
  'list_articles',

  // Channels
  'get_talk_stats',
  'list_chats'
];

/**
 * Filter tools down to those allowed in read-only mode
 * @param {Array} tools - Array of tool definitions
 * @returns {Array} The same array when read-only is off, otherwise only allowed tools
 */
export function filterToolsByReadOnly(tools) {
  if (!isReadOnly()) {
    return tools;
  }
  return tools.filter(tool => READ_ONLY_ALLOWED_TOOLS.includes(tool.name));
}

/**
 * The one mutating request read-only mode tolerates: appending an internal
 * note to a ticket. Zendesk exposes this through the same verb and endpoint
 * as a full ticket update (PUT /tickets/{id}.json), so the payload shape --
 * a lone `comment` key with `public` explicitly false -- is what separates
 * an allowed note from a disallowed edit.
 */
function isInternalNotePayload(endpoint, data) {
  if (!/^\/tickets\/\d+\.json$/.test(endpoint)) {
    return false;
  }

  const ticket = data?.ticket;
  if (!ticket || typeof ticket !== 'object') {
    return false;
  }

  const keys = Object.keys(ticket);
  if (keys.length !== 1 || keys[0] !== 'comment') {
    return false;
  }

  return ticket.comment?.public === false;
}

/**
 * Reject any request that would modify Zendesk while read-only mode is active.
 *
 * This is the enforcement layer: tool filtering shapes what a client can see,
 * but every Zendesk call funnels through here, so a write cannot slip past by
 * another route.
 *
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint path
 * @param {object|null} data - Request body
 * @throws {ZendeskReadOnlyError} When the request is not permitted
 */
export function assertReadOnlyAllowed(method, endpoint, data) {
  if (!isReadOnly()) {
    return;
  }

  if (method?.toUpperCase() === 'GET') {
    return;
  }

  if (method?.toUpperCase() === 'PUT' && isInternalNotePayload(endpoint, data)) {
    return;
  }

  throw new ZendeskReadOnlyError(
    `READ_ONLY mode is enabled; ${method} ${endpoint} was blocked. ` +
    'Only reads and internal ticket notes are permitted.'
  );
}

/**
 * Log the read-only configuration at startup
 * Uses console.error because stdout is reserved for the MCP transport in stdio mode.
 */
export function logReadOnlyInfo() {
  if (isReadOnly()) {
    console.error('[Read-Only] READ_ONLY enabled - writes are blocked');
    console.error('[Read-Only] Permitted: reads and internal ticket notes (no public replies)');
  }
}
