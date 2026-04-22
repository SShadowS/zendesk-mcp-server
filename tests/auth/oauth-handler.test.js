import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { OAuthHandler } from '../../src/auth/oauth-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  subdomain: 'testcompany',
  redirectUri: 'http://localhost:3030/zendesk/oauth/callback',
};

function createHandler(overrides = {}) {
  return new OAuthHandler({ ...validConfig, ...overrides });
}

/**
 * Build a mock fetch that returns a successful JSON response by default.
 * Callers can override the response or make it fail.
 */
function mockFetchResponse(body, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(body),
  });
}

/**
 * Build a mock fetch where response.json() rejects (e.g. non-JSON body).
 */
function mockFetchResponseJsonFails({ ok = false, status = 500, statusText = 'Internal Server Error' } = {}) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText,
    json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON')),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// constructor
// ---------------------------------------------------------------------------
describe('OAuthHandler constructor', () => {
  it('creates an instance with valid config and sets all properties', () => {
    const handler = createHandler();

    expect(handler.clientId).toBe(validConfig.clientId);
    expect(handler.clientSecret).toBe(validConfig.clientSecret);
    expect(handler.redirectUri).toBe(validConfig.redirectUri);
    expect(handler.subdomain).toBe(validConfig.subdomain);
    expect(handler.baseUrl).toBe('https://testcompany.zendesk.com');
  });

  it('throws when clientId is missing', () => {
    expect(() => new OAuthHandler({
      clientSecret: 'secret',
      subdomain: 'sub',
    })).toThrow('Missing required OAuth configuration');
  });

  it('throws when clientSecret is missing', () => {
    expect(() => new OAuthHandler({
      clientId: 'id',
      subdomain: 'sub',
    })).toThrow('Missing required OAuth configuration');
  });

  it('throws when subdomain is missing', () => {
    expect(() => new OAuthHandler({
      clientId: 'id',
      clientSecret: 'secret',
    })).toThrow('Missing required OAuth configuration');
  });

  it('uses default redirectUri when not provided', () => {
    const handler = new OAuthHandler({
      clientId: 'id',
      clientSecret: 'secret',
      subdomain: 'sub',
    });

    expect(handler.redirectUri).toBe('http://localhost:3030/zendesk/oauth/callback');
  });

  it('uses custom redirectUri when provided', () => {
    const handler = createHandler({
      redirectUri: 'https://myapp.example.com/callback',
    });

    expect(handler.redirectUri).toBe('https://myapp.example.com/callback');
  });

  it('constructs correct baseUrl from subdomain', () => {
    const handler = createHandler({ subdomain: 'acme-corp' });

    expect(handler.baseUrl).toBe('https://acme-corp.zendesk.com');
  });
});

