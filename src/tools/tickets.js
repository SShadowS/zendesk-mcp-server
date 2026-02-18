import dotenv from 'dotenv';
dotenv.config();

import { z } from 'zod';
import axios from 'axios';
import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';
import { buildTicketContext } from '../utils/ticket-context.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 60000
});

const IMAGE_ANALYSIS_SYSTEM_PROMPT = `You are a technical support analyst examining attachments from a customer support ticket. Your job is to extract information that helps resolve the customer's issue.

Focus on:
- Error messages, codes, and stack traces
- Software versions, build numbers, environment details
- Configuration settings and their values
- UI state that indicates a problem (greyed-out buttons, missing elements, incorrect values)
- Steps the customer appears to have taken
- Any discrepancy between expected and actual behavior

Be concise. Lead with the most actionable finding. Skip describing obvious UI chrome unless it's relevant to the issue.`;

const DEFAULT_IMAGE_ANALYSIS_PROMPT = `Analyze this image from a support ticket. Extract:
1. Any error messages, warning dialogs, or status indicators
2. Software/product version numbers or environment details visible
3. Configuration or settings shown
4. What action the user appears to be performing
5. Any anomaly or issue visible

If this is a screenshot of a UI, identify the application and the specific screen/page shown.`;

/**
 * Fetch and filter image attachments from a ticket
 * @param {Object} zendeskClient - Zendesk client instance
 * @param {number} ticketId - Ticket ID
 * @param {boolean} includeInline - Include inline images from HTML
 * @returns {Object} { imageAttachments, inlineCount, attachedCount }
 */
async function fetchImageAttachments(zendeskClient, ticketId, includeInline) {
  const attachmentsResult = await zendeskClient.getTicketAttachments(ticketId, {
    includeInlineImages: includeInline
  });

  const imageAttachments = attachmentsResult.attachments.filter(att =>
    att.content_type && att.content_type.startsWith('image/')
  );

  const inlineCount = imageAttachments.filter(a => a.is_inline).length;
  const attachedCount = imageAttachments.length - inlineCount;

  return { imageAttachments, inlineCount, attachedCount };
}

/**
 * Download image data (handles inline vs regular attachments)
 * @param {Object} zendeskClient - Zendesk client instance
 * @param {Object} attachment - Attachment object
 * @returns {Object} { data, contentType, size }
 */
async function downloadImageData(zendeskClient, attachment) {
  if (attachment.is_inline) {
    try {
      const response = await axios({
        method: 'GET',
        url: attachment.content_url,
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return {
        data: response.data,
        contentType: response.headers['content-type'] || attachment.content_type,
        size: response.data.length
      };
    } catch (inlineError) {
      // Fallback to Zendesk auth for Zendesk-hosted inline images
      return zendeskClient.downloadAttachment(attachment.content_url);
    }
  }

  return zendeskClient.downloadAttachment(attachment.content_url);
}

/**
 * Analyze an image using Claude's vision API
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} contentType - Image content type
 * @param {string} analysisPrompt - Prompt for analysis
 * @param {number} maxTokens - Max tokens for response
 * @returns {string} Analysis result text
 */
async function analyzeImageWithClaude(base64Data, contentType, analysisPrompt, maxTokens, systemPrompt) {
  const requestParams = {
    model: "claude-sonnet-4-6",
    max_tokens: Math.min(maxTokens, 4096),
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: contentType,
            data: base64Data
          }
        },
        {
          type: "text",
          text: analysisPrompt
        }
      ]
    }]
  };

  if (systemPrompt) {
    requestParams.system = systemPrompt;
  }

  const message = await anthropic.messages.create(requestParams);

  return message.content[0].text;
}

/**
 * Process a single image attachment
 * @param {Object} zendeskClient - Zendesk client instance
 * @param {Object} attachment - Attachment object
 * @param {string} analysisPrompt - Prompt for analysis
 * @param {number} maxTokens - Max tokens for response
 * @returns {Object} Processing result
 */
async function processImageAttachment(zendeskClient, attachment, analysisPrompt, maxTokens, systemPrompt) {
  try {
    const downloadResult = await downloadImageData(zendeskClient, attachment);
    const base64Data = Buffer.from(downloadResult.data).toString('base64');

    const analysis = await analyzeImageWithClaude(
      base64Data,
      downloadResult.contentType || attachment.content_type,
      analysisPrompt,
      maxTokens,
      systemPrompt
    );

    return {
      attachment: {
        id: attachment.id,
        filename: attachment.file_name,
        size: downloadResult.size || attachment.size,
        content_type: downloadResult.contentType || attachment.content_type,
        comment_id: attachment.comment_id,
        is_inline: attachment.is_inline
      },
      analysis
    };
  } catch (error) {
    return {
      attachment: {
        id: attachment.id,
        filename: attachment.file_name,
        comment_id: attachment.comment_id,
        is_inline: attachment.is_inline
      },
      error: error.message
    };
  }
}

