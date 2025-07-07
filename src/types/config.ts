/**
 * Configuration Types
 */

/**
 * Environment variables configuration
 */
export interface EnvironmentConfig {
  ZENDESK_SUBDOMAIN?: string;
  ZENDESK_EMAIL?: string;
  ZENDESK_API_TOKEN?: string;
  MCP_DEBUG?: string;
}

/**
 * Zendesk client configuration
 */
export interface ZendeskClientConfig {
  subdomain: string;
  email: string;
  apiToken: string;
  baseURL: string;
  auth: {
    username: string;
    password: string;
  };
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  factor: number;
  shouldRetry?: (error: any) => boolean;
}

/**
 * Retry profiles for different scenarios
 */
export interface RetryProfiles {
  default: RetryConfig;
  upload: RetryConfig;
  aggressive: RetryConfig;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  name: string;
  version: string;
  capabilities?: {
    tools?: Record<string, any>;
    resources?: Record<string, any>;
  };
}