// ---------------------------------------------------------------------------
// generatePKCE()
// ---------------------------------------------------------------------------
describe('OAuthHandler.generatePKCE()', () => {
  it('returns an object with verifier and challenge strings', () => {
    const handler = createHandler();
    const pkce = handler.generatePKCE();

    expect(pkce).toHaveProperty('verifier');
    expect(pkce).toHaveProperty('challenge');
    expect(typeof pkce.verifier).toBe('string');
    expect(typeof pkce.challenge).toBe('string');
    expect(pkce.verifier.length).toBeGreaterThan(0);
    expect(pkce.challenge.length).toBeGreaterThan(0);
  });

  it('verifier is base64url encoded (no +, /, = characters)', () => {
    const handler = createHandler();
    const { verifier } = handler.generatePKCE();

    expect(verifier).not.toMatch(/[+/=]/);
    // base64url only contains [A-Za-z0-9_-]
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('challenge is SHA256 of verifier encoded as base64url', () => {
    const handler = createHandler();
    const { verifier, challenge } = handler.generatePKCE();

    const expectedChallenge = createHash('sha256')
      .update(verifier)
      .digest('base64url');

    expect(challenge).toBe(expectedChallenge);
  });

  it('each call returns different values (randomness)', () => {
    const handler = createHandler();
    const first = handler.generatePKCE();
    const second = handler.generatePKCE();

    expect(first.verifier).not.toBe(second.verifier);
    expect(first.challenge).not.toBe(second.challenge);
  });
});

// ---------------------------------------------------------------------------
// getAuthorizationUrl()
// ---------------------------------------------------------------------------
describe('OAuthHandler.getAuthorizationUrl()', () => {
  it('returns URL with correct base path', () => {
    const handler = createHandler();
    const url = handler.getAuthorizationUrl('test-state', 'test-challenge');

    expect(url).toMatch(/^https:\/\/testcompany\.zendesk\.com\/oauth\/authorizations\/new\?/);
  });

  it('includes all required query params', () => {
    const handler = createHandler();
    const url = handler.getAuthorizationUrl('my-state', 'my-challenge');
    const parsed = new URL(url);

    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe(validConfig.clientId);
    expect(parsed.searchParams.get('redirect_uri')).toBe(validConfig.redirectUri);
    expect(parsed.searchParams.get('scope')).toBe('read write');
    expect(parsed.searchParams.get('state')).toBe('my-state');
    expect(parsed.searchParams.get('code_challenge')).toBe('my-challenge');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('uses default scopes read and write when not specified', () => {
    const handler = createHandler();
    const url = handler.getAuthorizationUrl('state', 'challenge');
    const parsed = new URL(url);

    expect(parsed.searchParams.get('scope')).toBe('read write');
  });

  it('accepts custom scopes', () => {
    const handler = createHandler();
    const url = handler.getAuthorizationUrl('state', 'challenge', ['read', 'write', 'impersonate']);
    const parsed = new URL(url);

    expect(parsed.searchParams.get('scope')).toBe('read write impersonate');
  });
});

// ---------------------------------------------------------------------------
// exchangeCodeForTokens()
// ---------------------------------------------------------------------------
describe('OAuthHandler.exchangeCodeForTokens()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns token object on success', async () => {
    const tokenResponse = {
      access_token: 'abc123',
      refresh_token: 'refresh456',
      token_type: 'Bearer',
      expires_in: 7200,
    };
    vi.stubGlobal('fetch', mockFetchResponse(tokenResponse));

    const handler = createHandler();
    const result = await handler.exchangeCodeForTokens('auth-code', 'verifier');

    expect(result).toEqual(tokenResponse);
  });

  it('sends correct body params to the token endpoint', async () => {
    const tokenResponse = { access_token: 'tok', token_type: 'Bearer' };
    const mockFetch = mockFetchResponse(tokenResponse);
    vi.stubGlobal('fetch', mockFetch);

    const handler = createHandler();
    await handler.exchangeCodeForTokens('my-code', 'my-verifier');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe('https://testcompany.zendesk.com/oauth/tokens');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['Accept']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.grant_type).toBe('authorization_code');
    expect(body.code).toBe('my-code');
    expect(body.client_id).toBe(validConfig.clientId);
    expect(body.client_secret).toBe(validConfig.clientSecret);
    expect(body.redirect_uri).toBe(validConfig.redirectUri);
    expect(body.code_verifier).toBe('my-verifier');
  });

  it('throws with status and error_description on HTTP error', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(
      { error: 'invalid_grant', error_description: 'The authorization code has expired' },
      { ok: false, status: 400, statusText: 'Bad Request' },
    ));

    const handler = createHandler();

    await expect(handler.exchangeCodeForTokens('bad-code', 'verifier'))
      .rejects
      .toThrow('Token exchange failed: 400 - The authorization code has expired');
  });

  it('throws with error field when error_description is absent', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(
      { error: 'invalid_client' },
      { ok: false, status: 401, statusText: 'Unauthorized' },
    ));

    const handler = createHandler();

    await expect(handler.exchangeCodeForTokens('code', 'verifier'))
      .rejects
      .toThrow('Token exchange failed: 401 - invalid_client');
  });

  it('throws with statusText when JSON body cannot be parsed', async () => {
    vi.stubGlobal('fetch', mockFetchResponseJsonFails({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    }));

    const handler = createHandler();

    await expect(handler.exchangeCodeForTokens('code', 'verifier'))
      .rejects
      .toThrow('Token exchange failed: 502 - Bad Gateway');
  });

  it('throws when access_token is missing from response', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ token_type: 'Bearer' }));

    const handler = createHandler();

    await expect(handler.exchangeCodeForTokens('code', 'verifier'))
      .rejects
      .toThrow('Invalid token response: missing access_token');
  });

  it('throws when token_type is not Bearer', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({
      access_token: 'tok',
      token_type: 'MAC',
    }));

    const handler = createHandler();

    await expect(handler.exchangeCodeForTokens('code', 'verifier'))
      .rejects
      .toThrow('Invalid token response: expected token_type "Bearer", got "MAC"');
  });

  it('accepts response without token_type field (only access_token required)', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ access_token: 'tok' }));

    const handler = createHandler();
    const result = await handler.exchangeCodeForTokens('code', 'verifier');

    expect(result.access_token).toBe('tok');
  });
});

