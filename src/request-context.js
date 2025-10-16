import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request Context for Per-Session Zendesk Clients
 *
 * Uses AsyncLocalStorage to maintain request-scoped context for Zendesk clients.
 * This allows tool handlers to access the correct client without needing to pass
 * session IDs through the MCP protocol.
 *
 * Usage:
 * - HTTP server: Call runInContext(sessionId, client, fn) to run handler in context
 * - Tool handlers: Call getZendeskClient() to access the current request's client
 */

// AsyncLocalStorage for request context
const asyncLocalStorage = new AsyncLocalStorage();

// Map of session ID -> ZendeskClient instance (for storage)
const sessionClients = new Map();

/**
 * Store Zendesk client for a session
 * @param {string} sessionId - Session identifier
 * @param {ZendeskClient} client - Zendesk client instance for this session
 */
export function storeZendeskClient(sessionId, client) {
  sessionClients.set(sessionId, client);
}

/**
 * Run a function within a request context
 * @param {string} sessionId - Session identifier
 * @param {Function} fn - Async function to run
 * @returns {Promise} Result of fn()
 */
export function runInContext(sessionId, fn) {
  return asyncLocalStorage.run({ sessionId }, fn);
}

/**
 * Get the Zendesk client for the current request context
 * @returns {ZendeskClient} Zendesk client instance
 * @throws {Error} If no context or client found
 */
export function getZendeskClient() {
  const store = asyncLocalStorage.getStore();

  if (!store || !store.sessionId) {
    throw new Error('No session context available. This tool must be called through the MCP server.');
  }

  const client = sessionClients.get(store.sessionId);

  if (!client) {
    throw new Error(`No Zendesk client found for session ${store.sessionId}. This should not happen - please report this bug.`);
  }

  return client;
}

/**
 * Clear the Zendesk client for a session
 * @param {string} sessionId - Session identifier
 */
export function clearZendeskClient(sessionId) {
  sessionClients.delete(sessionId);
}

/**
 * Get session count (for debugging)
 */
export function getSessionCount() {
  return sessionClients.size;
}