/**
 * Format image analysis results into readable text
 * @param {Array} analyses - Array of analysis results
 * @param {number} ticketId - Ticket ID
 * @param {boolean} includeInline - Whether inline images were included
 * @param {number} inlineCount - Count of inline images
 * @param {number} attachedCount - Count of attached images
 * @returns {string} Formatted result text
 */
function formatImageAnalysisResults(analyses, ticketId, includeInline, inlineCount, attachedCount) {
  let resultText = `Found ${analyses.length} image(s) in ticket ${ticketId}`;

  if (includeInline && (inlineCount > 0 || attachedCount > 0)) {
    resultText += ` (${attachedCount} attached, ${inlineCount} inline)`;
  }
  resultText += `:\n\n`;

  for (const result of analyses) {
    const sourceType = result.attachment.is_inline ? '🔗 Inline' : '📎 Attached';

    if (result.error) {
      resultText += `❌ [${sourceType}] ${result.attachment.filename}: ${result.error}\n\n`;
    } else {
      const sizeStr = result.attachment.size ? `, ${result.attachment.size} bytes` : '';
      resultText += `📷 [${sourceType}] ${result.attachment.filename} (${result.attachment.content_type}${sizeStr})\n`;
      resultText += `Comment ID: ${result.attachment.comment_id}\n`;
      resultText += `🔍 AI Analysis:\n${result.analysis}\n\n`;
    }
  }

  return resultText;
}

