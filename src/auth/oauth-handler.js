import { randomBytes, createHash } from 'crypto';

/**
 * OAuth 2.1 handler for Zendesk authentication
 * Implements Authorization Code flow with PKCE (RFC 7636)
 */
export class OAuthHandler {
  /**
   * @param {Object} config
   * @param {string} config.clientId - OAuth client ID
   * @param {string} config.clientSecret - OAuth client secret
   * @param {string} config.redirectUri - OAuth callback URL
   * @param {string} config.subdomain - Zendesk subdomain
   */
  constructor(config) {
    if (!config.clientId || !config.clientSecret || !config.subdomain) {
      throw new Error('Missing required OAuth configuration');
    }

    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri || 'http://localhost:3030/zendesk/oauth/callback';
    this.subdomain = config.subdomain;
    this.baseUrl = `https://${config.subdomain}.zendesk.com`;
  }

  /**
   * Generate PKCE challenge and verifier
   * Uses S256 method (SHA256 hash)
   * @returns {{verifier: string, challenge: string}}
   */
  generatePKCE() {
    // Generate 32 random bytes, encode as base64url
    const verifier = randomBytes(32).toString('base64url');

    // Create SHA256 hash of verifier, encode as base64url
    const challenge = createHash('sha256')
      .update(verifier)
      .digest('base64url');

    return { verifier, challenge };
  }

  /**
   * Build authorization URL for user to visit
   * @param {string} state - CSRF protection token
   * @param {string} codeChallenge - PKCE challenge
   * @param {string[]} scopes - Requested scopes (default: ['read', 'write'])
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl(state, codeChallenge, scopes = ['read', 'write']) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    return `${this.baseUrl}/oauth/authorizations/new?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code from callback
   * @param {string} codeVerifier - PKCE verifier
   * @returns {Promise<Object>} Token response with access_token, refresh_token, expires_in
   */
  async exchangeCodeForTokens(code, codeVerifier) {
    const response = await fetch(`${this.baseUrl}/oauth/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Token exchange failed: ${response.status} - ${error.error_description || error.error || response.statusText}`
      );
    }

    const tokens = await response.json();

    // Validate response
    if (!tokens.access_token) {
      throw new Error('Invalid token response: missing access_token');
    }

    if (tokens.token_type && tokens.token_type.toLowerCase() !== 'bearer') {
      throw new Error(`Invalid token response: expected token_type "Bearer", got "${tokens.token_type}"`);
    }

    return tokens;
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token from previous token exchange
   * @returns {Promise<Object>} New token response
   */
  async refreshAccessToken(refreshToken) {
    const response = await fetch(`${this.baseUrl}/oauth/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Token refresh failed: ${response.status} - ${error.error_description || error.error || response.statusText}`
      );
    }

    const tokens = await response.json();

    // Validate response
    if (!tokens.access_token) {
      throw new Error('Invalid token response: missing access_token');
    }

    if (tokens.token_type && tokens.token_type.toLowerCase() !== 'bearer') {
      throw new Error(`Invalid token response: expected token_type "Bearer", got "${tokens.token_type}"`);
    }

    return tokens;
  }

  /**
   * Validate OAuth configuration
   * @returns {boolean} True if configuration is valid
   */
  validateConfig() {
    return !!(this.clientId && this.clientSecret && this.subdomain);
  }
}

/**
 * Generate a random state parameter for CSRF protection
 * @returns {string} Random state string
 */
export function generateState() {
  return randomBytes(16).toString('base64url');
}
