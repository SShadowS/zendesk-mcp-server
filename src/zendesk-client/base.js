import axios from 'axios';
import { classifyError, ZendeskAuthError } from '../utils/errors.js';
import { withRetry, RetryProfiles } from '../utils/retry.js';

/**
 * Base Zendesk client with core infrastructure
 * Handles authentication, credentials, and HTTP requests
 */
class ZendeskClientBase {
  constructor() {
    this.debug = process.env.ZENDESK_DEBUG === 'true';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Set OAuth access token for subsequent requests
   * @param {string} token - OAuth access token
   * @param {number|null} expiresAt - Token expiration timestamp (ms since epoch)
   */
  setAccessToken(token, expiresAt = null) {
    this.accessToken = token;
    this.tokenExpiry = expiresAt;

    if (this.debug) {
      console.log('[ZendeskClient] OAuth token set', {
        hasToken: !!token,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : 'unknown'
      });
    }
  }

  /**
   * Clear OAuth access token
   */
  clearAccessToken() {
    this.accessToken = null;
    this.tokenExpiry = null;

    if (this.debug) {
      console.log('[ZendeskClient] OAuth token cleared');
    }
  }

  /**
   * Check if the current OAuth token is expired
   * @returns {boolean}
   */
  isTokenExpired() {
    if (!this.accessToken) {
      return true;
    }

    if (!this.tokenExpiry) {
      return false;
    }

    return Date.now() >= this.tokenExpiry;
  }

  getCredentials() {
    if (!this._credentials) {
      this._credentials = {
        subdomain: process.env.ZENDESK_SUBDOMAIN
      };

      if (!this._credentials.subdomain) {
        console.warn('[ZendeskClient] ZENDESK_SUBDOMAIN not configured.');
      }
    }
    return this._credentials;
  }

  getBaseUrl() {
    const { subdomain } = this.getCredentials();
    if (!subdomain) {
      throw new ZendeskAuthError(
        'ZENDESK_SUBDOMAIN not configured.',
        500,
        null
      );
    }
    return `https://${subdomain}.zendesk.com/api/v2`;
  }

  /**
   * Get authorization header (OAuth Bearer token required)
   * @returns {string} Authorization header value
   */
  getAuthHeader() {
    if (this.accessToken && !this.isTokenExpired()) {
      return `Bearer ${this.accessToken}`;
    }

    throw new ZendeskAuthError(
      'No valid OAuth access token. Please complete OAuth authorization flow.',
      401,
      null
    );
  }

  async request(method, endpoint, data = null, params = null, retryProfile = 'default') {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const requestConfig = {
      method,
      url,
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      data,
      params,
      timeout: 60000
    };

    if (this.debug) {
      console.log(`[Zendesk API] ${method} ${endpoint}`, {
        hasData: !!data,
        hasParams: !!params,
        authType: 'OAuth Bearer'
      });
    }

    const retryOptions = retryProfile === 'none'
      ? RetryProfiles.none
      : retryProfile === 'aggressive'
        ? RetryProfiles.aggressive
        : retryProfile === 'conservative'
          ? RetryProfiles.conservative
          : {};

    try {
      const response = await withRetry(async () => {
        try {
          const axiosResponse = await axios(requestConfig);

          if (this.debug) {
            console.log(`[Zendesk API] Success: ${method} ${endpoint}`, {
              status: axiosResponse.status,
              hasData: !!axiosResponse.data
            });
          }

          return axiosResponse.data;
        } catch (error) {
          throw classifyError(error);
        }
      }, retryOptions);

      return response;
    } catch (error) {
      if (this.debug) {
        console.error(`[Zendesk API] Failed: ${method} ${endpoint}`, {
          errorType: error.name,
          statusCode: error.statusCode,
          message: error.message
        });
      }

      throw error;
    }
  }

  /**
   * Test connection by fetching current user info
   */
  async testConnection() {
    const { subdomain } = this.getCredentials();

    if (!subdomain) {
      throw new ZendeskAuthError(
        'ZENDESK_SUBDOMAIN not configured.',
        500,
        null
      );
    }

    const response = await this.request('GET', '/users/me.json', null, null, 'none');

    if (response && response.user) {
      return { success: true, user: response.user };
    } else {
      throw new Error('Unexpected response from Zendesk API');
    }
  }
}

export { ZendeskClientBase };
