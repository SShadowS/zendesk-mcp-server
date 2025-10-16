import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { initializeServer } from './server.js';
import { randomUUID } from 'crypto';
import { OAuthHandler, generateState } from './auth/oauth-handler.js';
import { SessionStore } from './auth/session-store.js';
import { ZendeskClient } from './zendesk-client.js';
import { storeZendeskClient, runInContext, clearZendeskClient } from './request-context.js';

const app = express();
const PORT = process.env.PORT || 3030;

// Initialize OAuth handler and session store
const oauth = new OAuthHandler({
  clientId: process.env.ZENDESK_OAUTH_CLIENT_ID,
  clientSecret: process.env.ZENDESK_OAUTH_CLIENT_SECRET,
  subdomain: process.env.ZENDESK_SUBDOMAIN,
  redirectUri: process.env.ZENDESK_OAUTH_REDIRECT_URI || `http://localhost:${PORT}/zendesk/oauth/callback`
});

const sessionStore = new SessionStore();

// ⚠️ DEVELOPMENT ONLY: In-memory storage
// Production deployments MUST use Redis or similar persistent store (see Phase 6)
// In-memory storage limitations:
// - Sessions lost on server restart
// - Cannot scale horizontally (no shared state between instances)
// - Not suitable for production workloads
const transports = new Map();

// Per-session Zendesk clients
// Each session gets its own client instance with OAuth tokens
const zendeskClients = new Map();

// Middleware
// ⚠️ SECURITY: Limit request body size to prevent DoS attacks
app.use(express.json({ limit: '1mb' }));

