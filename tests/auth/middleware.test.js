import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAuthMiddleware } from '../../src/auth/middleware.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    status(code) { res.statusCode = code; return res; },
    header(name, value) { res.headers[name] = value; return res; },
    json(data) { res.body = data; return res; },
  };
  return res;
}

function createMockSessionStore(overrides = {}) {
  return {
    getSession: vi.fn(),
    deleteSession: vi.fn(),
    updateZendeskTokens: vi.fn(),
    isZendeskTokenExpiring: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

function createMockOAuth(overrides = {}) {
  return {
    refreshAccessToken: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.SERVER_BASE_URL;
});

// ---------------------------------------------------------------------------
// buildAuthenticateHeader
// ---------------------------------------------------------------------------
describe('buildAuthenticateHeader', () => {
  it('returns correct Bearer realm string with PRM URL', () => {
    const sessionStore = createMockSessionStore();
    const oauth = createMockOAuth();
    const { buildAuthenticateHeader } = createAuthMiddleware({ sessionStore, oauth });

    const result = buildAuthenticateHeader('https://example.com/.well-known/oauth-protected-resource');

    expect(result).toBe('Bearer realm="mcp", resource_metadata="https://example.com/.well-known/oauth-protected-resource"');
  });
});

// ---------------------------------------------------------------------------
// sendUnauthorizedResponse
// ---------------------------------------------------------------------------
describe('sendUnauthorizedResponse', () => {
  let sessionStore;
  let oauth;
  let middleware;

  beforeEach(() => {
    sessionStore = createMockSessionStore();
    oauth = createMockOAuth();
    middleware = createAuthMiddleware({ sessionStore, oauth });
  });

  it('sets status 401, WWW-Authenticate header, and JSON body with error/message/hint', () => {
    const res = createMockRes();
    const prmUrl = 'https://example.com/.well-known/oauth-protected-resource';

    middleware.sendUnauthorizedResponse(res, prmUrl, 'Token missing');

    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toBe(
      `Bearer realm="mcp", resource_metadata="${prmUrl}"`
    );
    expect(res.body).toEqual({
      error: 'unauthorized',
      message: 'Token missing',
      hint: 'Visit /oauth/authorize to get an access token',
    });
  });

  it('uses default hint when not provided', () => {
    const res = createMockRes();

    middleware.sendUnauthorizedResponse(res, 'https://x.com/prm', 'No token');

    expect(res.body.hint).toBe('Visit /oauth/authorize to get an access token');
  });

  it('uses custom hint when provided', () => {
    const res = createMockRes();

    middleware.sendUnauthorizedResponse(res, 'https://x.com/prm', 'Expired', 'Re-authorize now');

    expect(res.body.hint).toBe('Re-authorize now');
  });
});

// ---------------------------------------------------------------------------
// insufficientScope
// ---------------------------------------------------------------------------
describe('insufficientScope', () => {
  let middleware;

  beforeEach(() => {
    middleware = createAuthMiddleware({
      sessionStore: createMockSessionStore(),
      oauth: createMockOAuth(),
    });
  });

  it('sets status 403', () => {
    const res = createMockRes();

    middleware.insufficientScope(res, ['read', 'write']);

    expect(res.statusCode).toBe(403);
  });

  it('WWW-Authenticate header includes realm, scope, error, error_description', () => {
    const res = createMockRes();

    middleware.insufficientScope(res, ['read', 'write']);

    const header = res.headers['WWW-Authenticate'];
    expect(header).toContain('Bearer realm="zendesk-mcp"');
    expect(header).toContain('scope="read write"');
    expect(header).toContain('error="insufficient_scope"');
    expect(header).toContain('error_description="The access token does not have the required scope"');
  });

  it('JSON body has error, message, and required_scopes', () => {
    const res = createMockRes();

    middleware.insufficientScope(res, ['read', 'write', 'impersonate']);

    expect(res.body).toEqual({
      error: 'insufficient_scope',
      message: 'The access token does not have the required scope',
      required_scopes: ['read', 'write', 'impersonate'],
    });
  });
});

// ---------------------------------------------------------------------------
// refreshZendeskTokenWithRetry
// ---------------------------------------------------------------------------
describe('refreshZendeskTokenWithRetry', () => {
  let sessionStore;
  let oauth;
  let middleware;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStore = createMockSessionStore();
    oauth = createMockOAuth();
    middleware = createAuthMiddleware({ sessionStore, oauth });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds on first attempt: calls oauth.refreshAccessToken and sessionStore.updateZendeskTokens, returns true', async () => {
    const newTokens = { access_token: 'new-token', refresh_token: 'new-refresh' };
    oauth.refreshAccessToken.mockResolvedValue(newTokens);

    const session = { id: 'sess-1', zendeskRefreshToken: 'old-refresh' };
    const result = await middleware.refreshZendeskTokenWithRetry(session, 'mcp_token_123');

    expect(result).toBe(true);
    expect(oauth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(oauth.refreshAccessToken).toHaveBeenCalledWith('old-refresh');
    expect(sessionStore.updateZendeskTokens).toHaveBeenCalledTimes(1);
    expect(sessionStore.updateZendeskTokens).toHaveBeenCalledWith('mcp_token_123', newTokens);
  });

  it('succeeds on retry after transient error on first attempt', async () => {
    const newTokens = { access_token: 'tok', refresh_token: 'ref' };
    oauth.refreshAccessToken
      .mockRejectedValueOnce(new Error('500 Server Error'))
      .mockResolvedValueOnce(newTokens);

    const session = { id: 'sess-2', zendeskRefreshToken: 'refresh-tok' };
    const promise = middleware.refreshZendeskTokenWithRetry(session, 'mcp_abc');

    // Advance past the backoff delay (1000ms for attempt 1)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;

    expect(result).toBe(true);
    expect(oauth.refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(sessionStore.updateZendeskTokens).toHaveBeenCalledTimes(1);
    expect(sessionStore.updateZendeskTokens).toHaveBeenCalledWith('mcp_abc', newTokens);
  });

  it('throws immediately on 4xx error without retry', async () => {
    const error = new Error('Token refresh failed: 401 - invalid_grant');
    oauth.refreshAccessToken.mockRejectedValue(error);

    const session = { id: 'sess-3', zendeskRefreshToken: 'bad-refresh' };

    await expect(middleware.refreshZendeskTokenWithRetry(session, 'mcp_xyz'))
      .rejects
      .toThrow('Token refresh failed: 401 - invalid_grant');

    expect(oauth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(sessionStore.updateZendeskTokens).not.toHaveBeenCalled();
  });

  it('throws last error when all attempts fail with transient errors', async () => {
    // Use real timers for this test to avoid unhandled rejection warnings
    // caused by fake timer microtask scheduling gaps
    vi.useRealTimers();

    const error1 = new Error('500 Server Error');
    const error2 = new Error('503 Service Unavailable');

    // Rebuild middleware with real timers active
    const localOAuth = createMockOAuth();
    const localStore = createMockSessionStore();
    localOAuth.refreshAccessToken
      .mockRejectedValueOnce(error1)
      .mockRejectedValueOnce(error2);
    const localMiddleware = createAuthMiddleware({ sessionStore: localStore, oauth: localOAuth });

    const session = { id: 'sess-4', zendeskRefreshToken: 'refresh-tok' };

    await expect(localMiddleware.refreshZendeskTokenWithRetry(session, 'mcp_fail'))
      .rejects.toThrow('503 Service Unavailable');
    expect(localOAuth.refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(localStore.updateZendeskTokens).not.toHaveBeenCalled();

    // Restore fake timers for any remaining tests in this block
    vi.useFakeTimers();
  });
});

// ---------------------------------------------------------------------------
// authenticateBearer
// ---------------------------------------------------------------------------
describe('authenticateBearer', () => {
  let sessionStore;
  let oauth;
  let middleware;
  let next;

  beforeEach(() => {
    sessionStore = createMockSessionStore();
    oauth = createMockOAuth();
    middleware = createAuthMiddleware({ sessionStore, oauth, port: 4000 });
    next = vi.fn();
    delete process.env.SERVER_BASE_URL;
  });

  it('returns 401 when authorization header is missing', async () => {
    const req = { headers: {} };
    const res = createMockRes();

    await middleware.authenticateBearer(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Missing or invalid Authorization header');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for non-Bearer authorization header', async () => {
    const req = { headers: { authorization: 'Basic xyz' } };
    const res = createMockRes();

    await middleware.authenticateBearer(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Missing or invalid Authorization header');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when session is not found for the token', async () => {
    sessionStore.getSession.mockReturnValue(null);
    const req = { headers: { authorization: 'Bearer mcp_invalid_token' } };
    const res = createMockRes();

    await middleware.authenticateBearer(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Invalid or expired token');
    expect(res.body.hint).toBe('Visit /oauth/authorize to get a new access token');
    expect(sessionStore.getSession).toHaveBeenCalledWith('mcp_invalid_token');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 and deletes session when MCP token is expired', async () => {
    const expiredSession = {
      id: 'sess-expired',
      mcpTokenExpiry: Date.now() - 1000,
    };
    sessionStore.getSession.mockReturnValue(expiredSession);
    const req = { headers: { authorization: 'Bearer mcp_expired' } };
    const res = createMockRes();

    await middleware.authenticateBearer(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Token expired');
    expect(sessionStore.deleteSession).toHaveBeenCalledWith('mcp_expired');
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.session and req.mcpAccessToken and calls next when token is valid and Zendesk is not expiring', async () => {
    const validSession = {
      id: 'sess-valid',
      mcpTokenExpiry: Date.now() + 60000,
    };
    sessionStore.getSession.mockReturnValue(validSession);
    sessionStore.isZendeskTokenExpiring.mockReturnValue(false);
    const req = { headers: { authorization: 'Bearer mcp_valid_token' } };
    const res = createMockRes();

    await middleware.authenticateBearer(req, res, next);

    expect(req.session).toBe(validSession);
    expect(req.mcpAccessToken).toBe('mcp_valid_token');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  it('refreshes Zendesk token and calls next when token is expiring and refresh succeeds', async () => {
    const session = {
      id: 'sess-refresh',
      mcpTokenExpiry: Date.now() + 60000,
      zendeskRefreshToken: 'zen-refresh',
    };
    sessionStore.getSession.mockReturnValue(session);
    sessionStore.isZendeskTokenExpiring.mockReturnValue(true);
    oauth.refreshAccessToken.mockResolvedValue({
      access_token: 'new-zen-token',
      refresh_token: 'new-zen-refresh',
    });

    const req = { headers: { authorization: 'Bearer mcp_refreshing' } };
    const res = createMockRes();

    await middleware.authenticateBearer(req, res, next);

    expect(oauth.refreshAccessToken).toHaveBeenCalledWith('zen-refresh');
    expect(sessionStore.updateZendeskTokens).toHaveBeenCalled();
    expect(req.session).toBe(session);
    expect(req.mcpAccessToken).toBe('mcp_refreshing');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 401 and deletes session when Zendesk token refresh fails', async () => {
    const session = {
      id: 'sess-refresh-fail',
      mcpTokenExpiry: Date.now() + 60000,
      zendeskRefreshToken: 'zen-refresh',
    };
    sessionStore.getSession.mockReturnValue(session);
    sessionStore.isZendeskTokenExpiring.mockReturnValue(true);
    oauth.refreshAccessToken.mockRejectedValue(new Error('Token refresh failed: 401 - invalid_grant'));

    const req = { headers: { authorization: 'Bearer mcp_fail_refresh' } };
    const res = createMockRes();

    await middleware.authenticateBearer(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Token refresh failed. Please re-authorize.');
    expect(sessionStore.deleteSession).toHaveBeenCalledWith('mcp_fail_refresh');
    expect(next).not.toHaveBeenCalled();
  });

  it('uses SERVER_BASE_URL env var for PRM URL when set', async () => {
    process.env.SERVER_BASE_URL = 'https://myapp.example.com';

    const req = { headers: {} };
    const res = createMockRes();

    await middleware.authenticateBearer(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toContain(
      'https://myapp.example.com/.well-known/oauth-protected-resource'
    );
  });

  it('uses localhost with port for PRM URL when SERVER_BASE_URL is not set', async () => {
    const req = { headers: {} };
    const res = createMockRes();

    await middleware.authenticateBearer(req, res, next);

    expect(res.headers['WWW-Authenticate']).toContain(
      'http://localhost:4000/.well-known/oauth-protected-resource'
    );
  });

  it('calls next without refresh when session has no mcpTokenExpiry (non-expiring token)', async () => {
    const session = {
      id: 'sess-no-expiry',
      // mcpTokenExpiry is undefined
    };
    sessionStore.getSession.mockReturnValue(session);
    sessionStore.isZendeskTokenExpiring.mockReturnValue(false);

    const req = { headers: { authorization: 'Bearer mcp_no_expiry' } };
    const res = createMockRes();

    await middleware.authenticateBearer(req, res, next);

    expect(req.session).toBe(session);
    expect(next).toHaveBeenCalledTimes(1);
    expect(sessionStore.deleteSession).not.toHaveBeenCalled();
  });
});
