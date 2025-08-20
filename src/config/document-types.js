/**
 * Configuration for supported document types
 * Defines MIME types, size limits, and processing strategies
 */

// Size constants
const MB = 1024 * 1024;

export const SUPPORTED_DOCUMENT_TYPES = {
  pdf: {
    mimeTypes: ['application/pdf'],
    extensions: ['pdf'],
    maxSize: 32 * MB, // Claude API limit for PDFs
    maxPages: 100, // Claude API limit for PDF pages
    processor: 'native-pdf',
    apiSupport: 'document', // Uses document block
    description: 'PDF documents with text and images'
  },
  
  image: {
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    maxSize: 20 * MB, // Claude API limit for images
    processor: 'native-image',
    apiSupport: 'image', // Uses image block
    description: 'Image files for visual analysis'
  },
  
  text: {
    mimeTypes: ['text/plain', 'text/markdown', 'text/rtf'],
    extensions: ['txt', 'md', 'rtf', 'log'],
    maxSize: 10 * MB,
    processor: 'text-direct',
    apiSupport: 'text', // Direct text input
    description: 'Plain text documents'
  },
  
  data: {
    mimeTypes: ['text/csv', 'application/json', 'text/xml', 'application/xml'],
    extensions: ['csv', 'json', 'xml'],
    maxSize: 10 * MB,
    processor: 'text-structured',
    apiSupport: 'text', // Convert to text
    description: 'Structured data files'
  },
  
  office: {
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.ms-excel'
    ],
    extensions: ['docx', 'xlsx', 'doc', 'xls'],
    maxSize: 25 * MB,
    processor: 'office-extractor',
    apiSupport: 'requires-extraction', // Needs text extraction
    description: 'Microsoft Office documents'
  },
  
  email: {
    mimeTypes: ['message/rfc822', 'application/vnd.ms-outlook'],
    extensions: ['eml', 'msg'],
    maxSize: 10 * MB,
    processor: 'email-parser',
    apiSupport: 'requires-extraction',
    description: 'Email message files'
  }
};

// Security: Explicitly blocked file types
export const BLOCKED_TYPES = {
  executables: {
    mimeTypes: ['application/x-executable', 'application/x-msdownload'],
    extensions: ['exe', 'dll', 'bat', 'cmd', 'sh', 'app'],
    reason: 'Executable files are blocked for security'
  },
  
  scripts: {
    mimeTypes: ['application/x-javascript', 'application/x-python'],
    extensions: ['js', 'py', 'rb', 'ps1', 'vbs'],
    reason: 'Script files are blocked for security'
  },
  
  macros: {
    mimeTypes: [
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.ms-word.document.macroEnabled.12'
    ],
    extensions: ['xlsm', 'docm'],
    reason: 'Macro-enabled documents are blocked for security'
  },
  
  archives: {
    mimeTypes: ['application/zip', 'application/x-rar', 'application/x-tar'],
    extensions: ['zip', 'rar', 'tar', 'gz', '7z'],
    reason: 'Archive files must be extracted before analysis'
  }
};

/**
 * Check if a file type is explicitly blocked
 * @param {string} mimeType - MIME type to check
 * @param {string} fileName - File name to check extension
 * @returns {Object|null} - Block reason or null if allowed
 */
export function isBlocked(mimeType, fileName) {
  const extension = fileName?.toLowerCase().split('.').pop();
  
  for (const [category, config] of Object.entries(BLOCKED_TYPES)) {
    // Check MIME type
    if (mimeType && config.mimeTypes.some(type => mimeType.includes(type))) {
      return {
        blocked: true,
        category,
        reason: config.reason
      };
    }
    
    // Check extension
    if (extension && config.extensions.includes(extension)) {
      return {
        blocked: true,
        category,
        reason: config.reason
      };
    }
  }
  
  return null;
}

/**
 * Get processing recommendations for unsupported types
 * @param {string} mimeType - MIME type
 * @param {string} extension - File extension
 * @returns {string} - Recommendation message
 */
export function getRecommendation(mimeType, extension) {
  // Common unsupported types with specific recommendations
  const recommendations = {
    'application/vnd.apple.pages': 'Export Pages document to PDF or DOCX',
    'application/vnd.google-apps.document': 'Export Google Doc to PDF or DOCX',
    'application/x-iwork-keynote': 'Export Keynote to PDF',
    'video/': 'Extract audio transcript or key frames as images',
    'audio/': 'Provide transcript or convert to text',
    'application/photoshop': 'Export as PNG or JPEG',
    'application/illustrator': 'Export as PDF or PNG'
  };
  
  for (const [type, recommendation] of Object.entries(recommendations)) {
    if (mimeType?.includes(type)) {
      return recommendation;
    }
  }
  
  // Generic recommendation
  return 'Convert to PDF, TXT, DOCX, or another supported format';
}

/**
 * Validate document processing request
 * @param {Array} attachments - List of attachments to process
 * @returns {Object} - Validation result with details
 */
export function validateBatch(attachments) {
  const results = {
    valid: [],
    blocked: [],
    unsupported: [],
    tooLarge: [],
    totalSize: 0
  };
  
  for (const attachment of attachments) {
    const blockCheck = isBlocked(attachment.content_type, attachment.file_name);
    
    if (blockCheck) {
      results.blocked.push({
        ...attachment,
        reason: blockCheck.reason
      });
      continue;
    }
    
    // Check if supported
    let supported = false;
    let maxSize = 0;
    
    for (const config of Object.values(SUPPORTED_DOCUMENT_TYPES)) {
      if (config.mimeTypes.some(type => attachment.content_type?.includes(type))) {
        supported = true;
        maxSize = config.maxSize;
        break;
      }
    }
    
    if (!supported) {
      results.unsupported.push({
        ...attachment,
        recommendation: getRecommendation(attachment.content_type, attachment.file_name)
      });
      continue;
    }
    
    // Check size
    if (attachment.size > maxSize) {
      results.tooLarge.push({
        ...attachment,
        maxSize,
        humanSize: `${(attachment.size / MB).toFixed(2)}MB`,
        humanMaxSize: `${(maxSize / MB).toFixed(2)}MB`
      });
      continue;
    }
    
    results.valid.push(attachment);
    results.totalSize += attachment.size;
  }
  
  return results;
}