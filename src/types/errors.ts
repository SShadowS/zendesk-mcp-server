/**
 * Error Types
 */

/**
 * Base error properties
 */
export interface ErrorDetails {
  statusCode?: number;
  response?: any;
  request?: any;
  config?: any;
}

/**
 * Configuration error properties
 */
export interface ConfigurationErrorDetails extends ErrorDetails {
  missingVariables?: string[];
}

/**
 * API error properties
 */
export interface ApiErrorDetails extends ErrorDetails {
  endpoint?: string;
  method?: string;
}

/**
 * Validation error properties
 */
export interface ValidationErrorDetails extends ErrorDetails {
  field?: string;
  value?: any;
  constraints?: string[];
}

/**
 * Error response format for MCP
 */
export interface McpErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}