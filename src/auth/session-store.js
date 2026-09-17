import { randomUUID, createHash } from 'crypto';

/**
 * Absolute expiry (ms) for a Zendesk token response, or null when Zendesk
 * omits expires_in (non-expiring token). Storing NaN here made
 * isZendeskTokenExpiring() return true forever, refreshing on every request.
 */
const tokenExpiry = (tokens) =>
  tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : null;

const MCP_ACCESS_TOKEN_TTL_S = 24 * 60 * 60;
const MCP_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
    this.refreshTokens = new Map(); // MCP refresh token -> session

    console.warn('[SessionStore] Using in-memory storage - NOT FOR PRODUCTION');
    console.warn('[SessionStore] For production, implement RedisSessionStore (see Phase 6)');

    // Start cleanup interval (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  /**
   * Create a new session for OAuth flow
   * @param {string} internalState - Internal state for Zendesk flow
   * @param {string} zendeskVerifier - PKCE verifier for Zendesk
   * @param {string} clientRedirectUri - Client's redirect URI (optional)
   * @param {string} clientCodeChallenge - Client's PKCE challenge (optional)
   * @param {string} clientState - Client's original state (must be returned in callback)
   * @returns {Object} Session data
   */
  createOAuthSession(internalState, zendeskVerifier, clientRedirectUri = null, clientCodeChallenge = null, clientState = null) {
    const session = {
      id: randomUUID(),
      state: internalState,  // Internal state for Zendesk flow
      clientState: clientState,  // Client's original state - MUST be returned!
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

    this.sessionsByState.set(internalState, session);
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
    session.zendeskAccessToken = tokens.access_token;
    session.zendeskRefreshToken = tokens.refresh_token;
    session.zendeskTokenExpiry = tokenExpiry(tokens);
    session.scopes = (tokens.scope || '').split(' ').filter(Boolean);

    const issued = this.issueMcpTokens(session);

    // Clean up state mapping (no longer needed)
    this.sessionsByState.delete(session.state);

    return issued;
  }

  /**
   * Issue a fresh MCP access token (24h) + refresh token (30d) for a session,
   * invalidating whatever MCP tokens the session held before (rotation).
   * @param {Object} session
   * @returns {{ mcpAccessToken: string, mcpExpiresIn: number, mcpRefreshToken: string }}
   */
  issueMcpTokens(session) {
    if (session.mcpAccessToken) this.sessions.delete(session.mcpAccessToken);
    if (session.mcpRefreshToken) this.refreshTokens.delete(session.mcpRefreshToken);

    const mcpAccessToken = `mcp_${randomUUID().replace(/-/g, '')}`;
    const mcpRefreshToken = `mcpr_${randomUUID().replace(/-/g, '')}`;

    session.mcpAccessToken = mcpAccessToken;
    session.mcpTokenExpiry = Date.now() + (MCP_ACCESS_TOKEN_TTL_S * 1000);
    session.mcpRefreshToken = mcpRefreshToken;
    session.mcpRefreshTokenExpiry = Date.now() + MCP_REFRESH_TOKEN_TTL_MS;

    this.sessions.set(mcpAccessToken, session);
    this.refreshTokens.set(mcpRefreshToken, session);

    return { mcpAccessToken, mcpExpiresIn: MCP_ACCESS_TOKEN_TTL_S, mcpRefreshToken };
  }

  /**
   * refresh_token grant: rotate both tokens. Null when the refresh token is
   * unknown (already rotated, revoked, or never issued) or expired.
   * @param {string} refreshToken
   * @returns {Object|null} { mcpAccessToken, mcpExpiresIn, mcpRefreshToken, session }
   */
  refreshMcpToken(refreshToken) {
    const session = this.refreshTokens.get(refreshToken);
    if (!session) return null;
    if (Date.now() >= session.mcpRefreshTokenExpiry) {
      this.revokeSession(session.mcpAccessToken);
      return null;
    }
    return { ...this.issueMcpTokens(session), session };
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
      session.zendeskTokenExpiry = tokenExpiry(tokens);

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
    // No expiry recorded = non-expiring token (see tokenExpiry); never refresh
    if (!session.zendeskTokenExpiry) {
      return false;
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
   * Delete a session AND its refresh token. Use when the Zendesk side is dead
   * (refresh failed), so the client cannot mint a new MCP token for it.
   * @param {string} mcpAccessToken
   */
  revokeSession(mcpAccessToken) {
    const session = this.sessions.get(mcpAccessToken);
    if (session) this.refreshTokens.delete(session.mcpRefreshToken);
    this.deleteSession(mcpAccessToken);
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
    session.zendeskTokenExpiry = tokenExpiry(zendeskTokens);
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

    const issued = this.issueMcpTokens(session);

    // Clean up state mapping (no longer needed)
    this.sessionsByState.delete(session.state);

    // Delete authorization code (one-time use)
    this.authorizationCodes.delete(authCode);

    return { ...issued, session };
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

    // Clean up sessions map (access tokens). The session itself lives on via
    // its refresh token until that expires too.
    for (const [token, session] of this.sessions.entries()) {
      const isZendeskExpired = session.zendeskTokenExpiry && now > session.zendeskTokenExpiry;
      const isMcpExpired = session.mcpTokenExpiry && now >= session.mcpTokenExpiry;

      if (isZendeskExpired || isMcpExpired) {
        this.sessions.delete(token);
      }
    }

    for (const [token, session] of this.refreshTokens.entries()) {
      if (now >= session.mcpRefreshTokenExpiry) {
        this.refreshTokens.delete(token);
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
