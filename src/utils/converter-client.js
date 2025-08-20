import axios from 'axios';
import FormData from 'form-data';

/**
 * Client for the external document converter API
 * Converts Office documents to PDF for better Claude analysis
 */
export class ConverterClient {
  constructor() {
    this.apiUrl = process.env.CONVERTER_API_URL || 'https://converter.sshadows.dk/forms/libreoffice/convert';
    this.apiKey = process.env.CONVERTER_API_KEY || '80871ed2aec470637b7fc0b44d03946b36512268905ce460a7dc35d17b416168';
    this.timeout = 30000; // 30 seconds
  }

  /**
   * Convert an Office document to PDF
   * @param {Buffer} buffer - File buffer
   * @param {string} fileName - Original file name
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} - Conversion result
   */
  async convertToPDF(buffer, fileName, options = {}) {
    const formData = new FormData();
    formData.append('files', buffer, fileName);
    
    // Add optional PDF/A format
    if (options.pdfa) {
      formData.append('pdfa', options.pdfa);
    }
    
    // Add landscape option if specified
    if (options.landscape !== undefined) {
      formData.append('landscape', options.landscape.toString());
    }
    
    try {
      const response = await axios.post(this.apiUrl, formData, {
        headers: {
          'X-API-Key': this.apiKey,
          ...formData.getHeaders()
        },
        timeout: this.timeout,
        responseType: 'arraybuffer',
        maxContentLength: 50 * 1024 * 1024, // 50MB max response
        maxBodyLength: 50 * 1024 * 1024 // 50MB max upload
      });
      
      return {
        success: true,
        data: Buffer.from(response.data),
        format: 'pdf',
        size: response.data.byteLength
      };
    } catch (error) {
      // Handle rate limiting
      if (error.response?.status === 429) {
        return {
          success: false,
          error: 'Rate limit exceeded (20 conversions per 5 minutes). Please wait before trying again.',
          retryAfter: 300, // 5 minutes in seconds
          code: 'RATE_LIMIT'
        };
      }
      
      // Handle timeout
      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          error: 'Conversion timeout. The file may be too large or complex.',
          code: 'TIMEOUT'
        };
      }
      
      // Handle API key issues
      if (error.response?.status === 401) {
        return {
          success: false,
          error: 'Invalid API key for converter service.',
          code: 'AUTH_FAILED'
        };
      }
      
      // Handle server errors
      if (error.response?.status >= 500) {
        return {
          success: false,
          error: 'Converter service is temporarily unavailable. Please try again later.',
          code: 'SERVER_ERROR'
        };
      }
      
      // Handle network errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: 'Cannot connect to converter service. Please check your internet connection.',
          code: 'NETWORK_ERROR'
        };
      }
      
      // Generic error
      return {
        success: false,
        error: `Conversion failed: ${error.message}`,
        code: 'UNKNOWN_ERROR'
      };
    }
  }
  
  /**
   * Check if the converter service is available
   * @returns {Promise<boolean>} - True if service is available
   */
  async healthCheck() {
    try {
      // Try a HEAD request to check if the service is up
      const response = await axios.head(this.apiUrl.replace('/forms/libreoffice/convert', '/health'), {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}