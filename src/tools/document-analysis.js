import dotenv from 'dotenv';
dotenv.config();

import { z } from 'zod';
import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';
import { DocumentHandler } from '../utils/document-handler.js';
import { validateBatch, isBlocked } from '../config/document-types.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 60000 // 60 second timeout for API calls
});

export const documentAnalysisTools = [
  {
    name: "analyze_ticket_documents",
    description: "Comprehensively analyze all document attachments from a ticket (PDF, DOCX, TXT, CSV, etc). v2.1 with truncation. Note: This may take 30-60 seconds for multiple documents.",
    schema: z.object({
      id: z.number().describe("Ticket ID"),
      analysis_prompt: z.string().optional().describe("Custom prompt for document analysis"),
      max_tokens: z.number().optional().describe("Maximum tokens for response (default: 4096)"),
      include_images: z.boolean().optional().describe("Also analyze image attachments (default: true)"),
      document_types: z.array(z.string()).optional().describe("Filter specific document types to analyze"),
      quick_mode: z.boolean().optional().describe("Quick mode: analyze only first 3 documents (default: false)")
    }),
    handler: async ({ 
      id, 
      analysis_prompt = "Provide a comprehensive analysis of this document. Extract key information, summarize main points, identify any issues or action items, and highlight important details relevant for customer support.",
      max_tokens = 4096,
      include_images = true,
      document_types = null,
      quick_mode = false
    }) => {
      try {
        // Get all attachments from the ticket
        const attachmentsResult = await zendeskClient.getTicketAttachments(id);
        
        if (!attachmentsResult.attachments || attachmentsResult.attachments.length === 0) {
          return {
            content: [{ 
              type: "text", 
              text: `No attachments found in ticket ${id}.`
            }]
          };
        }
        
        // Validate and categorize attachments
        const validation = validateBatch(attachmentsResult.attachments);
        
        // Filter by document types if specified
        let documentsToProcess = validation.valid;
        if (document_types && document_types.length > 0) {
          documentsToProcess = documentsToProcess.filter(att => {
            const typeInfo = DocumentHandler.detectType(att);
            return document_types.includes(typeInfo.category);
          });
        }
        
        // Exclude images if not requested
        if (!include_images) {
          documentsToProcess = documentsToProcess.filter(att => {
            const typeInfo = DocumentHandler.detectType(att);
            return typeInfo.category !== 'image';
          });
        }
        
        // Apply quick mode limit if enabled
        if (quick_mode && documentsToProcess.length > 3) {
          documentsToProcess = documentsToProcess.slice(0, 3);
        }
        
        if (documentsToProcess.length === 0) {
          let message = `No processable documents found in ticket ${id}.\n\n`;
          if (validation.blocked.length > 0) {
            message += `Blocked files (${validation.blocked.length}):\n`;
            validation.blocked.forEach(f => {
              message += `  - ${f.file_name}: ${f.reason}\n`;
            });
          }
          if (validation.unsupported.length > 0) {
            message += `\nUnsupported files (${validation.unsupported.length}):\n`;
            validation.unsupported.forEach(f => {
              message += `  - ${f.file_name}: ${f.recommendation}\n`;
            });
          }
          if (validation.tooLarge.length > 0) {
            message += `\nFiles too large (${validation.tooLarge.length}):\n`;
            validation.tooLarge.forEach(f => {
              message += `  - ${f.file_name}: ${f.humanSize} (max: ${f.humanMaxSize})\n`;
            });
          }
          
          return {
            content: [{ 
              type: "text", 
              text: message
            }]
          };
        }
        
        // Process each document
        const analyses = [];
        let resultText = quick_mode 
          ? `Quick analysis of first ${documentsToProcess.length} document(s) from ticket ${id}:\n\n`
          : `Analyzing ${documentsToProcess.length} document(s) from ticket ${id}:\n\n`;
        
        for (const attachment of documentsToProcess) {
          try {
            // Download the attachment
            const downloadResult = await zendeskClient.downloadAttachment(attachment.content_url);
            
            // Route to appropriate processor
            const routingResult = await DocumentHandler.route(attachment, downloadResult.data);
            
            if (!routingResult.success) {
              analyses.push({
                attachment: attachment.file_name,
                error: routingResult.error,
                suggestion: routingResult.suggestion
              });
              continue;
            }
            
            // Prepare for API based on document type
            const apiContent = await DocumentHandler.prepareForAPI(
              downloadResult.data,
              attachment.content_type,
              routingResult.category,
              attachment.file_name
            );
            
            // Handle different content types
            if (apiContent.type === 'error') {
              const errorEntry = {
                attachment: attachment.file_name,
                category: routingResult.category,
                error: apiContent.error
              };
              
              // Add retry information for rate limiting
              if (apiContent.code === 'RATE_LIMIT') {
                errorEntry.retryInfo = `Rate limited. Please wait ${Math.ceil(apiContent.retryAfter / 60)} minutes before retrying.`;
              }
              
              analyses.push(errorEntry);
              continue;
            } else if (apiContent.type === 'requires_processing') {
              analyses.push({
                attachment: attachment.file_name,
                category: routingResult.category,
                status: 'requires_extraction',
                message: `${routingResult.category.toUpperCase()} files require additional processing`
              });
              continue;
            }
            
            // Create the message for Claude
            const messages = [{
              role: "user",
              content: []
            }];
            
            // Add document/image/text to the message
            if (apiContent.type === 'document' || apiContent.type === 'image') {
              messages[0].content.push(apiContent);
              messages[0].content.push({
                type: "text",
                text: analysis_prompt
              });
            } else if (apiContent.type === 'text') {
              // Text content from non-Office documents
              // No need for aggressive truncation since Office docs are now PDFs
              messages[0].content.push({
                type: "text",
                text: `${analysis_prompt}\n\nDocument content:\n\n${apiContent.text}`
              });
            }
            
            // PDFs from converter are already optimized, less likely to hit token limits
            
            // Call Claude API
            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: Math.min(max_tokens, 4096),
              messages
            });
            
            const analysisResult = {
              attachment: attachment.file_name,
              category: routingResult.category,
              size: DocumentHandler.formatBytes(attachment.size),
              analysis: response.content[0].text
            };
            
            // Add truncation warning if applicable
            if (apiContent.metadata && apiContent.metadata.truncated) {
              analysisResult.warning = apiContent.metadata.warnings;
            }
            
            analyses.push(analysisResult);
            
          } catch (error) {
            analyses.push({
              attachment: attachment.file_name,
              error: error.message
            });
          }
        }
        
        // Format results
        for (const analysis of analyses) {
          resultText += `📄 **${analysis.attachment}**\n`;
          if (analysis.category) {
            resultText += `   Type: ${analysis.category}\n`;
          }
          if (analysis.size) {
            resultText += `   Size: ${analysis.size}\n`;
          }
          
          if (analysis.warning) {
            resultText += `   ⚠️ Warning: ${analysis.warning}\n`;
          }
          
          if (analysis.error) {
            resultText += `   ❌ Error: ${analysis.error}\n`;
            if (analysis.retryInfo) {
              resultText += `   ⏱️ ${analysis.retryInfo}\n`;
            }
            if (analysis.suggestion) {
              resultText += `   💡 Suggestion: ${analysis.suggestion}\n`;
            }
          } else if (analysis.status === 'requires_extraction') {
            resultText += `   ⚠️ Status: ${analysis.message}\n`;
          } else if (analysis.analysis) {
            resultText += `   \n   Analysis:\n   ${analysis.analysis}\n`;
          }
          resultText += '\n---\n\n';
        }
        
        // Add summary of skipped files if any
        if (validation.blocked.length + validation.unsupported.length + validation.tooLarge.length > 0) {
          resultText += '\n**Files Not Processed:**\n';
          if (validation.blocked.length > 0) {
            resultText += `- ${validation.blocked.length} blocked for security\n`;
          }
          if (validation.unsupported.length > 0) {
            resultText += `- ${validation.unsupported.length} unsupported format\n`;
          }
          if (validation.tooLarge.length > 0) {
            resultText += `- ${validation.tooLarge.length} too large\n`;
          }
        }
        
        return {
          content: [{ 
            type: "text", 
            text: resultText
          }]
        };
        
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  },
  
  {
    name: "get_document_summary",
    description: "Get a quick summary of all documents attached to a ticket",
    schema: z.object({
      id: z.number().describe("Ticket ID")
    }),
    handler: async ({ id }) => {
      try {
            const zendeskClient = getZendeskClient();
        const attachmentsResult = await zendeskClient.getTicketAttachments(id);
        
        if (!attachmentsResult.attachments || attachmentsResult.attachments.length === 0) {
          return {
            content: [{ 
              type: "text", 
              text: `No attachments found in ticket ${id}.`
            }]
          };
        }
        
        const validation = validateBatch(attachmentsResult.attachments);
        
        let summary = `Ticket ${id} Document Summary:\n\n`;
        summary += `Total attachments: ${attachmentsResult.attachments.length}\n`;
        summary += `Total size: ${DocumentHandler.formatBytes(validation.totalSize)}\n\n`;
        
        // Group by category
        const categories = {};
        for (const att of validation.valid) {
          const typeInfo = DocumentHandler.detectType(att);
          if (!categories[typeInfo.category]) {
            categories[typeInfo.category] = [];
          }
          categories[typeInfo.category].push({
            name: att.file_name,
            size: DocumentHandler.formatBytes(att.size)
          });
        }
        
        summary += '**Processable Documents:**\n';
        for (const [category, files] of Object.entries(categories)) {
          summary += `\n${category.toUpperCase()} (${files.length}):\n`;
          files.forEach(f => {
            summary += `  - ${f.name} (${f.size})\n`;
          });
        }
        
        if (validation.blocked.length > 0) {
          summary += `\n**Blocked Files (${validation.blocked.length}):**\n`;
          validation.blocked.forEach(f => {
            summary += `  - ${f.file_name}: ${f.reason}\n`;
          });
        }
        
        if (validation.unsupported.length > 0) {
          summary += `\n**Unsupported Files (${validation.unsupported.length}):**\n`;
          validation.unsupported.forEach(f => {
            summary += `  - ${f.file_name}\n    Recommendation: ${f.recommendation}\n`;
          });
        }
        
        if (validation.tooLarge.length > 0) {
          summary += `\n**Files Too Large (${validation.tooLarge.length}):**\n`;
          validation.tooLarge.forEach(f => {
            summary += `  - ${f.file_name}: ${f.humanSize} (max: ${f.humanMaxSize})\n`;
          });
        }
        
        return {
          content: [{ 
            type: "text", 
            text: summary
          }]
        };
        
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  }
];