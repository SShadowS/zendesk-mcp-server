import { SUPPORTED_DOCUMENT_TYPES } from '../config/document-types.js';
import { ConverterClient } from './converter-client.js';

/**
 * Document handler for processing various file types from Zendesk attachments
 */
export class DocumentHandler {
  /**
   * Detect MIME type and validate if file is supported
   * @param {Object} attachment - Zendesk attachment object
   * @returns {Object} - { supported: boolean, type: string, processor: string }
   */
  static detectType(attachment) {
    const mimeType = attachment.content_type?.toLowerCase() || '';
    const fileName = attachment.file_name?.toLowerCase() || '';
    const extension = fileName.split('.').pop();
    
    // console.error(`[DEBUG] detectType - file: ${fileName}, mimeType: ${mimeType}, extension: ${extension}`);
    
    // Check MIME type first
    for (const [category, config] of Object.entries(SUPPORTED_DOCUMENT_TYPES)) {
      if (config.mimeTypes.some(type => mimeType.includes(type))) {
        return {
          supported: true,
          type: mimeType,
          category,
          processor: config.processor,
          maxSize: config.maxSize,
          apiSupport: config.apiSupport
        };
      }
    }
    
    // Fallback to extension checking
    for (const [category, config] of Object.entries(SUPPORTED_DOCUMENT_TYPES)) {
      if (config.extensions.includes(extension)) {
        return {
          supported: true,
          type: `inferred/${extension}`,
          category,
          processor: config.processor,
          maxSize: config.maxSize,
          apiSupport: config.apiSupport
        };
      }
    }
    
    return {
      supported: false,
      type: mimeType || 'unknown',
      category: 'unsupported',
      processor: null
    };
  }
  
  /**
   * Validate file size against limits
   * @param {Object} attachment - Zendesk attachment object
   * @param {number} maxSize - Maximum size in bytes
   * @returns {Object} - { valid: boolean, size: number, maxSize: number }
   */
  static validateSize(attachment, maxSize) {
    const size = attachment.size || 0;
    return {
      valid: size <= maxSize,
      size,
      maxSize,
      humanSize: this.formatBytes(size),
      humanMaxSize: this.formatBytes(maxSize)
    };
  }
  
  /**
   * Route attachment to appropriate processor
   * @param {Object} attachment - Zendesk attachment object
   * @param {Buffer} data - Downloaded file data
   * @returns {Object} - Processing instructions
   */
  static async route(attachment, data) {
    const typeInfo = this.detectType(attachment);
    
    if (!typeInfo.supported) {
      return {
        success: false,
        error: `Unsupported file type: ${typeInfo.type}`,
        suggestion: 'Convert to PDF, TXT, or another supported format'
      };
    }
    
    const sizeCheck = this.validateSize(attachment, typeInfo.maxSize);
    if (!sizeCheck.valid) {
      return {
        success: false,
        error: `File too large: ${sizeCheck.humanSize} (max: ${sizeCheck.humanMaxSize})`,
        suggestion: typeInfo.category === 'pdf' ? 'Split PDF or extract text' : 'Reduce file size'
      };
    }
    
    return {
      success: true,
      processor: typeInfo.processor,
      category: typeInfo.category,
      apiSupport: typeInfo.apiSupport,
      data,
      metadata: {
        fileName: attachment.file_name,
        size: attachment.size,
        mimeType: attachment.content_type,
        commentId: attachment.comment_id
      }
    };
  }
  
  /**
   * Format bytes to human readable
   * @param {number} bytes - Size in bytes
   * @returns {string} - Formatted size
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Process Office documents using external converter API
   * @param {Buffer} data - File data
   * @param {string} fileName - File name
   * @returns {Promise<Object>} - Processed content
   */
  static async processOfficeDocument(data, fileName) {
    const converter = new ConverterClient();
    const result = await converter.convertToPDF(data, fileName);
    
    if (result.success) {
      // Return PDF for Claude to analyze (including images)
      return {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: result.data.toString('base64')
        },
        metadata: {
          originalFormat: fileName.split('.').pop().toLowerCase(),
          converted: true,
          size: result.size,
          info: 'Converted to PDF for comprehensive analysis including embedded images'
        }
      };
    }
    
    // Handle errors with appropriate messaging
    const errorResponse = {
      type: 'error',
      error: result.error
    };
    
    // Add retry information if rate limited
    if (result.retryAfter) {
      errorResponse.retryAfter = result.retryAfter;
      errorResponse.code = result.code;
    }
    
    return errorResponse;
  }
  
  /**
   * Prepare document for Claude API
   * @param {Buffer} data - File data
   * @param {string} mimeType - MIME type
   * @param {string} category - Document category
   * @param {string} fileName - File name for Office documents
   * @returns {Promise<Object>} - API-ready document block
   */
  static async prepareForAPI(data, mimeType, category, fileName = null) {
    // console.error(`[DEBUG] prepareForAPI called - category: ${category}, mimeType: ${mimeType}, fileName: ${fileName}`);
    
    if (category === 'pdf') {
      // PDF can be sent directly as base64 with document block
      return {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: data.toString('base64')
        }
      };
    } else if (category === 'image') {
      // Images use image block
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: data.toString('base64')
        }
      };
    } else if (category === 'text' || category === 'data') {
      // Text files are sent as plain text
      return {
        type: 'text',
        text: data.toString('utf-8')
      };
    } else if (category === 'office') {
      // Office documents need extraction
      if (!fileName) {
        return {
          type: 'error',
          error: 'File name required for Office document processing'
        };
      }
      return await this.processOfficeDocument(data, fileName);
    }
    
    // For other types, return instructions for processing
    return {
      type: 'requires_processing',
      category,
      mimeType
    };
  }
}