// CORS for development (localhost only)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Allow any localhost port for development
  if (origin && /^http:\/\/localhost:\d+$/.test(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
  res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Request logging (optional)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/**
 * Authenticate Bearer token and manage Zendesk token refresh
 * Follows MCP OAuth specification for WWW-Authenticate header format
 */
async function authenticateBearer(req, res, next) {
  const serverUrl = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;
  const prmUrl = `${serverUrl}/.well-known/oauth-protected-resource`;

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // MCP spec: Use resource_metadata parameter to point to Protected Resource Metadata
    const authenticateHeader = `Bearer realm="mcp", resource_metadata="${prmUrl}"`;

    return res.status(401)
      .header('WWW-Authenticate', authenticateHeader)
      .json({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header',
        hint: 'Visit /oauth/authorize to get an access token'
      });
  }

  const mcpAccessToken = authHeader.slice(7); // Remove "Bearer " prefix

  // Lookup session
  const session = sessionStore.getSession(mcpAccessToken);

  if (!session) {
    // No valid OAuth session found
    const authenticateHeader = `Bearer realm="mcp", resource_metadata="${prmUrl}"`;

    return res.status(401)
      .header('WWW-Authenticate', authenticateHeader)
      .json({
        error: 'unauthorized',
        message: 'Invalid or expired token',
        hint: 'Visit /oauth/authorize to get a new access token'
      });
  }

  // Check if MCP token is expired
  if (session.mcpTokenExpiry && Date.now() >= session.mcpTokenExpiry) {
    console.log(`[Auth] MCP token expired for session ${session.id}`);

    // Delete expired session
    sessionStore.deleteSession(mcpAccessToken);

    const authenticateHeader = `Bearer realm="mcp", resource_metadata="${prmUrl}"`;

    return res.status(401)
      .header('WWW-Authenticate', authenticateHeader)
      .json({
        error: 'unauthorized',
        message: 'Token expired',
        hint: 'Visit /oauth/authorize to get a new access token'
      });
  }

  // Check if Zendesk token needs refresh
  if (sessionStore.isZendeskTokenExpiring(session)) {
    try {
      console.log(`[Auth] Refreshing Zendesk token for session ${session.id}`);

      // Retry token refresh with exponential backoff (max 2 attempts)
      let lastError;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const newTokens = await oauth.refreshAccessToken(session.zendeskRefreshToken);
          sessionStore.updateZendeskTokens(mcpAccessToken, newTokens);
          console.log(`[Auth] Token refresh successful for session ${session.id}`);
          break; // Success - exit retry loop
        } catch (error) {
          lastError = error;

          // Don't retry on 4xx errors (invalid_grant, etc.) - permanent failures
          if (error.message && /4\d\d/.test(error.message)) {
            throw error;
          }

          // Transient error - retry with backoff
          if (attempt < 2) {
            const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 2000);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
      }

      // If we exhausted retries, throw the last error
      if (lastError) {
        throw lastError;
      }

    } catch (error) {
      console.error('[Auth] Token refresh failed:', error);

      // Token refresh failed - session is invalid
      sessionStore.deleteSession(mcpAccessToken);

      const authenticateHeader = `Bearer realm="mcp", resource_metadata="${prmUrl}"`;

      return res.status(401)
        .header('WWW-Authenticate', authenticateHeader)
        .json({
          error: 'unauthorized',
          message: 'Token refresh failed. Please re-authorize.',
          hint: 'Visit /oauth/authorize to get a new access token'
        });
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

/**
 * Get or create Zendesk client for the session
 */
function getOrCreateZendeskClient(session) {
  let client = zendeskClients.get(session.id);

  if (!client) {
    // Create new Zendesk client for this session
    client = new ZendeskClient();

    // Set OAuth access token from session
    if (session.zendeskAccessToken) {
      client.setAccessToken(
        session.zendeskAccessToken,
        session.zendeskTokenExpiry
      );
    }

    zendeskClients.set(session.id, client);
    console.log(`[Zendesk] Created client for session ${session.id}`);
  } else {
    // Update token in case it was refreshed
    if (session.zendeskAccessToken) {
      client.setAccessToken(
        session.zendeskAccessToken,
        session.zendeskTokenExpiry
      );
    }
  }

  return client;
}

/**
 * Get or create transport for the session
 */
function getOrCreateTransport(sessionId) {
  let transport = transports.get(sessionId);

  if (!transport) {
    // Create new transport for this session
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: (sid) => {
        console.log(`Session initialized: ${sid}`);
      },
      onsessionclosed: (sid) => {
        console.log(`Session closed: ${sid}`);
        transports.delete(sid);

        // Clean up Zendesk client for this session
        zendeskClients.delete(sid);
        clearZendeskClient(sid);
        console.log(`[Zendesk] Cleaned up client for session ${sid}`);
      }
    });

    transports.set(sessionId, transport);
  }

  return transport;
}

/**
 * ALL /mcp - Main MCP endpoint (handles GET, POST, DELETE)
 * StreamableHTTPServerTransport automatically routes by method:
 * - GET: Establishes SSE stream for server messages
 * - POST: Handles client JSON-RPC requests
 * - DELETE: Terminates session and cleans up
 */
app.all('/mcp', authenticateBearer, async (req, res) => {
  try {
    const sessionId = req.session.id;

    // Get or create Zendesk client for this session
    const zendeskClient = getOrCreateZendeskClient(req.session);

    // Store client so it can be accessed by tools
    storeZendeskClient(sessionId, zendeskClient);

    // Get or create transport for this session
    const transport = getOrCreateTransport(sessionId);

    // Initialize MCP server (idempotent)
    const server = await initializeServer();

    // Connect transport if not already connected
    // Note: server.connect() is idempotent in StreamableHTTPServerTransport
    if (!transport.isConnected) {
      await server.connect(transport);
      transport.isConnected = true;
    }

    // Handle the request within async context so tools can access session
    await runInContext(sessionId, async () => {
      await transport.handleRequest(req, res, req.body);
    });

  } catch (error) {
    console.error('MCP request error:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'internal_error',
        message: error.message
      });
    }
  }
});

/**
 * GET /oauth/authorize - Initiate OAuth flow
 * Redirects user to Zendesk authorization page
 * Accepts redirect_uri parameter from MCP client
 */
