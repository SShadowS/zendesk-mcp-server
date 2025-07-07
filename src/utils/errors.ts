import { AxiosError } from 'axios';

/**
 * Custom error classes for Zendesk API errors
 */

export class ZendeskError extends Error {
  public readonly statusCode: number | null;
  public readonly response: any;
  public readonly isRetryable: boolean;
  public readonly timestamp: string;

  constructor(
    message: string, 
    statusCode: number | null = null, 
    response: any = null, 
    isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'ZendeskError';
    this.statusCode = statusCode;
    this.response = response;
    this.isRetryable = isRetryable;
    this.timestamp = new Date().toISOString();
  }

  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      isRetryable: this.isRetryable,
      timestamp: this.timestamp,
      response: this.response
    };
  }
}

export class ZendeskRateLimitError extends ZendeskError {
  public readonly retryAfter: number;

  constructor(
    message: string, 
    statusCode: number, 
    response: any, 
    retryAfter: number
  ) {
    super(message, statusCode, response, true);
    this.name = 'ZendeskRateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ZendeskAuthError extends ZendeskError {
  constructor(message: string, statusCode: number, response: any) {
    super(message, statusCode, response, false);
    this.name = 'ZendeskAuthError';
  }
}

export class ZendeskNotFoundError extends ZendeskError {
  constructor(message: string, statusCode: number, response: any) {
    super(message, statusCode, response, false);
    this.name = 'ZendeskNotFoundError';
  }
}

export class ZendeskValidationError extends ZendeskError {
  public readonly validationDetails: Record<string, any> | null;

  constructor(
    message: string, 
    statusCode: number, 
    response: any, 
    validationDetails: Record<string, any> | null
  ) {
    super(message, statusCode, response, false);
    this.name = 'ZendeskValidationError';
    this.validationDetails = validationDetails;
  }
}

export class ZendeskServerError extends ZendeskError {
  constructor(message: string, statusCode: number, response: any) {
    super(message, statusCode, response, true);
    this.name = 'ZendeskServerError';
  }
}

export class ZendeskNetworkError extends ZendeskError {
  public readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message, null, null, true);
    this.name = 'ZendeskNetworkError';
    this.code = code;
  }
}

/**
 * Analyze an axios error and return the appropriate custom error
 */
export function classifyError(error: AxiosError): ZendeskError {
  // Network errors (no response)
  if (!error.response) {
    const networkMessage = error.code === 'ECONNREFUSED' 
      ? 'Unable to connect to Zendesk. Please check your internet connection and subdomain.'
      : error.code === 'ETIMEDOUT'
      ? 'Request to Zendesk timed out. Please try again.'
      : `Network error: ${error.message}`;
    
    return new ZendeskNetworkError(networkMessage, error.code);
  }

  const { status, data, headers } = error.response;
  const errorMessage = extractErrorMessage(data);

  // Rate limit error (429)
  if (status === 429) {
    const retryAfter = extractRetryAfter(headers);
    return new ZendeskRateLimitError(
      `Rate limit exceeded. ${errorMessage || 'Please wait before retrying.'}`,
      status,
      data,
      retryAfter
    );
  }

  // Authentication errors (401, 403)
  if (status === 401 || status === 403) {
    const authMessage = status === 401
      ? 'Authentication failed. Please check your API token and email.'
      : 'Access forbidden. You may not have permission for this operation.';
    return new ZendeskAuthError(
      `${authMessage} ${errorMessage || ''}`.trim(),
      status,
      data
    );
  }

  // Not found error (404)
  if (status === 404) {
    return new ZendeskNotFoundError(
      errorMessage || 'The requested resource was not found.',
      status,
      data
    );
  }

  // Validation error (422)
  if (status === 422) {
    const validationDetails = extractValidationDetails(data);
    return new ZendeskValidationError(
      errorMessage || 'Validation failed. Please check your input.',
      status,
      data,
      validationDetails
    );
  }

  // Server errors (500+)
  if (status >= 500) {
    return new ZendeskServerError(
      errorMessage || `Zendesk server error (${status}). Please try again later.`,
      status,
      data
    );
  }

  // Default error for other status codes
  return new ZendeskError(
    errorMessage || `Zendesk API error (${status})`,
    status,
    data,
    false
  );
}

