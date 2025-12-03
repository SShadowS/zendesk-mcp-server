/**
 * Tool mode configuration
 *
 * Controls which tools are exposed based on the MODE environment variable.
 * Set MODE=lite to reduce context usage by exposing only essential tools.
 */

// Tools included in lite mode (minimal context footprint)
export const LITE_MODE_TOOLS = [
  // Search
  'search',

  // Users (read-only)
  'get_user',

  // Document Analysis
  'analyze_ticket_documents',
  'get_document_summary',

  // Tickets (core operations)
  'list_tickets',
  'get_ticket',
  'get_ticket_comments',
  'add_ticket_comment',
  'get_ticket_attachments',
  'analyze_ticket_images'
];

/**
 * Get the current tool mode from environment
 * @returns {'full' | 'lite'} The current mode
 */
export function getToolMode() {
  const mode = process.env.MODE?.toLowerCase();
  return mode === 'lite' ? 'lite' : 'full';
}

/**
 * Filter tools based on the current mode
 * @param {Array} allTools - Array of all tool definitions
 * @returns {Array} Filtered tools based on current mode
 */
export function filterToolsByMode(allTools) {
  const mode = getToolMode();

  if (mode === 'full') {
    return allTools;
  }

  // Lite mode - only include specified tools
  return allTools.filter(tool => LITE_MODE_TOOLS.includes(tool.name));
}

/**
 * Log the current tool mode configuration
 * @param {number} toolCount - Number of tools registered
 */
export function logToolModeInfo(toolCount) {
  const mode = getToolMode();

  if (mode === 'lite') {
    console.log(`[Tool Mode] LITE mode enabled - ${toolCount} tools registered`);
    console.log(`[Tool Mode] Available tools: ${LITE_MODE_TOOLS.join(', ')}`);
  } else {
    console.log(`[Tool Mode] FULL mode - ${toolCount} tools registered`);
  }
}