app.get('/oauth/authorize', (req, res) => {
  try {
    // Validate OAuth configuration
    if (!oauth.validateConfig()) {
      return res.status(500).json({
        error: 'server_error',
        message: 'OAuth not configured. Please set ZENDESK_OAUTH_CLIENT_ID, ZENDESK_OAUTH_CLIENT_SECRET, and ZENDESK_SUBDOMAIN'
      });
    }

    // Extract parameters from query (provided by MCP client)
    const clientRedirectUri = req.query.redirect_uri;
    const clientCodeChallenge = req.query.code_challenge;
    const clientCodeChallengeMethod = req.query.code_challenge_method;

    if (clientRedirectUri) {
      console.log(`[OAuth] Authorization request with client redirect_uri: ${clientRedirectUri}`);
    }
    if (clientCodeChallenge) {
      console.log(`[OAuth] Client provided code_challenge: ${clientCodeChallenge}`);
      console.log(`[OAuth] Challenge method: ${clientCodeChallengeMethod}`);
    }

    // Generate PKCE for Zendesk (our server-to-Zendesk flow)
    const { verifier: zendeskVerifier, challenge: zendeskChallenge } = oauth.generatePKCE();

    // Generate state for CSRF protection
    const state = generateState();

    // Create session with client's redirect URI and challenge
    const session = sessionStore.createOAuthSession(state, zendeskVerifier, clientRedirectUri, clientCodeChallenge);

    // Build authorization URL (using Zendesk PKCE challenge)
    const authUrl = oauth.getAuthorizationUrl(state, zendeskChallenge);

    console.log(`[OAuth] Starting authorization flow for session ${session.id}`);

    // Redirect to Zendesk
    res.redirect(authUrl);

  } catch (error) {
    console.error('[OAuth] Authorization error:', error);
    res.status(500).json({
      error: 'server_error',
      message: error.message
    });
  }
});

/**
 * GET /zendesk/oauth/callback - OAuth callback from Zendesk
 * Exchanges Zendesk authorization code for tokens, creates authorization code,
 * and redirects to client's redirect_uri
 */
