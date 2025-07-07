/**
 * Retry logic utilities for Zendesk API requests
 */

import { ZendeskRateLimitError } from './errors.js';

// Default configuration
const DEFAULT_CONFIG = {
  maxRetries: parseInt(process.env.ZENDESK_MAX_RETRIES) || 3,
  initialDelay: parseInt(process.env.ZENDESK_RETRY_DELAY) || 1000,
  maxDelay: parseInt(process.env.ZENDESK_RETRY_MAX_DELAY) || 30000,
  backoffMultiplier: 2,
  jitter: true
};

/**
 * Calculate exponential backoff delay with optional jitter
 */
function calculateBackoff(attempt, config = DEFAULT_CONFIG) {
  const exponentialDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
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
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if an error is retryable
 */
function isRetryable(error) {
  // Use the isRetryable property if it exists
  if (error.isRetryable !== undefined) {
    return error.isRetryable;
  }
  
  // Network errors are generally retryable
  if (!error.response && error.code) {
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH'];
    return retryableCodes.includes(error.code);
  }
  
  // Check status codes
  if (error.response && error.response.status) {
    const status = error.response.status;
    // Retry on rate limits, server errors, and some client errors
    return status === 429 || status >= 500 || status === 408 || status === 409;
  }
  
  return false;
}

/**
 * Execute a function with retry logic
 * 
 * @param {Function} fn - The async function to execute
 * @param {Object} options - Retry configuration options
 * @returns {Promise} - The result of the function or throws the final error
 */
export async function withRetry(fn, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const debug = process.env.ZENDESK_DEBUG === 'true';
  
  let lastError;
  
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
          console.error(`[Retry] Failed after ${attempt} attempt(s):`, error.message);
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
export function createRetryWrapper(defaultOptions = {}) {
  return (fn) => withRetry(fn, defaultOptions);
}

/**
 * Retry configuration builder for specific scenarios
 */
export const RetryProfiles = {
  // Aggressive retry for critical operations
  aggressive: {
    maxRetries: 5,
    initialDelay: 500,
    maxDelay: 60000,
    backoffMultiplier: 2
  },
  
  // Conservative retry for less critical operations
  conservative: {
    maxRetries: 2,
    initialDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 2
  },
  
  // No retry
  none: {
    maxRetries: 1
  },
  
  // Rate limit aware (longer delays)
  rateLimitAware: {
    maxRetries: 3,
    initialDelay: 5000,
    maxDelay: 120000,
    backoffMultiplier: 3
  }
};

/**
 * Extract retry information from an error for logging
 */
export function getRetryInfo(error, attempt, maxRetries) {
  const info = {
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