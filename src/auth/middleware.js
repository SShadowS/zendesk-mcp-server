/**
 * Auth middleware factory for MCP OAuth Bearer token authentication.
 *
 * Extracted from http-server.js for testability.
 * All functions receive their dependencies via the factory parameter
 * instead of closing over module-level singletons.
 *
 * @param {Object} deps
 * @param {import('./session-store.js').SessionStore} deps.sessionStore
 * @param {import('./oauth-handler.js').OAuthHandler} deps.oauth
 * @param {number} [deps.port=3030] - Server port (used to build PRM URL)
 */
export function createAuthMiddleware({ sessionStore, oauth, port = 3030 }) {

  /**
   * Build WWW-Authenticate header for MCP OAuth
   * @param {string} prmUrl - Protected Resource Metadata URL
   * @returns {string} WWW-Authenticate header value
   */
  function buildAuthenticateHeader(prmUrl) {
    return `Bearer realm="mcp", resource_metadata="${prmUrl}"`;
  }

  /**
   * Send 401 Unauthorized response with WWW-Authenticate header
   * @param {Response} res - Express response object
   * @param {string} prmUrl - Protected Resource Metadata URL
   * @param {string} message - Error message
   * @param {string} hint - Helpful hint for the user
   */
  function sendUnauthorizedResponse(res, prmUrl, message, hint = 'Visit /oauth/authorize to get an access token') {
    return res.status(401)
      .header('WWW-Authenticate', buildAuthenticateHeader(prmUrl))
      .json({
        error: 'unauthorized',
        message,
        hint
      });
  }

  /**
   * Refresh Zendesk token with retry and exponential backoff
   * @param {Object} session - Current session
   * @param {string} mcpAccessToken - MCP access token
   * @returns {Promise<boolean>} True if refresh succeeded
   * @throws {Error} If refresh fails after retries
   */
  async function refreshZendeskTokenWithRetry(session, mcpAccessToken) {
    const MAX_ATTEMPTS = 2;
    let lastError;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const newTokens = await oauth.refreshAccessToken(session.zendeskRefreshToken);
        sessionStore.updateZendeskTokens(mcpAccessToken, newTokens);
        console.log(`[Auth] Token refresh successful for session ${session.id}`);
        return true;
      } catch (error) {
        lastError = error;

        // Don't retry on 4xx errors (invalid_grant, etc.) - permanent failures
        if (error.message && /4\d\d/.test(error.message)) {
          throw error;
        }

        // Transient error - retry with backoff
        if (attempt < MAX_ATTEMPTS) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 2000);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }

  /**
   * Authenticate Bearer token and manage Zendesk token refresh
   * Follows MCP OAuth specification for WWW-Authenticate header format
   */
  async function authenticateBearer(req, res, next) {
    const serverUrl = process.env.SERVER_BASE_URL || `http://localhost:${port}`;
    const prmUrl = `${serverUrl}/.well-known/oauth-protected-resource`;

    // Check for Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendUnauthorizedResponse(res, prmUrl, 'Missing or invalid Authorization header');
    }

    const mcpAccessToken = authHeader.slice(7);

    // Lookup and validate session
    const session = sessionStore.getSession(mcpAccessToken);
    if (!session) {
      return sendUnauthorizedResponse(res, prmUrl, 'Invalid or expired token', 'Visit /oauth/authorize to get a new access token');
    }

    // Check MCP token expiry
    if (session.mcpTokenExpiry && Date.now() >= session.mcpTokenExpiry) {
      console.log(`[Auth] MCP token expired for session ${session.id}`);
      sessionStore.deleteSession(mcpAccessToken);
      return sendUnauthorizedResponse(res, prmUrl, 'Token expired', 'Visit /oauth/authorize to get a new access token');
    }

    // Refresh Zendesk token if needed
    if (sessionStore.isZendeskTokenExpiring(session)) {
      try {
        console.log(`[Auth] Refreshing Zendesk token for session ${session.id}`);
        await refreshZendeskTokenWithRetry(session, mcpAccessToken);
      } catch (error) {
        console.error('[Auth] Token refresh failed:', error);
        sessionStore.deleteSession(mcpAccessToken);
        return sendUnauthorizedResponse(res, prmUrl, 'Token refresh failed. Please re-authorize.', 'Visit /oauth/authorize to get a new access token');
      }
    }

    // Set session context for downstream handlers
    req.session = session;
    req.mcpAccessToken = mcpAccessToken;
    next();
  }

  /**
   * Return 403 Forbidden with scope information
   * Helper function for insufficient scope errors
   */
  function insufficientScope(res, requiredScopes) {
    const authenticateHeader = [
      'Bearer realm="zendesk-mcp"',
      `scope="${requiredScopes.join(' ')}"`,
      'error="insufficient_scope"',
      'error_description="The access token does not have the required scope"'
    ].join(', ');

    return res.status(403)
      .header('WWW-Authenticate', authenticateHeader)
      .json({
        error: 'insufficient_scope',
        message: 'The access token does not have the required scope',
        required_scopes: requiredScopes
      });
  }

  return {
    authenticateBearer,
    buildAuthenticateHeader,
    sendUnauthorizedResponse,
    refreshZendeskTokenWithRetry,
    insufficientScope
  };
}