export const ticketsTools = [
      {
        name: "list_tickets",
        description: "List tickets in Zendesk",
        schema: z.object({
          page: z.number().optional().describe("Page number for pagination"),
          per_page: z.number().optional().describe("Number of tickets per page (max 100)"),
          sort_by: z.string().optional().describe("Field to sort by"),
          sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)")
        }),
        handler: async ({ page, per_page, sort_by, sort_order }) => {
          try {
            const zendeskClient = getZendeskClient();
            const params = { page, per_page, sort_by, sort_order };
            const result = await zendeskClient.listTickets(params);
            return {
              content: [{ 
                type: "text", 
                text: JSON.stringify(result, null, 2)
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "get_ticket",
        description: "Get a specific ticket by ID with optional comments",
        schema: z.object({
          id: z.number().describe("Ticket ID"),
          include_comments: z.boolean().optional().describe("Include ticket comments in response (default: false)")
        }),
        handler: async ({ id, include_comments = false }) => {
          try {
            const zendeskClient = getZendeskClient();
            const result = await zendeskClient.getTicket(id, include_comments);
            return {
              content: [{ 
                type: "text", 
                text: JSON.stringify(result, null, 2)
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "create_ticket",
        description: "Create a new ticket",
        schema: z.object({
          subject: z.string().describe("Ticket subject"),
          comment: z.string().describe("Ticket comment/description"),
          priority: z.enum(["urgent", "high", "normal", "low"]).optional().describe("Ticket priority"),
          status: z.enum(["new", "open", "pending", "hold", "solved", "closed"]).optional().describe("Ticket status"),
          requester_id: z.number().optional().describe("User ID of the requester"),
          assignee_id: z.number().optional().describe("User ID of the assignee"),
          group_id: z.number().optional().describe("Group ID for the ticket"),
          type: z.enum(["problem", "incident", "question", "task"]).optional().describe("Ticket type"),
          tags: z.array(z.string()).optional().describe("Tags for the ticket")
        }),
        handler: async ({ subject, comment, priority, status, requester_id, assignee_id, group_id, type, tags }) => {
          try {
            const zendeskClient = getZendeskClient();
            const ticketData = {
              subject,
              comment: { body: comment },
              priority,
              status,
              requester_id,
              assignee_id,
              group_id,
              type,
              tags
            };
            
            const result = await zendeskClient.createTicket(ticketData);
            return {
              content: [{ 
                type: "text", 
                text: `Ticket created successfully!\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "update_ticket",
        description: "Update an existing ticket",
        schema: z.object({
          id: z.number().describe("Ticket ID to update"),
          subject: z.string().optional().describe("Updated ticket subject"),
          comment: z.string().optional().describe("New comment to add"),
          priority: z.enum(["urgent", "high", "normal", "low"]).optional().describe("Updated ticket priority"),
          status: z.enum(["new", "open", "pending", "hold", "solved", "closed"]).optional().describe("Updated ticket status"),
          assignee_id: z.number().optional().describe("User ID of the new assignee"),
          group_id: z.number().optional().describe("New group ID for the ticket"),
          type: z.enum(["problem", "incident", "question", "task"]).optional().describe("Updated ticket type"),
          tags: z.array(z.string()).optional().describe("Updated tags for the ticket")
        }),
        handler: async ({ id, subject, comment, priority, status, assignee_id, group_id, type, tags }) => {
          try {
            const zendeskClient = getZendeskClient();
            const ticketData = {};
            
            if (subject !== undefined) ticketData.subject = subject;
            if (comment !== undefined) ticketData.comment = { body: comment };
            if (priority !== undefined) ticketData.priority = priority;
            if (status !== undefined) ticketData.status = status;
            if (assignee_id !== undefined) ticketData.assignee_id = assignee_id;
            if (group_id !== undefined) ticketData.group_id = group_id;
            if (type !== undefined) ticketData.type = type;
            if (tags !== undefined) ticketData.tags = tags;
            
            const result = await zendeskClient.updateTicket(id, ticketData);
            return {
              content: [{ 
                type: "text", 
                text: `Ticket updated successfully!\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "delete_ticket",
        description: "Delete a ticket",
        schema: z.object({
          id: z.number().describe("Ticket ID to delete")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            await zendeskClient.deleteTicket(id);
            return {
              content: [{ 
                type: "text", 
                text: `Ticket ${id} deleted successfully!`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "get_ticket_comments",
        description: "Get comments for a specific ticket",
        schema: z.object({
          id: z.number().describe("Ticket ID"),
          page: z.number().optional().describe("Page number for pagination"),
          per_page: z.number().optional().describe("Number of comments per page (max 100)"),
          sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)")
        }),
        handler: async ({ id, page, per_page, sort_order }) => {
          try {
            const zendeskClient = getZendeskClient();
            const params = { page, per_page, sort_order };
            const result = await zendeskClient.getTicketComments(id, params);
            return {
              content: [{ 
                type: "text", 
                text: JSON.stringify(result, null, 2)
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "add_ticket_comment",
        description: "Add a public or internal comment to an existing ticket",
        schema: z.object({
          id: z.number().describe("Ticket ID"),
          body: z.string().describe("Comment body"),
          type: z.enum(["public", "internal"]).optional().describe("Comment type: 'public' (visible to end users) or 'internal' (agents only). Default: 'internal'"),
          author_id: z.number().optional().describe("Author ID (defaults to current user)")
        }),
        handler: async ({ id, body, type = "internal", author_id }) => {
          try {
            const zendeskClient = getZendeskClient();
            const commentData = { 
              body, 
              public: type === "public"
            };
            if (author_id !== undefined) commentData.author_id = author_id;
            
            const result = await zendeskClient.addTicketComment(id, commentData);
            return {
              content: [{ 
                type: "text", 
                text: `${type === "public" ? "Public" : "Internal"} comment added successfully!\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "get_ticket_attachments",
        description: "Get all attachments from a ticket's comments",
        schema: z.object({
          id: z.number().describe("Ticket ID")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            const result = await zendeskClient.getTicketAttachments(id);
            return {
              content: [{ 
                type: "text", 
                text: JSON.stringify(result, null, 2)
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "analyze_ticket_images",
        description: "Download and analyze images from a ticket using AI vision with comprehensive analysis. Includes both file attachments and inline images embedded in comment bodies.",
        schema: z.object({
          id: z.number().describe("Ticket ID"),
          analysis_prompt: z.string().optional().describe("Custom analysis prompt (default: general image description)"),
          max_tokens: z.number().optional().describe("Maximum tokens for response (default: 4096, max: 4096)"),
          include_inline: z.boolean().optional().describe("Include inline images from comment HTML bodies (default: true)")
        }),
        handler: async ({
          id,
          analysis_prompt,
          max_tokens = 4096,
          include_inline = true
        }) => {
          try {
            const zendeskClient = getZendeskClient();

            // Fetch and filter image attachments
            const { imageAttachments, inlineCount, attachedCount } = await fetchImageAttachments(
              zendeskClient,
              id,
              include_inline
            );

            // Handle no images found
            if (imageAttachments.length === 0) {
              return {
                content: [{
                  type: "text",
                  text: include_inline
                    ? "No image attachments or inline images found in this ticket."
                    : "No image attachments found in this ticket."
                }]
              };
            }

            // Fetch ticket context for better analysis (one call for all images)
            let ticketContext = '';
            try {
              const ticketData = await zendeskClient.getTicket(id, true);
              ticketContext = buildTicketContext(ticketData);
            } catch (err) {
              // Non-fatal: proceed without context if ticket fetch fails
            }

            // Build the final prompt with ticket context
            const basePrompt = analysis_prompt || DEFAULT_IMAGE_ANALYSIS_PROMPT;
            const contextualPrompt = ticketContext
              ? `${ticketContext}\n\n${basePrompt}`
              : basePrompt;

            // Process each image
            const analyses = [];
            for (const attachment of imageAttachments) {
              const result = await processImageAttachment(zendeskClient, attachment, contextualPrompt, max_tokens, IMAGE_ANALYSIS_SYSTEM_PROMPT);
              analyses.push(result);
            }

            // Format and return results
            const resultText = formatImageAnalysisResults(analyses, id, include_inline, inlineCount, attachedCount);
            return {
              content: [{ type: "text", text: resultText }]
            };

          } catch (error) {
            return createErrorResponse(error);
          }
        }
      }
    ];
