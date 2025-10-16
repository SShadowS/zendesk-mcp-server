import { randomUUID, createHash } from 'crypto';

/**
 * In-memory session store for OAuth sessions
 * Maps MCP access tokens to session data
 *
 * ⚠️ DEVELOPMENT ONLY - NOT FOR PRODUCTION
 *
 * Limitations:
 * - All sessions lost on server restart
 * - Cannot scale horizontally (no shared state)
 * - Not suitable for production workloads
 *
 * For production: Use RedisSessionStore or similar persistent backend (see Phase 6)
 */
export class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.sessionsByState = new Map(); // For OAuth callback lookup
    this.authorizationCodes = new Map(); // For authorization code -> session mapping
    this.registeredClients = new Map(); // For dynamic client registration

    console.warn('[SessionStore] Using in-memory storage - NOT FOR PRODUCTION');
    console.warn('[SessionStore] For production, implement RedisSessionStore (see Phase 6)');

    // Start cleanup interval (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  /**
   * Create a new session for OAuth flow
   * @param {string} state - CSRF protection state
   * @param {string} zendeskVerifier - PKCE verifier for Zendesk
   * @param {string} clientRedirectUri - Client's redirect URI (optional)
   * @param {string} clientCodeChallenge - Client's PKCE challenge (optional)
   * @returns {Object} Session data
   */
  createOAuthSession(state, zendeskVerifier, clientRedirectUri = null, clientCodeChallenge = null) {
    const session = {
      id: randomUUID(),
      state: state,
      zendeskVerifier: zendeskVerifier, // PKCE verifier for Zendesk flow
      clientCodeChallenge: clientCodeChallenge, // Client's PKCE challenge
      clientRedirectUri: clientRedirectUri, // Store client's redirect URI
      createdAt: Date.now(),
      // Will be set after successful authorization:
      zendeskAccessToken: null,
      zendeskRefreshToken: null,
      zendeskTokenExpiry: null,
      mcpAccessToken: null,
      mcpTokenExpiry: null,  // MCP token expiration timestamp
      scopes: []
    };

    this.sessionsByState.set(state, session);
    return session;
  }

  /**
   * Find session by OAuth state parameter
   * @param {string} state
   * @returns {Object|null} Session or null
   */
  getSessionByState(state) {
    return this.sessionsByState.get(state) || null;
  }

  /**
   * Complete OAuth flow and store tokens
   * @param {Object} session
   * @param {Object} tokens - Zendesk token response
   * @returns {Object} { mcpAccessToken, mcpExpiresIn } MCP access token and expiry
   */
  completeOAuthFlow(session, tokens) {
    // Generate MCP access token (used by client to authenticate with MCP server)
    const mcpAccessToken = `mcp_${randomUUID().replace(/-/g, '')}`;

    // MCP token TTL: 24 hours (86400 seconds)
    const mcpExpiresIn = 24 * 60 * 60;
    const mcpTokenExpiry = Date.now() + (mcpExpiresIn * 1000);

    // Update session with tokens
    session.zendeskAccessToken = tokens.access_token;
    session.zendeskRefreshToken = tokens.refresh_token;
    session.zendeskTokenExpiry = Date.now() + (tokens.expires_in * 1000);
    session.mcpAccessToken = mcpAccessToken;
    session.mcpTokenExpiry = mcpTokenExpiry;
    session.scopes = (tokens.scope || '').split(' ').filter(Boolean);

    // Map MCP token to session for future requests
    this.sessions.set(mcpAccessToken, session);

    // Clean up state mapping (no longer needed)
    this.sessionsByState.delete(session.state);

    return { mcpAccessToken, mcpExpiresIn };
  }

  /**
   * Get session by MCP access token
   * @param {string} mcpAccessToken
   * @returns {Object|null}
   */
  getSession(mcpAccessToken) {
    return this.sessions.get(mcpAccessToken) || null;
  }

  /**
   * Update Zendesk tokens for a session
   * @param {string} mcpAccessToken
   * @param {Object} tokens - New Zendesk tokens
   */
  updateZendeskTokens(mcpAccessToken, tokens) {
    const session = this.sessions.get(mcpAccessToken);
    if (session) {
      session.zendeskAccessToken = tokens.access_token;
      session.zendeskTokenExpiry = Date.now() + (tokens.expires_in * 1000);

      // Update refresh token if provided (some servers rotate refresh tokens)
      if (tokens.refresh_token) {
        session.zendeskRefreshToken = tokens.refresh_token;
      }
    }
  }

  /**
   * Check if Zendesk token is expired or expiring soon
   * @param {Object} session
   * @param {number} bufferMs - Refresh buffer in milliseconds (default: 60s)
   * @returns {boolean}
   */
  isZendeskTokenExpiring(session, bufferMs = 60000) {
    if (!session.zendeskTokenExpiry) {
      return true;
    }
    return Date.now() >= (session.zendeskTokenExpiry - bufferMs);
  }

  /**
   * Delete a session
   * @param {string} mcpAccessToken
   */
  deleteSession(mcpAccessToken) {
    const session = this.sessions.get(mcpAccessToken);
    if (session) {
      this.sessionsByState.delete(session.state);
      this.sessions.delete(mcpAccessToken);
    }
  }

  /**
   * Create an authorization code after Zendesk authorization
   * @param {Object} session - Session object
   * @param {Object} zendeskTokens - Zendesk tokens from token exchange
   * @returns {string} Authorization code
   */
  createAuthorizationCode(session, zendeskTokens) {
    // Generate authorization code
    const authCode = `auth_${randomUUID().replace(/-/g, '')}`;

    // Store Zendesk tokens in session
    session.zendeskAccessToken = zendeskTokens.access_token;
    session.zendeskRefreshToken = zendeskTokens.refresh_token;
    session.zendeskTokenExpiry = Date.now() + (zendeskTokens.expires_in * 1000);
    session.scopes = (zendeskTokens.scope || '').split(' ').filter(Boolean);

    // Store authorization code with TTL (10 minutes)
    const codeData = {
      session: session, // Store the session directly for easy access
      createdAt: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000), // 10 minutes
      used: false
    };

    this.authorizationCodes.set(authCode, codeData);

    // DON'T delete state mapping yet - keep it until token exchange
    // We need the session to be findable during exchangeAuthorizationCode

    return authCode;
  }

  /**
   * Exchange authorization code for MCP access token
   * @param {string} authCode - Authorization code
   * @param {string} codeVerifier - PKCE verifier from client
   * @returns {Object} { mcpAccessToken, mcpExpiresIn, session } or null if invalid
   */
  exchangeAuthorizationCode(authCode, codeVerifier) {
    console.log(`[SessionStore] Attempting to exchange code: ${authCode}`);
    console.log(`[SessionStore] Total authorization codes in store: ${this.authorizationCodes.size}`);

    const codeData = this.authorizationCodes.get(authCode);

    if (!codeData) {
      console.log('[SessionStore] FAILED: Authorization code not found in store');
      return null; // Invalid code
    }

    console.log(`[SessionStore] Code data found, expires at: ${new Date(codeData.expiresAt).toISOString()}`);

    // Check if code is expired
    if (Date.now() >= codeData.expiresAt) {
      console.log('[SessionStore] FAILED: Authorization code expired');
      this.authorizationCodes.delete(authCode);
      return null;
    }

    // Check if code was already used
    if (codeData.used) {
      console.log('[SessionStore] FAILED: Authorization code already used');
      this.authorizationCodes.delete(authCode);
      return null;
    }

    // Get session from code data (stored directly)
    const session = codeData.session;

    if (!session) {
      console.log('[SessionStore] FAILED: Session not found in code data');
      this.authorizationCodes.delete(authCode);
      return null;
    }

    console.log(`[SessionStore] Session found: ${session.id}`);
    console.log(`[SessionStore] Client code challenge: ${session.clientCodeChallenge}`);
    console.log(`[SessionStore] Provided verifier: ${codeVerifier}`);

    // Verify PKCE code_verifier against client's challenge (if provided)
    if (session.clientCodeChallenge) {
      // Compute SHA256 hash of the provided verifier
      const computedChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      console.log(`[SessionStore] Computed challenge from verifier: ${computedChallenge}`);

      if (computedChallenge !== session.clientCodeChallenge) {
        console.log('[SessionStore] FAILED: PKCE verification failed - challenges do not match');
        this.authorizationCodes.delete(authCode);
        return null; // PKCE verification failed
      }

      console.log('[SessionStore] PKCE verification successful (client flow)');
    } else {
      // Fallback: Old behavior for backward compatibility (no client challenge)
      console.log('[SessionStore] No client challenge stored, skipping PKCE verification');
    }

    // Mark code as used (one-time use)
    codeData.used = true;

    // Generate MCP access token
    const mcpAccessToken = `mcp_${randomUUID().replace(/-/g, '')}`;
    const mcpExpiresIn = 24 * 60 * 60; // 24 hours
    const mcpTokenExpiry = Date.now() + (mcpExpiresIn * 1000);

    // Update session with MCP token
    session.mcpAccessToken = mcpAccessToken;
    session.mcpTokenExpiry = mcpTokenExpiry;

    // Map MCP token to session for future requests
    this.sessions.set(mcpAccessToken, session);

    // Clean up state mapping (no longer needed)
    this.sessionsByState.delete(session.state);

    // Delete authorization code (one-time use)
    this.authorizationCodes.delete(authCode);

    return { mcpAccessToken, mcpExpiresIn, session };
  }

  /**
   * Register a client (for dynamic client registration)
   * @param {string} clientId - Client identifier
   * @param {Object} clientData - Client metadata
   */
  registerClient(clientId, clientData) {
    this.registeredClients.set(clientId, {
      ...clientData,
      registeredAt: Date.now()
    });
  }

  /**
   * Get registered client data
   * @param {string} clientId
   * @returns {Object|null} Client data or null
   */
  getRegisteredClient(clientId) {
    return this.registeredClients.get(clientId) || null;
  }

  /**
   * Clean up expired sessions
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up sessions map
    for (const [token, session] of this.sessions.entries()) {
      const age = now - session.createdAt;
      const isZendeskExpired = session.zendeskTokenExpiry && now > session.zendeskTokenExpiry;
      const isMcpExpired = session.mcpTokenExpiry && now >= session.mcpTokenExpiry;

      if (age > maxAge || isZendeskExpired || isMcpExpired) {
        this.sessions.delete(token);
      }
    }

    // Clean up state map (should be empty after OAuth flow completes)
    for (const [state, session] of this.sessionsByState.entries()) {
      const age = now - session.createdAt;
      // OAuth flows should complete within 10 minutes
      if (age > 10 * 60 * 1000) {
        this.sessionsByState.delete(state);
      }
    }

    // Clean up expired authorization codes
    for (const [code, codeData] of this.authorizationCodes.entries()) {
      if (now >= codeData.expiresAt || codeData.used) {
        this.authorizationCodes.delete(code);
      }
    }

    console.log(`[SessionStore] Cleanup complete. Active sessions: ${this.sessions.size}, Pending codes: ${this.authorizationCodes.size}`);
  }

  /**
   * Get session count (for debugging)
   */
  getSessionCount() {
    return {
      active: this.sessions.size,
      pending: this.sessionsByState.size
    };
  }

  /**
   * Cleanup interval on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