// ---------------------------------------------------------------------------
// refreshAccessToken()
// ---------------------------------------------------------------------------
describe('OAuthHandler.refreshAccessToken()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns token object on success', async () => {
    const tokenResponse = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      token_type: 'Bearer',
      expires_in: 7200,
    };
    vi.stubGlobal('fetch', mockFetchResponse(tokenResponse));

    const handler = createHandler();
    const result = await handler.refreshAccessToken('old-refresh-token');

    expect(result).toEqual(tokenResponse);
  });

  it('sends correct body params to the token endpoint', async () => {
    const mockFetch = mockFetchResponse({ access_token: 'tok', token_type: 'Bearer' });
    vi.stubGlobal('fetch', mockFetch);

    const handler = createHandler();
    await handler.refreshAccessToken('my-refresh-token');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe('https://testcompany.zendesk.com/oauth/tokens');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.grant_type).toBe('refresh_token');
    expect(body.refresh_token).toBe('my-refresh-token');
    expect(body.client_id).toBe(validConfig.clientId);
    expect(body.client_secret).toBe(validConfig.clientSecret);
    // refreshAccessToken does NOT send redirect_uri or code_verifier
    expect(body.redirect_uri).toBeUndefined();
    expect(body.code_verifier).toBeUndefined();
  });

  it('throws with error message on HTTP error', async () => {
    vi.stubGlobal('fetch', mockFetchResponse(
      { error: 'invalid_grant', error_description: 'Refresh token has been revoked' },
      { ok: false, status: 401, statusText: 'Unauthorized' },
    ));

    const handler = createHandler();

    await expect(handler.refreshAccessToken('revoked-token'))
      .rejects
      .toThrow('Token refresh failed: 401 - Refresh token has been revoked');
  });

  it('throws with statusText when JSON body cannot be parsed', async () => {
    vi.stubGlobal('fetch', mockFetchResponseJsonFails({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    }));

    const handler = createHandler();

    await expect(handler.refreshAccessToken('token'))
      .rejects
      .toThrow('Token refresh failed: 503 - Service Unavailable');
  });

  it('throws when access_token is missing from response', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ token_type: 'Bearer' }));

    const handler = createHandler();

    await expect(handler.refreshAccessToken('token'))
      .rejects
      .toThrow('Invalid token response: missing access_token');
  });

  it('throws when token_type is not Bearer', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({
      access_token: 'tok',
      token_type: 'Basic',
    }));

    const handler = createHandler();

    await expect(handler.refreshAccessToken('token'))
      .rejects
      .toThrow('Invalid token response: expected token_type "Bearer", got "Basic"');
  });
});

// ---------------------------------------------------------------------------
// validateConfig()
// ---------------------------------------------------------------------------
describe('OAuthHandler.validateConfig()', () => {
  it('returns true for a valid config', () => {
    const handler = createHandler();

    expect(handler.validateConfig()).toBe(true);
  });

  it('returns false when clientId is cleared', () => {
    const handler = createHandler();
    handler.clientId = '';

    expect(handler.validateConfig()).toBe(false);
  });

  it('returns false when clientSecret is cleared', () => {
    const handler = createHandler();
    handler.clientSecret = '';

    expect(handler.validateConfig()).toBe(false);
  });

  it('returns false when subdomain is cleared', () => {
    const handler = createHandler();
    handler.subdomain = '';

    expect(handler.validateConfig()).toBe(false);
  });

  it('returns false when clientId is set to null', () => {
    const handler = createHandler();
    handler.clientId = null;

    expect(handler.validateConfig()).toBe(false);
  });
});
