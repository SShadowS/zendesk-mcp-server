import dotenv from 'dotenv';
dotenv.config();

import { z } from 'zod';
import axios from 'axios';
import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';
import { DocumentHandler } from '../utils/document-handler.js';
import { validateBatch, isBlocked } from '../config/document-types.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 60000
});

/**
 * Fetch and filter attachments from a ticket
 * @param {Object} zendeskClient - Zendesk client instance
 * @param {number} ticketId - Ticket ID
 * @param {Object} options - Filter options
 * @returns {Object} { attachments, validation, documentsToProcess }
 */
async function fetchAndFilterAttachments(zendeskClient, ticketId, options) {
  const { includeImages, documentTypes, quickMode } = options;

  const attachmentsResult = await zendeskClient.getTicketAttachments(ticketId, {
    includeInlineImages: includeImages
  });

  if (!attachmentsResult.attachments || attachmentsResult.attachments.length === 0) {
    return { attachments: [], validation: null, documentsToProcess: [] };
  }

  const validation = validateBatch(attachmentsResult.attachments);
  let documentsToProcess = validation.valid;

  // Filter by document types if specified
  if (documentTypes && documentTypes.length > 0) {
    documentsToProcess = documentsToProcess.filter(att => {
      const typeInfo = DocumentHandler.detectType(att);
      return documentTypes.includes(typeInfo.category);
    });
  }

  // Exclude images if not requested
  if (!includeImages) {
    documentsToProcess = documentsToProcess.filter(att => {
      const typeInfo = DocumentHandler.detectType(att);
      return typeInfo.category !== 'image';
    });
  }

  // Apply quick mode limit
  if (quickMode && documentsToProcess.length > 3) {
    documentsToProcess = documentsToProcess.slice(0, 3);
  }

  return { attachments: attachmentsResult.attachments, validation, documentsToProcess };
}

/**
 * Build message when no processable documents are found
 * @param {number} ticketId - Ticket ID
 * @param {Object} validation - Validation result from validateBatch
 * @returns {string} Formatted message
 */
function buildNoDocumentsMessage(ticketId, validation) {
  let message = `No processable documents found in ticket ${ticketId}.\n\n`;

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

  return message;
}

/**
 * Download an attachment (handles inline vs regular attachments)
 * @param {Object} zendeskClient - Zendesk client instance
 * @param {Object} attachment - Attachment object
 * @returns {Object} { data, contentType, size }
 */
async function downloadAttachmentData(zendeskClient, attachment) {
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
 * Analyze a single document using Claude
 * @param {Object} attachment - Attachment object
 * @param {Buffer} downloadData - Downloaded file data
 * @param {string} analysisPrompt - Prompt for analysis
 * @param {number} maxTokens - Max tokens for response
 * @returns {Object} Analysis result
 */
async function analyzeDocument(attachment, downloadData, analysisPrompt, maxTokens) {
  // Route to appropriate processor
  const routingResult = await DocumentHandler.route(attachment, downloadData);

  if (!routingResult.success) {
    return {
      attachment: attachment.file_name,
      error: routingResult.error,
      suggestion: routingResult.suggestion
    };
  }

  // Prepare for API based on document type
  const apiContent = await DocumentHandler.prepareForAPI(
    downloadData,
    attachment.content_type,
    routingResult.category,
    attachment.file_name
  );

  // Handle error responses
  if (apiContent.type === 'error') {
    const errorEntry = {
      attachment: attachment.file_name,
      category: routingResult.category,
      error: apiContent.error
    };

    if (apiContent.code === 'RATE_LIMIT') {
      errorEntry.retryInfo = `Rate limited. Please wait ${Math.ceil(apiContent.retryAfter / 60)} minutes before retrying.`;
    }

    return errorEntry;
  }

  // Handle documents requiring additional processing
  if (apiContent.type === 'requires_processing') {
    return {
      attachment: attachment.file_name,
      category: routingResult.category,
      status: 'requires_extraction',
      message: `${routingResult.category.toUpperCase()} files require additional processing`
    };
  }

  // Build message for Claude
  const messages = [{ role: "user", content: [] }];

  if (apiContent.type === 'document' || apiContent.type === 'image') {
    messages[0].content.push(apiContent);
    messages[0].content.push({ type: "text", text: analysisPrompt });
  } else if (apiContent.type === 'text') {
    messages[0].content.push({
      type: "text",
      text: `${analysisPrompt}\n\nDocument content:\n\n${apiContent.text}`
    });
  }

  // Call Claude API
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: Math.min(maxTokens, 4096),
    messages
  });

  const result = {
    attachment: attachment.file_name,
    category: routingResult.category,
    size: DocumentHandler.formatBytes(attachment.size),
    analysis: response.content[0].text
  };

  if (apiContent.metadata && apiContent.metadata.truncated) {
    result.warning = apiContent.metadata.warnings;
  }

  return result;
}

/**
 * Format analysis results into readable text
 * @param {Array} analyses - Array of analysis results
 * @param {Object} validation - Validation result from validateBatch
 * @param {number} ticketId - Ticket ID
 * @param {boolean} quickMode - Whether quick mode was used
 * @param {number} documentCount - Number of documents processed
 * @returns {string} Formatted result text
 */
function formatAnalysisResults(analyses, validation, ticketId, quickMode, documentCount) {
  let resultText = quickMode
    ? `Quick analysis of first ${documentCount} document(s) from ticket ${ticketId}:\n\n`
    : `Analyzing ${documentCount} document(s) from ticket ${ticketId}:\n\n`;

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

  // Add summary of skipped files
  const skippedCount = validation.blocked.length + validation.unsupported.length + validation.tooLarge.length;
  if (skippedCount > 0) {
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

  return resultText;
}

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
        const zendeskClient = getZendeskClient();

        // Fetch and filter attachments
        const { attachments, validation, documentsToProcess } = await fetchAndFilterAttachments(
          zendeskClient,
          id,
          { includeImages: include_images, documentTypes: document_types, quickMode: quick_mode }
        );

        // Handle no attachments
        if (attachments.length === 0) {
          return {
            content: [{ type: "text", text: `No attachments found in ticket ${id}.` }]
          };
        }

        // Handle no processable documents
        if (documentsToProcess.length === 0) {
          return {
            content: [{ type: "text", text: buildNoDocumentsMessage(id, validation) }]
          };
        }

        // Process each document
        const analyses = [];
        for (const attachment of documentsToProcess) {
          try {
            const downloadResult = await downloadAttachmentData(zendeskClient, attachment);
            const result = await analyzeDocument(attachment, downloadResult.data, analysis_prompt, max_tokens);
            analyses.push(result);
          } catch (error) {
            analyses.push({ attachment: attachment.file_name, error: error.message });
          }
        }

        // Format and return results
        const resultText = formatAnalysisResults(analyses, validation, id, quick_mode, documentsToProcess.length);
        return {
          content: [{ type: "text", text: resultText }]
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
        const attachmentsResult = await zendeskClient.getTicketAttachments(id, { includeInlineImages: true });
        
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