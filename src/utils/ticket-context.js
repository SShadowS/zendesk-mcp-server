/**
 * Build ticket context string from ticket data for analysis prompts.
 * Used by both image and document analysis tools to provide
 * support ticket context to Claude when analyzing attachments.
 *
 * @param {Object} ticketData - Ticket data from getTicket (with comments)
 * @returns {string} Context string to prepend to analysis prompt
 */
export function buildTicketContext(ticketData) {
  const ticket = ticketData?.ticket;
  if (!ticket) return '';

  let context = `Support ticket: "${ticket.subject || 'No subject'}"`;
  if (ticket.description) {
    context += `\nCustomer reported: ${ticket.description.substring(0, 500)}`;
  }
  if (ticket.tags?.length) {
    context += `\nTags: ${ticket.tags.join(', ')}`;
  }

  const comments = ticketData?.comments || ticket?.comments;
  if (comments?.length > 0) {
    const recent = comments.slice(-5);
    context += '\n\nRecent conversation:';
    for (const c of recent) {
      const body = (c.plain_body || c.body || '').substring(0, 300);
      context += `\n- ${body}`;
    }
  }

  return context;
}