app.get('/zendesk/oauth/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Check for authorization errors
    if (error) {
      return res.status(400).json({
        error: error,
        message: error_description || 'Authorization failed'
      });
    }

    // Validate required parameters
    if (!code || !state) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Missing code or state parameter'
      });
    }

    // Find session by state
    const session = sessionStore.getSessionByState(state);

    if (!session) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Invalid or expired state parameter'
      });
    }

    console.log(`[OAuth] Processing callback for session ${session.id}`);

    // Exchange Zendesk authorization code for tokens (using Zendesk verifier)
    const zendeskTokens = await oauth.exchangeCodeForTokens(code, session.zendeskVerifier);

    // Create authorization code for MCP client
    const authorizationCode = sessionStore.createAuthorizationCode(session, zendeskTokens);

    console.log(`[OAuth] Authorization successful for session ${session.id}`);

    // If client provided redirect_uri, redirect back to client with authorization code
    if (session.clientRedirectUri) {
      const redirectUrl = new URL(session.clientRedirectUri);
      redirectUrl.searchParams.set('code', authorizationCode);
      redirectUrl.searchParams.set('state', state);

      console.log(`[OAuth] Redirecting to client: ${redirectUrl.toString()}`);

      return res.redirect(redirectUrl.toString());
    }

    // Fallback: Display success page with authorization code
    // This is for backward compatibility and manual testing
    // ⚠️ SECURITY: Prevent token leakage via browser cache or referrer headers
    res
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .header('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'")
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY')
      .send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OAuth Authorization Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2e7d32;
      margin-top: 0;
    }
    .success-icon {
      font-size: 48px;
      margin-bottom: 20px;
    }
    .token-box {
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 15px;
      margin: 20px 0;
      word-break: break-all;
      font-family: 'Courier New', monospace;
      font-size: 14px;
    }
    .copy-btn {
      background: #1976d2;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 10px;
    }
    .copy-btn:hover {
      background: #1565c0;
    }
    .copy-btn:active {
      background: #0d47a1;
    }
    .info {
      background: #e3f2fd;
      border-left: 4px solid #1976d2;
      padding: 15px;
      margin: 20px 0;
    }
    .warning {
      background: #fff3e0;
      border-left: 4px solid #f57c00;
      padding: 15px;
      margin: 20px 0;
    }
    code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    ul {
      line-height: 1.8;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✅</div>
    <h1>Authorization Successful!</h1>
    <p>Your Zendesk MCP Server is now authorized and ready to use.</p>

    <div class="info">
      <strong>📋 Your Authorization Code:</strong>
      <div class="token-box" id="tokenBox">${authorizationCode}</div>
      <button class="copy-btn" onclick="copyToken()">📋 Copy Code</button>
      <div id="copyStatus" style="margin-top: 10px; color: #2e7d32; display: none;">✓ Code copied to clipboard!</div>
    </div>

    <div class="warning">
      <strong>⚠️ Security Notice:</strong>
      <ul>
        <li>This authorization code must be exchanged for an access token</li>
        <li>Code expires in 10 minutes</li>
        <li>Code can only be used once</li>
        <li>Close this window when done</li>
      </ul>
    </div>

    <h3>📝 Next Steps:</h3>
    <ol>
      <li>Copy the authorization code above</li>
      <li>Exchange it for an access token at the token endpoint:
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;"><code>POST http://localhost:3030/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=${authorizationCode}&code_verifier=YOUR_VERIFIER</code></pre>
      </li>
      <li>Use the received access token with:
        <code>Authorization: Bearer &lt;access_token&gt;</code>
      </li>
    </ol>

    <h3>🔧 Authorization Information:</h3>
    <ul>
      <li><strong>Code Type:</strong> Authorization Code</li>
      <li><strong>Expires In:</strong> 10 minutes</li>
      <li><strong>Scopes:</strong> ${zendeskTokens.scope}</li>
    </ul>

    <p style="margin-top: 30px; color: #666; font-size: 14px;">
      You can safely close this window now.
    </p>
  </div>

  <script>
    function copyToken() {
      const tokenText = document.getElementById('tokenBox').textContent;
      navigator.clipboard.writeText(tokenText).then(() => {
        const status = document.getElementById('copyStatus');
        status.style.display = 'block';
        setTimeout(() => {
          status.style.display = 'none';
        }, 3000);
      });
    }
  </script>
</body>
</html>
      `);

  } catch (error) {
    console.error('[OAuth] Callback error:', error);
    res.status(500).json({
      error: 'server_error',
      message: error.message
    });
  }
});

/**
 * POST /oauth/register - OAuth 2.0 Dynamic Client Registration (RFC 7591)
 *
 * Accepts client registration with redirect_uris and stores them.
 * Returns pre-configured client credentials with client's redirect URIs.
 */
app.post('/oauth/register', express.json(), (req, res) => {
  const serverUrl = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;
  const clientId = process.env.ZENDESK_OAUTH_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({
      error: 'server_error',
      error_description: 'OAuth client not configured on server'
    });
  }

  // Extract redirect_uris from request body
  const clientRedirectUris = req.body.redirect_uris || [];

  console.log('[OAuth] Client registration request with redirect_uris:', clientRedirectUris);

  // Store client registration
  sessionStore.registerClient(clientId, {
    redirect_uris: clientRedirectUris
  });

  // Return pre-configured public client (RFC 7591)
  res.status(201).json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),

    // Public client - no client_secret (uses PKCE)
    token_endpoint_auth_method: 'none',

    // Return client's redirect URIs
    redirect_uris: clientRedirectUris,

    // Grant types and response types
    grant_types: ['authorization_code'],
    response_types: ['code'],

    // Scopes
    scope: 'read write',

    // Additional metadata
    application_type: 'web',
    client_name: 'Zendesk MCP Server Client',
    client_uri: 'https://github.com/SShadowS/zendesk-mcp-server'
  });
});

/**
 * POST /oauth/token - OAuth 2.0 Token Endpoint
 *
 * Exchanges authorization code for MCP access token.
 * Implements RFC 6749 with PKCE verification (RFC 7636).
 */
app.post('/oauth/token', express.urlencoded({ extended: true }), express.json(), (req, res) => {
  try {
    const { grant_type, code, code_verifier, redirect_uri, client_id } = req.body;

    console.log('[OAuth] Token exchange request:', { grant_type, client_id, has_code: !!code, has_verifier: !!code_verifier });

    // Validate grant_type
    if (grant_type !== 'authorization_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant type is supported'
      });
    }

    // Validate required parameters
    if (!code || !code_verifier) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters: code and code_verifier are required'
      });
    }

    // Exchange authorization code for MCP access token
    const result = sessionStore.exchangeAuthorizationCode(code, code_verifier);

    if (!result) {
      // Invalid, expired, or already used authorization code
      console.log('[OAuth] Token exchange failed - code invalid, expired, or already used');
      console.log('[OAuth] Code provided:', code);
      console.log('[OAuth] Verifier provided:', code_verifier ? 'present' : 'missing');
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'The authorization code is invalid, expired, or has already been used'
      });
    }

    const { mcpAccessToken, mcpExpiresIn, session } = result;

    console.log(`[OAuth] Token exchange successful for session ${session.id}`);

    // Return token response (RFC 6749)
    res.json({
      access_token: mcpAccessToken,
      token_type: 'Bearer',
      expires_in: mcpExpiresIn,
      scope: session.scopes.join(' ')
    });

  } catch (error) {
    console.error('[OAuth] Token exchange error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error.message
    });
  }
});

/**
 * OAuth Authorization Server Metadata
 * Standard OAuth 2.0 discovery endpoint for MCP clients
 */
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const subdomain = process.env.ZENDESK_SUBDOMAIN;

  if (!subdomain) {
    return res.status(500).json({
      error: 'server_error',
      error_description: 'ZENDESK_SUBDOMAIN not configured'
    });
  }

  const serverUrl = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;

  res.json({
    // OAuth 2.0 Authorization Server Metadata (RFC 8414)
    issuer: serverUrl,
    authorization_endpoint: `${serverUrl}/oauth/authorize`,
    token_endpoint: `${serverUrl}/oauth/token`,
    registration_endpoint: `${serverUrl}/oauth/register`,

    // Supported grant types
    grant_types_supported: ['authorization_code'],

    // Supported response types
    response_types_supported: ['code'],

    // Supported response modes
    response_modes_supported: ['query'],

    // Supported scopes
    scopes_supported: ['read', 'write'],

    // PKCE support (RFC 7636)
    code_challenge_methods_supported: ['S256'],

    // Additional metadata
    service_documentation: 'https://github.com/SShadowS/zendesk-mcp-server'
  });
});

/**
 * Protected Resource Metadata (RFC9728)
 * Tells MCP clients which authorization servers to use
 */
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  const subdomain = process.env.ZENDESK_SUBDOMAIN;

  if (!subdomain) {
    return res.status(500).json({
      error: 'server_error',
      error_description: 'ZENDESK_SUBDOMAIN not configured'
    });
  }

  const serverUrl = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;

  res.json({
    // Resource identifier (canonical URI of this MCP server)
    resource: `${serverUrl}/mcp`,

    // Authorization servers (RFC 9728 requires array of issuer URI strings)
    // Points to this MCP server as the OAuth authorization server
    authorization_servers: [serverUrl],

    // Supported scopes
    scopes_supported: ['read', 'write'],

    // Bearer token authentication required
    bearer_methods_supported: ['header'],

    // This resource server metadata
    resource_documentation: 'https://github.com/SShadowS/zendesk-mcp-server'
  });
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'zendesk-mcp-server',
    transport: 'streamable-http',
    timestamp: new Date().toISOString()
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `Endpoint not found: ${req.method} ${req.path}`
  });
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    error: 'internal_error',
    message: err.message || 'An unexpected error occurred'
  });
});

/**
 * Start the server
 */
export async function startHttpServer() {
  // Test Zendesk connection on startup
  try {
    await initializeServer();
    console.log('✓ Zendesk MCP Server initialized');
  } catch (error) {
    console.warn('⚠ Warning: Server initialization failed:', error.message);
    console.warn('⚠ Server will start but API calls may fail');
  }

  app.listen(PORT, () => {
    console.log(`🚀 Zendesk MCP Server listening on http://localhost:${PORT}`);
    console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`🔐 OAuth flow will be available in Phase 4`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  });
}