/**
 * Extract error message from Zendesk API response
 */
function extractErrorMessage(data: any): string | null {
  if (!data) return null;
  
  // Common Zendesk error response formats
  if (typeof data === 'string') return data;
  if (data.error) return data.error;
  if (data.message) return data.message;
  if (data.description) return data.description;
  if (data.errors && Array.isArray(data.errors)) {
    return data.errors.map((e: any) => e.message || e).join(', ');
  }
  
  return null;
}

/**
 * Extract retry-after value from headers
 */
function extractRetryAfter(headers: Record<string, any>): number {
  if (!headers) return 60; // Default to 60 seconds
  
  const retryAfter = headers['retry-after'] || headers['Retry-After'];
  if (retryAfter) {
    // If it's a number, it's seconds
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) return seconds;
    
    // If it's a date, calculate seconds until then
    const retryDate = new Date(retryAfter);
    if (!isNaN(retryDate.getTime())) {
      const secondsUntil = Math.ceil((retryDate.getTime() - Date.now()) / 1000);
      return Math.max(secondsUntil, 1);
    }
  }
  
  // Check rate limit headers
  const limitRemaining = headers['x-rate-limit-remaining'] || headers['X-Rate-Limit-Remaining'];
  if (limitRemaining === '0') {
    return 60; // Default wait time when rate limited
  }
  
  return 60;
}

/**
 * Extract validation details from error response
 */
function extractValidationDetails(data: any): Record<string, any> | null {
  if (!data) return null;
  
  // Zendesk validation error format
  if (data.details && typeof data.details === 'object') {
    return data.details;
  }
  
  if (data.errors && typeof data.errors === 'object') {
    return data.errors;
  }
  
  return null;
}

/**
 * Create a user-friendly error message for MCP responses
 */
export function createErrorResponse(error: any): { content: Array<{ type: 'text'; text: string }> } {
  // Handle non-ZendeskError instances
  if (!(error instanceof ZendeskError)) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error?.message || error?.toString() || 'An unexpected error occurred'}`
      }]
    };
  }
  
  if (error instanceof ZendeskRateLimitError) {
    return {
      content: [{
        type: "text",
        text: `⏱️ Rate Limit: ${error.message}\n\nPlease wait ${error.retryAfter} seconds before trying again.`
      }]
    };
  }

  if (error instanceof ZendeskAuthError) {
    return {
      content: [{
        type: "text",
        text: `🔐 Authentication Error: ${error.message}\n\nPlease verify your Zendesk credentials in the environment variables.`
      }]
    };
  }

  if (error instanceof ZendeskNotFoundError) {
    return {
      content: [{
        type: "text",
        text: `🔍 Not Found: ${error.message}`
      }]
    };
  }

  if (error instanceof ZendeskValidationError) {
    let text = `❌ Validation Error: ${error.message}`;
    if (error.validationDetails) {
      text += '\n\nDetails:\n' + JSON.stringify(error.validationDetails, null, 2);
    }
    return {
      content: [{ type: "text", text }]
    };
  }

  if (error instanceof ZendeskServerError) {
    return {
      content: [{
        type: "text",
        text: `⚠️ Server Error: ${error.message}\n\nThis is a temporary issue. The request will be retried automatically.`
      }]
    };
  }

  if (error instanceof ZendeskNetworkError) {
    return {
      content: [{
        type: "text",
        text: `🌐 Network Error: ${error.message}\n\nPlease check your internet connection and try again.`
      }]
    };
  }

  // Default error response
  return {
    content: [{
      type: "text",
      text: `Error: ${error.message || 'An unexpected error occurred'}`
    }]
  };
}