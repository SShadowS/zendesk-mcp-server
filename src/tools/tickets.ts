import { z } from 'zod';
import { zendeskClient } from '../zendesk-client.js';
import { createErrorResponse } from '../utils/errors.js';
import { anthropicClient } from '../anthropic-client.js';
import { McpTool, McpToolResponse } from '../types/index.js';

export const ticketsTools: McpTool[] = [
  {
    name: "list_tickets",
    description: "List tickets in Zendesk",
    schema: {
      page: z.coerce.number().optional().describe("Page number for pagination"),
      per_page: z.coerce.number().optional().describe("Number of tickets per page (max 100)"),
      sort_by: z.string().optional().describe("Field to sort by"),
      sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)")
    },
    handler: async ({ page, per_page, sort_by, sort_order }: {
      page?: number;
      per_page?: number;
      sort_by?: string;
      sort_order?: "asc" | "desc";
    }): Promise<McpToolResponse> => {
      // Logging handled by server wrapper
      try {
        const params = { page, per_page, sort_by, sort_order };
        const result = await zendeskClient.listTickets(params);
        // Success logging handled by server wrapper
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "get_ticket",
    description: "Get a specific ticket by ID with optional comments",
    schema: {
      id: z.coerce.number().describe("Ticket ID"),
      include_comments: z.coerce.boolean().optional().describe("Include ticket comments in response (default: false)")
    },
    handler: async ({ id, include_comments = false }: {
      id: number;
      include_comments?: boolean;
    }): Promise<McpToolResponse> => {
      // Logging handled by server wrapper
      try {
        const result = await zendeskClient.getTicket(id, include_comments);
        // Success logging handled by server wrapper
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        // Error logging handled by server wrapper
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "create_ticket",
    description: "Create a new ticket",
    schema: {
      subject: z.string().describe("Ticket subject"),
      comment: z.string().describe("Ticket comment/description"),
      priority: z.enum(["urgent", "high", "normal", "low"]).optional().describe("Ticket priority"),
      status: z.enum(["new", "open", "pending", "hold", "solved", "closed"]).optional().describe("Ticket status"),
      requester_id: z.coerce.number().optional().describe("User ID of the requester"),
      assignee_id: z.coerce.number().optional().describe("User ID of the assignee"),
      group_id: z.coerce.number().optional().describe("Group ID for the ticket"),
      type: z.enum(["problem", "incident", "question", "task"]).optional().describe("Ticket type"),
      tags: z.array(z.string()).optional().describe("Tags for the ticket")
    },
    handler: async ({ subject, comment, priority, status, requester_id, assignee_id, group_id, type, tags }: {
      subject: string;
      comment: string;
      priority?: "urgent" | "high" | "normal" | "low";
      status?: "new" | "open" | "pending" | "hold" | "solved" | "closed";
      requester_id?: number;
      assignee_id?: number;
      group_id?: number;
      type?: "problem" | "incident" | "question" | "task";
      tags?: string[];
    }): Promise<McpToolResponse> => {
      try {
        const ticketData: any = {
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
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "update_ticket",
    description: "Update an existing ticket",
    schema: {
      id: z.coerce.number().describe("Ticket ID to update"),
      subject: z.string().optional().describe("Updated ticket subject"),
      comment: z.string().optional().describe("New comment to add"),
      priority: z.enum(["urgent", "high", "normal", "low"]).optional().describe("Updated ticket priority"),
      status: z.enum(["new", "open", "pending", "hold", "solved", "closed"]).optional().describe("Updated ticket status"),
      assignee_id: z.coerce.number().optional().describe("User ID of the new assignee"),
      group_id: z.coerce.number().optional().describe("New group ID for the ticket"),
      type: z.enum(["problem", "incident", "question", "task"]).optional().describe("Updated ticket type"),
      tags: z.array(z.string()).optional().describe("Updated tags for the ticket")
    },
    handler: async ({ id, subject, comment, priority, status, assignee_id, group_id, type, tags }: {
      id: number;
      subject?: string;
      comment?: string;
      priority?: "urgent" | "high" | "normal" | "low";
      status?: "new" | "open" | "pending" | "hold" | "solved" | "closed";
      assignee_id?: number;
      group_id?: number;
      type?: "problem" | "incident" | "question" | "task";
      tags?: string[];
    }): Promise<McpToolResponse> => {
      try {
        const ticketData: any = {};
        
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
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "delete_ticket",
    description: "Delete a ticket",
    schema: {
      id: z.coerce.number().describe("Ticket ID to delete")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        await zendeskClient.deleteTicket(id);
        return {
          content: [{ 
            type: "text", 
            text: `Ticket ${id} deleted successfully!`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "get_ticket_comments",
    description: "Get comments for a specific ticket. IMPORTANT: To avoid token limit errors (max 25000 tokens), always use pagination. Start with per_page=1 to test response size. If successful, gradually increase (2, 3, 5) until you find the optimal batch size. For tickets with many comments, iterate through pages. Algorithm: 1) Try per_page=1 first, 2) If response tokens < 5000, try per_page=3, 3) If still under limit, try per_page=5, 4) Use the largest working per_page value to iterate through all pages.",
    schema: {
      id: z.coerce.number().describe("Ticket ID"),
      page: z.coerce.number().optional().describe("Page number for pagination"),
      per_page: z.coerce.number().optional().describe("Number of comments per page (max 100)"),
      sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)")
    },
    handler: async ({ id, page, per_page, sort_order }: {
      id: number;
      page?: number;
      per_page?: number;
      sort_order?: "asc" | "desc";
    }): Promise<McpToolResponse> => {
      try {
        const params = { page, per_page, sort_order };
        const result = await zendeskClient.getTicketComments(id, params);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "add_ticket_comment",
    description: "Add a public or internal comment to an existing ticket",
    schema: {
      id: z.coerce.number().describe("Ticket ID"),
      body: z.string().describe("Comment body"),
      type: z.enum(["public", "internal"]).optional().describe("Comment type: 'public' (visible to end users) or 'internal' (agents only). Default: 'internal'"),
      author_id: z.coerce.number().optional().describe("Author ID (defaults to current user)")
    },
    handler: async ({ id, body, type = "internal", author_id }: {
      id: number;
      body: string;
      type?: "public" | "internal";
      author_id?: number;
    }): Promise<McpToolResponse> => {
      try {
        const commentData: any = { 
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
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "get_ticket_attachments",
    description: "Get all attachments from a ticket's comments",
    schema: {
      id: z.coerce.number().describe("Ticket ID")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        const result = await zendeskClient.getTicketAttachments(id);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "analyze_ticket_images",
    description: "Download and analyze images from a ticket using AI vision",
    schema: {
      id: z.coerce.number().describe("Ticket ID"),
      analysis_prompt: z.string().optional().describe("Custom analysis prompt (default: general image description)")
    },
    handler: async ({ id, analysis_prompt = "Describe this image in detail, including any text, UI elements, error messages, or relevant information visible." }: {
      id: number;
      analysis_prompt?: string;
    }): Promise<McpToolResponse> => {
      try {
        const attachmentsResult = await zendeskClient.getTicketAttachments(id);
        const imageAttachments = attachmentsResult.attachments.filter((att: any) => 
          att.content_type && att.content_type.startsWith('image/')
        );

        if (imageAttachments.length === 0) {
          return {
            content: [{ 
              type: "text", 
              text: "No image attachments found in this ticket."
            }]
          };
        }

        const analyses: any[] = [];
        for (const attachment of imageAttachments) {
          try {
            const downloadResult = await zendeskClient.downloadAttachment(attachment.content_url);
            
            // Convert buffer to base64 for Claude
            const base64Data = Buffer.from(downloadResult.data).toString('base64');
            const dataUrl = `data:${downloadResult.contentType};base64,${base64Data}`;

            analyses.push({
              attachment: {
                id: attachment.id,
                filename: attachment.file_name,
                size: attachment.size,
                content_type: attachment.content_type,
                comment_id: attachment.comment_id
              },
              analysis: analysis_prompt,
              image_data: dataUrl
            });
          } catch (downloadError: any) {
            analyses.push({
              attachment: {
                id: attachment.id,
                filename: attachment.file_name,
                comment_id: attachment.comment_id
              },
              error: `Failed to download: ${downloadError.message}`
            });
          }
        }

        let resultText = `Found ${imageAttachments.length} image(s) in ticket ${id}:\n\n`;
        
        for (const analysis of analyses) {
          if (analysis.error) {
            resultText += `❌ ${analysis.attachment.filename}: ${analysis.error}\n\n`;
          } else if (analysis.image_data) {
            resultText += `📷 ${analysis.attachment.filename} (${analysis.attachment.content_type}, ${analysis.attachment.size} bytes)\n`;
            resultText += `Comment ID: ${analysis.attachment.comment_id}\n`;
            resultText += `Analysis Prompt: ${analysis.analysis}\n\n`;
            
            try {
              // Analyze image with Claude's vision API
              const base64Data = analysis.image_data.split(',')[1];
              const message = await anthropicClient.createMessage({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1000,
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "image",
                        source: {
                          type: "base64",
                          media_type: analysis.attachment.content_type,
                          data: base64Data
                        }
                      },
                      {
                        type: "text",
                        text: analysis.analysis
                      }
                    ]
                  }
                ]
              });
              
              const visionAnalysis = ((message as any).content[0] as any).text;
              resultText += `🔍 AI Analysis:\n${visionAnalysis}\n\n`;
              
            } catch (visionError: any) {
              resultText += `❌ Vision analysis failed: ${visionError.message}\n`;
              resultText += `Image Data: Available (${Math.round(analysis.image_data.length / 1024)}KB base64)\n\n`;
            }
          }
        }

        return {
          content: [{ 
            type: "text", 
            text: resultText
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  }
];