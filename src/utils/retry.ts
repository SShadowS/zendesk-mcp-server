/**
 * Retry logic utilities for Zendesk API requests
 */

import { AxiosError } from 'axios';
import { ZendeskRateLimitError, ZendeskError } from './errors.js';
import { RetryConfig, RetryProfiles } from '../types/config.js';

// Default configuration
const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: parseInt(process.env.ZENDESK_MAX_RETRIES || '3', 10),
  baseDelay: parseInt(process.env.ZENDESK_RETRY_DELAY || '1000', 10),
  maxDelay: parseInt(process.env.ZENDESK_RETRY_MAX_DELAY || '30000', 10),
  factor: 2
};

interface RetryConfigWithJitter extends RetryConfig {
  jitter?: boolean;
}

/**
 * Calculate exponential backoff delay with optional jitter
 */
function calculateBackoff(attempt: number, config: RetryConfigWithJitter = { ...DEFAULT_CONFIG, jitter: true }): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.factor, attempt - 1);
  const delay = Math.min(exponentialDelay, config.maxDelay);
  
  if (config.jitter) {
    // Add random jitter (±25% of the delay)
    const jitterRange = delay * 0.25;
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    return Math.round(delay + jitter);
  }
  
  return delay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if an error is retryable
 */
function isRetryable(error: any): boolean {
  // Use the isRetryable property if it exists
  if (error instanceof ZendeskError) {
    return error.isRetryable;
  }
  
  // Check if it's an Axios error
  if (error.isAxiosError) {
    const axiosError = error as AxiosError;
    
    // Network errors are generally retryable
    if (!axiosError.response && axiosError.code) {
      const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH'];
      return retryableCodes.includes(axiosError.code);
    }
    
    // Check status codes
    if (axiosError.response && axiosError.response.status) {
      const status = axiosError.response.status;
      // Retry on rate limits, server errors, and some client errors
      return status === 429 || status >= 500 || status === 408 || status === 409;
    }
  }
  
  return false;
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>, 
  options: Partial<RetryConfigWithJitter> = {}
): Promise<T> {
  const config: RetryConfigWithJitter = { 
    ...DEFAULT_CONFIG, 
    jitter: true,
    ...options 
  };
  const debug = process.env.ZENDESK_DEBUG === 'true';
  
  let lastError: any;
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      if (debug && attempt > 1) {
        console.log(`[Retry] Attempt ${attempt}/${config.maxRetries}`);
      }
      
      // Execute the function
      const result = await fn();
      
      // Success - return the result
      return result;
      
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (!isRetryable(error) || attempt === config.maxRetries) {
        if (debug) {
          console.error(`[Retry] Failed after ${attempt} attempt(s):`, (error as Error).message);
        }
        throw error;
      }
      
      // Calculate delay
      let delay = calculateBackoff(attempt, config);
      
      // Special handling for rate limit errors
      if (error instanceof ZendeskRateLimitError && error.retryAfter) {
        // Use the server-provided retry delay if available
        delay = error.retryAfter * 1000; // Convert to milliseconds
        if (debug) {
          console.log(`[Retry] Rate limited. Waiting ${error.retryAfter} seconds as requested by server.`);
        }
      } else if (debug) {
        console.log(`[Retry] Attempt ${attempt} failed. Waiting ${delay}ms before retry.`);
      }
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  // This should never be reached, but just in case
  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Create a retry wrapper for a specific configuration
 */
export function createRetryWrapper(defaultOptions: Partial<RetryConfigWithJitter> = {}) {
  return <T>(fn: () => Promise<T>) => withRetry(fn, defaultOptions);
}

/**
 * Retry configuration builder for specific scenarios
 */
export const retryProfiles: RetryProfiles = {
  // Default retry configuration
  default: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    factor: 2
  },
  
  // Upload operations (longer delays, more retries)
  upload: {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 60000,
    factor: 2
  },
  
  // Aggressive retry for critical operations
  aggressive: {
    maxRetries: 5,
    baseDelay: 500,
    maxDelay: 60000,
    factor: 2
  }
};

/**
 * Extract retry information from an error for logging
 */
export function getRetryInfo(error: any, attempt: number, maxRetries: number): Record<string, any> {
  const info: Record<string, any> = {
    attempt,
    maxRetries,
    isRetryable: isRetryable(error),
    errorType: error.name || 'Error',
    statusCode: error.statusCode || (error.response && error.response.status)
  };
  
  if (error instanceof ZendeskRateLimitError) {
    info.retryAfter = error.retryAfter;
  }
  
  return info;
}