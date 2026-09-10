/**
 * Read-only mode configuration
 *
 * Controls whether the server is permitted to modify Zendesk data.
 *
 * - READ_ONLY=true      exposes read tools plus internal-note commenting,
 *                       and rejects every other write at the HTTP layer.
 * - READ_ONLY_STRICT=true additionally removes internal notes, leaving no
 *                       write path at all.
 *
 * Strict is a separate boolean rather than a third value of READ_ONLY on
 * purpose: a single READ_ONLY=true is often shared across several MCP
 * servers, and some of them treat an unrecognised value as false with only
 * a warning. READ_ONLY=strict would therefore silently make those servers
 * writable.
 */

import { ZendeskReadOnlyError } from '../utils/errors.js';

const TRUTHY = ['true', '1'];
const FALSY = ['false', '0', ''];

function isTruthy(value) {
  return TRUTHY.includes(value?.toLowerCase());
}

/**
 * A value that is set but parses as neither true nor false. It resolves to
 * false, so warning about it matters: a typo'd READ_ONLY_STRICT would
 * otherwise silently reopen the internal-note write path.
 */
function isUnrecognized(value) {
  if (value === undefined) {
    return false;
  }
  const normalized = value.toLowerCase();
  return !TRUTHY.includes(normalized) && !FALSY.includes(normalized);
}

/**
 * Resolve the active read-only mode
 *
 * READ_ONLY_STRICT implies read-only even when READ_ONLY is unset or false.
 * Anything else would let a server told to be strict come up fully writable,
 * which is the worst available failure.
 *
 * @returns {'off' | 'standard' | 'strict'}
 */
export function getReadOnlyMode() {
  if (isTruthy(process.env.READ_ONLY_STRICT)) {
    return 'strict';
  }
  return isTruthy(process.env.READ_ONLY) ? 'standard' : 'off';
}

/**
 * Check whether any read-only mode is enabled
 * @returns {boolean}
 */
export function isReadOnly() {
  return getReadOnlyMode() !== 'off';
}

/**
 * Check whether strict read-only mode is enabled (no write path at all)
 * @returns {boolean}
 */
export function isStrictReadOnly() {
  return getReadOnlyMode() === 'strict';
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
 * Allowlisted tools that can still modify Zendesk.
 *
 * Strict mode is defined as the allowlist minus these, so it stays correct
 * as tools change instead of depending on a separately maintained list.
 * Anything added to READ_ONLY_ALLOWED_TOOLS that writes must be named here.
 */
export const READ_ONLY_MUTATING_TOOLS = [
  'add_ticket_comment'
];

/**
 * Filter tools down to those allowed in the active read-only mode
 * @param {Array} tools - Array of tool definitions
 * @returns {Array} The same array when read-only is off, otherwise only allowed tools
 */
export function filterToolsByReadOnly(tools) {
  const mode = getReadOnlyMode();

  if (mode === 'off') {
    return tools;
  }

  return tools.filter(tool => {
    if (!READ_ONLY_ALLOWED_TOOLS.includes(tool.name)) {
      return false;
    }
    return mode !== 'strict' || !READ_ONLY_MUTATING_TOOLS.includes(tool.name);
  });
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
  const mode = getReadOnlyMode();

  if (mode === 'off') {
    return;
  }

  if (method?.toUpperCase() === 'GET') {
    return;
  }

  if (mode === 'strict') {
    throw new ZendeskReadOnlyError(
      `READ_ONLY_STRICT mode is enabled; ${method} ${endpoint} was blocked. ` +
      'Only reads are permitted -- internal notes are disallowed in strict mode.'
    );
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
  const mode = getReadOnlyMode();

  for (const name of ['READ_ONLY', 'READ_ONLY_STRICT']) {
    if (isUnrecognized(process.env[name])) {
      console.error(
        `[Read-Only] WARNING: ${name}="${process.env[name]}" is an unrecognised value ` +
        'and is being treated as false. Use "true" or "1" to enable it.'
      );
    }
  }

  if (mode === 'strict') {
    console.error('[Read-Only] mode=STRICT (READ_ONLY_STRICT) - all writes are blocked');
    console.error('[Read-Only] Permitted: reads only (no ticket comments of any kind)');
    return;
  }

  if (mode === 'standard') {
    console.error('[Read-Only] mode=STANDARD (READ_ONLY) - writes are blocked');
    console.error('[Read-Only] Permitted: reads and internal ticket notes (no public replies)');
    console.error('[Read-Only] Set READ_ONLY_STRICT=true to remove internal notes as well');
    return;
  }

  console.error('[Read-Only] mode=OFF - writes are permitted');
}
