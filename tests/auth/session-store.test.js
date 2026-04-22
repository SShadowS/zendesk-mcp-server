import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { SessionStore } from '../../src/auth/session-store.js';

let store;

beforeEach(() => {
  vi.useFakeTimers();
  // Suppress console.warn from constructor
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  store = new SessionStore();
});

afterEach(() => {
  store.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// constructor
// ---------------------------------------------------------------------------
describe('SessionStore constructor', () => {
  it('creates instance with empty maps', () => {
    expect(store.sessions).toBeInstanceOf(Map);
    expect(store.sessions.size).toBe(0);
    expect(store.sessionsByState).toBeInstanceOf(Map);
    expect(store.sessionsByState.size).toBe(0);
    expect(store.authorizationCodes).toBeInstanceOf(Map);
    expect(store.authorizationCodes.size).toBe(0);
    expect(store.registeredClients).toBeInstanceOf(Map);
    expect(store.registeredClients.size).toBe(0);
  });

  it('starts cleanup interval', () => {
    expect(store.cleanupInterval).toBeDefined();
  });

  it('runs cleanup every hour via interval', () => {
    const cleanupSpy = vi.spyOn(store, 'cleanup');

    // Advance 1 hour
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(cleanupSpy).toHaveBeenCalledTimes(1);

    // Advance another hour
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(cleanupSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// createOAuthSession()
// ---------------------------------------------------------------------------
describe('createOAuthSession()', () => {
  it('returns session with all expected fields', () => {
    const session = store.createOAuthSession('state123', 'verifier456');

    expect(session).toMatchObject({
      state: 'state123',
      zendeskVerifier: 'verifier456',
      clientRedirectUri: null,
      clientCodeChallenge: null,
      clientState: null,
      zendeskAccessToken: null,
      zendeskRefreshToken: null,
      zendeskTokenExpiry: null,
      mcpAccessToken: null,
      mcpTokenExpiry: null,
      scopes: [],
    });
    expect(session.id).toBeDefined();
    expect(typeof session.id).toBe('string');
    expect(session.createdAt).toBeDefined();
    expect(typeof session.createdAt).toBe('number');
  });

  it('generates unique session ids', () => {
    const s1 = store.createOAuthSession('state1', 'v1');
    const s2 = store.createOAuthSession('state2', 'v2');
    expect(s1.id).not.toBe(s2.id);
  });

  it('stores session in sessionsByState map', () => {
    store.createOAuthSession('mystate', 'myverifier');
    expect(store.sessionsByState.has('mystate')).toBe(true);
    expect(store.sessionsByState.get('mystate').state).toBe('mystate');
  });

  it('accepts optional parameters', () => {
    const session = store.createOAuthSession(
      'state',
      'verifier',
      'http://localhost/callback',
      'challenge123',
      'client-state-xyz'
    );

    expect(session.clientRedirectUri).toBe('http://localhost/callback');
    expect(session.clientCodeChallenge).toBe('challenge123');
    expect(session.clientState).toBe('client-state-xyz');
  });

  it('defaults optional params to null', () => {
    const session = store.createOAuthSession('s', 'v');
    expect(session.clientRedirectUri).toBeNull();
    expect(session.clientCodeChallenge).toBeNull();
    expect(session.clientState).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getSessionByState()
// ---------------------------------------------------------------------------
describe('getSessionByState()', () => {
  it('returns session for known state', () => {
    const created = store.createOAuthSession('known', 'v');
    const found = store.getSessionByState('known');
    expect(found).toBe(created);
  });

  it('returns null for unknown state', () => {
    expect(store.getSessionByState('nonexistent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// completeOAuthFlow()
// ---------------------------------------------------------------------------
describe('completeOAuthFlow()', () => {
  const fakeTokens = {
    access_token: 'zendesk_access_abc',
    refresh_token: 'zendesk_refresh_xyz',
    expires_in: 7200,
    scope: 'read write',
  };

  it('generates mcpAccessToken starting with mcp_', () => {
    const session = store.createOAuthSession('s', 'v');
    const result = store.completeOAuthFlow(session, fakeTokens);
    expect(result.mcpAccessToken).toMatch(/^mcp_/);
  });

  it('returns mcpExpiresIn of 86400 (24 hours)', () => {
    const session = store.createOAuthSession('s', 'v');
    const result = store.completeOAuthFlow(session, fakeTokens);
    expect(result.mcpExpiresIn).toBe(86400);
  });

  it('stores session in sessions map by MCP token', () => {
    const session = store.createOAuthSession('s', 'v');
    const result = store.completeOAuthFlow(session, fakeTokens);
    expect(store.sessions.has(result.mcpAccessToken)).toBe(true);
    expect(store.sessions.get(result.mcpAccessToken)).toBe(session);
  });

  it('removes session from sessionsByState', () => {
    const session = store.createOAuthSession('s', 'v');
    expect(store.sessionsByState.has('s')).toBe(true);
    store.completeOAuthFlow(session, fakeTokens);
    expect(store.sessionsByState.has('s')).toBe(false);
  });

  it('sets all token fields on session', () => {
    const session = store.createOAuthSession('s', 'v');
    const result = store.completeOAuthFlow(session, fakeTokens);

    expect(session.zendeskAccessToken).toBe('zendesk_access_abc');
    expect(session.zendeskRefreshToken).toBe('zendesk_refresh_xyz');
    expect(session.zendeskTokenExpiry).toBeGreaterThan(Date.now());
    expect(session.mcpAccessToken).toBe(result.mcpAccessToken);
    expect(session.mcpTokenExpiry).toBeGreaterThan(Date.now());
  });

  it('parses scope string into array', () => {
    const session = store.createOAuthSession('s', 'v');
    store.completeOAuthFlow(session, fakeTokens);
    expect(session.scopes).toEqual(['read', 'write']);
  });

  it('handles empty scope string', () => {
    const session = store.createOAuthSession('s', 'v');
    store.completeOAuthFlow(session, { ...fakeTokens, scope: '' });
    expect(session.scopes).toEqual([]);
  });

  it('handles missing scope field', () => {
    const session = store.createOAuthSession('s', 'v');
    const { scope, ...tokensNoScope } = fakeTokens;
    store.completeOAuthFlow(session, tokensNoScope);
    expect(session.scopes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getSession()
// ---------------------------------------------------------------------------
describe('getSession()', () => {
  it('returns session by MCP token', () => {
    const session = store.createOAuthSession('s', 'v');
    const { mcpAccessToken } = store.completeOAuthFlow(session, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 7200,
      scope: 'read',
    });
    const found = store.getSession(mcpAccessToken);
    expect(found).toBe(session);
  });

  it('returns null for unknown MCP token', () => {
    expect(store.getSession('mcp_nonexistent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateZendeskTokens()
// ---------------------------------------------------------------------------
describe('updateZendeskTokens()', () => {
  let mcpToken;
  let session;

  beforeEach(() => {
    session = store.createOAuthSession('s', 'v');
    const result = store.completeOAuthFlow(session, {
      access_token: 'old_access',
      refresh_token: 'old_refresh',
      expires_in: 7200,
      scope: 'read',
    });
    mcpToken = result.mcpAccessToken;
  });

  it('updates access token and expiry', () => {
    store.updateZendeskTokens(mcpToken, {
      access_token: 'new_access',
      expires_in: 3600,
    });

    expect(session.zendeskAccessToken).toBe('new_access');
    expect(session.zendeskTokenExpiry).toBeGreaterThan(Date.now());
  });

  it('updates refresh token if provided', () => {
    store.updateZendeskTokens(mcpToken, {
      access_token: 'new_access',
      refresh_token: 'new_refresh',
      expires_in: 3600,
    });

    expect(session.zendeskRefreshToken).toBe('new_refresh');
  });

  it('does not overwrite refresh token if not in new tokens', () => {
    store.updateZendeskTokens(mcpToken, {
      access_token: 'new_access',
      expires_in: 3600,
    });

    expect(session.zendeskRefreshToken).toBe('old_refresh');
  });

  it('no-op for unknown MCP token', () => {
    // Should not throw
    store.updateZendeskTokens('mcp_unknown', {
      access_token: 'x',
      expires_in: 100,
    });
  });
});

// ---------------------------------------------------------------------------
// isZendeskTokenExpiring()
// ---------------------------------------------------------------------------
describe('isZendeskTokenExpiring()', () => {
  it('returns true when no expiry set', () => {
    const session = { zendeskTokenExpiry: null };
    expect(store.isZendeskTokenExpiring(session)).toBe(true);
  });

  it('returns true when token is expired', () => {
    const session = { zendeskTokenExpiry: Date.now() - 1000 };
    expect(store.isZendeskTokenExpiring(session)).toBe(true);
  });

  it('returns true when within default buffer (60s)', () => {
    const session = { zendeskTokenExpiry: Date.now() + 30000 }; // 30s left
    expect(store.isZendeskTokenExpiring(session)).toBe(true);
  });

  it('returns false when well within validity', () => {
    const session = { zendeskTokenExpiry: Date.now() + 3600000 }; // 1h left
    expect(store.isZendeskTokenExpiring(session)).toBe(false);
  });

  it('respects custom buffer parameter', () => {
    const session = { zendeskTokenExpiry: Date.now() + 5000 }; // 5s left

    // With 10s buffer, should be expiring
    expect(store.isZendeskTokenExpiring(session, 10000)).toBe(true);

    // With 1s buffer, should not be expiring
    expect(store.isZendeskTokenExpiring(session, 1000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteSession()
// ---------------------------------------------------------------------------
describe('deleteSession()', () => {
  it('removes session from sessions map', () => {
    const session = store.createOAuthSession('s', 'v');
    const { mcpAccessToken } = store.completeOAuthFlow(session, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 7200,
      scope: '',
    });

    expect(store.sessions.has(mcpAccessToken)).toBe(true);
    store.deleteSession(mcpAccessToken);
    expect(store.sessions.has(mcpAccessToken)).toBe(false);
  });

  it('removes session from sessionsByState map', () => {
    const session = store.createOAuthSession('mystate', 'v');
    // Manually add to sessions to simulate a completed flow that still has state reference
    const mcpToken = 'mcp_test';
    session.mcpAccessToken = mcpToken;
    store.sessions.set(mcpToken, session);

    store.deleteSession(mcpToken);
    expect(store.sessionsByState.has('mystate')).toBe(false);
    expect(store.sessions.has(mcpToken)).toBe(false);
  });

  it('no-op for unknown MCP token', () => {
    // Should not throw
    store.deleteSession('mcp_nonexistent');
    expect(store.sessions.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createAuthorizationCode()
// ---------------------------------------------------------------------------
describe('createAuthorizationCode()', () => {
  it('returns code starting with auth_', () => {
    const session = store.createOAuthSession('s', 'v');
    const code = store.createAuthorizationCode(session, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 7200,
      scope: 'read',
    });

    expect(code).toMatch(/^auth_/);
  });

  it('stores code in authorizationCodes map', () => {
    const session = store.createOAuthSession('s', 'v');
    const code = store.createAuthorizationCode(session, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 7200,
      scope: 'read',
    });

    expect(store.authorizationCodes.has(code)).toBe(true);
  });

  it('updates session with Zendesk tokens', () => {
    const session = store.createOAuthSession('s', 'v');
    store.createAuthorizationCode(session, {
      access_token: 'zendesk_at',
      refresh_token: 'zendesk_rt',
      expires_in: 7200,
      scope: 'read write',
    });

    expect(session.zendeskAccessToken).toBe('zendesk_at');
    expect(session.zendeskRefreshToken).toBe('zendesk_rt');
    expect(session.zendeskTokenExpiry).toBeGreaterThan(Date.now());
    expect(session.scopes).toEqual(['read', 'write']);
  });

  it('code has expiresAt approximately 10 minutes in future', () => {
    const session = store.createOAuthSession('s', 'v');
    const code = store.createAuthorizationCode(session, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 7200,
      scope: '',
    });

    const codeData = store.authorizationCodes.get(code);
    const tenMinutes = 10 * 60 * 1000;
    const expectedExpiry = Date.now() + tenMinutes;

    // Allow 100ms tolerance
    expect(codeData.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 100);
    expect(codeData.expiresAt).toBeLessThanOrEqual(expectedExpiry + 100);
    expect(codeData.used).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// exchangeAuthorizationCode()
// ---------------------------------------------------------------------------
describe('exchangeAuthorizationCode()', () => {
  const zendeskTokens = {
    access_token: 'zd_access',
    refresh_token: 'zd_refresh',
    expires_in: 7200,
    scope: 'read',
  };

  it('returns mcpAccessToken, mcpExpiresIn, and session on success', () => {
    const session = store.createOAuthSession('s', 'v');
    const code = store.createAuthorizationCode(session, zendeskTokens);
    const result = store.exchangeAuthorizationCode(code, 'any-verifier');

    expect(result).not.toBeNull();
    expect(result.mcpAccessToken).toMatch(/^mcp_/);
    expect(result.mcpExpiresIn).toBe(86400);
    expect(result.session).toBe(session);
  });

  it('returns null for invalid code', () => {
    const result = store.exchangeAuthorizationCode('auth_invalid', 'verifier');
    expect(result).toBeNull();
  });

  it('returns null for expired code', () => {
    const session = store.createOAuthSession('s', 'v');
    const code = store.createAuthorizationCode(session, zendeskTokens);

    // Advance past 10-minute expiry
    vi.advanceTimersByTime(11 * 60 * 1000);

    const result = store.exchangeAuthorizationCode(code, 'verifier');
    expect(result).toBeNull();
    // Code should be cleaned up
    expect(store.authorizationCodes.has(code)).toBe(false);
  });

  it('returns null for already-used code', () => {
    const session = store.createOAuthSession('s', 'v');
    const code = store.createAuthorizationCode(session, zendeskTokens);

    // First exchange succeeds
    const first = store.exchangeAuthorizationCode(code, 'verifier');
    expect(first).not.toBeNull();

    // Create the same code again to test used flag
    const session2 = store.createOAuthSession('s2', 'v2');
    const code2 = store.createAuthorizationCode(session2, zendeskTokens);

    // Manually mark as used
    store.authorizationCodes.get(code2).used = true;

    const result = store.exchangeAuthorizationCode(code2, 'verifier');
    expect(result).toBeNull();
    expect(store.authorizationCodes.has(code2)).toBe(false);
  });

  it('succeeds PKCE verification with matching verifier', () => {
    const verifier = 'my-secret-code-verifier';
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const session = store.createOAuthSession('s', 'v', null, challenge, null);
    const code = store.createAuthorizationCode(session, zendeskTokens);

    const result = store.exchangeAuthorizationCode(code, verifier);
    expect(result).not.toBeNull();
    expect(result.mcpAccessToken).toMatch(/^mcp_/);
  });

  it('fails PKCE verification with wrong verifier', () => {
    const verifier = 'correct-verifier';
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const session = store.createOAuthSession('s', 'v', null, challenge, null);
    const code = store.createAuthorizationCode(session, zendeskTokens);

    const result = store.exchangeAuthorizationCode(code, 'wrong-verifier');
    expect(result).toBeNull();
    expect(store.authorizationCodes.has(code)).toBe(false);
  });

  it('skips PKCE verification when no clientCodeChallenge', () => {
    const session = store.createOAuthSession('s', 'v', null, null, null);
    const code = store.createAuthorizationCode(session, zendeskTokens);

    const result = store.exchangeAuthorizationCode(code, 'any-verifier');
    expect(result).not.toBeNull();
  });

  it('deletes auth code after successful exchange', () => {
    const session = store.createOAuthSession('s', 'v');
    const code = store.createAuthorizationCode(session, zendeskTokens);

    store.exchangeAuthorizationCode(code, 'verifier');
    expect(store.authorizationCodes.has(code)).toBe(false);
  });

  it('removes session from sessionsByState after exchange', () => {
    const session = store.createOAuthSession('mystate', 'v');
    const code = store.createAuthorizationCode(session, zendeskTokens);

    expect(store.sessionsByState.has('mystate')).toBe(true);
    store.exchangeAuthorizationCode(code, 'verifier');
    expect(store.sessionsByState.has('mystate')).toBe(false);
  });

  it('adds session to sessions map after exchange', () => {
    const session = store.createOAuthSession('s', 'v');
    const code = store.createAuthorizationCode(session, zendeskTokens);

    const result = store.exchangeAuthorizationCode(code, 'verifier');
    expect(store.sessions.has(result.mcpAccessToken)).toBe(true);
    expect(store.sessions.get(result.mcpAccessToken)).toBe(session);
  });

  it('sets mcpAccessToken and mcpTokenExpiry on session', () => {
    const session = store.createOAuthSession('s', 'v');
    const code = store.createAuthorizationCode(session, zendeskTokens);

    const result = store.exchangeAuthorizationCode(code, 'verifier');
    expect(session.mcpAccessToken).toBe(result.mcpAccessToken);
    expect(session.mcpTokenExpiry).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// registerClient() / getRegisteredClient()
// ---------------------------------------------------------------------------
describe('registerClient() / getRegisteredClient()', () => {
  it('stores and retrieves client data', () => {
    const clientData = { name: 'Test App', redirectUri: 'http://localhost' };
    store.registerClient('client-1', clientData);

    const retrieved = store.getRegisteredClient('client-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved.name).toBe('Test App');
    expect(retrieved.redirectUri).toBe('http://localhost');
    expect(retrieved.registeredAt).toBeDefined();
    expect(typeof retrieved.registeredAt).toBe('number');
  });

  it('returns null for unknown client', () => {
    expect(store.getRegisteredClient('unknown')).toBeNull();
  });

  it('does not mutate original clientData object', () => {
    const clientData = { name: 'App' };
    store.registerClient('c1', clientData);
    expect(clientData.registeredAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cleanup()
// ---------------------------------------------------------------------------
describe('cleanup()', () => {
  const quickTokens = {
    access_token: 'at',
    refresh_token: 'rt',
    expires_in: 7200,
    scope: '',
  };

  it('removes sessions older than 24 hours', () => {
    const session = store.createOAuthSession('s', 'v');
    const { mcpAccessToken } = store.completeOAuthFlow(session, {
      ...quickTokens,
      expires_in: 999999, // Far future Zendesk expiry
    });

    // Set MCP expiry far in the future too
    session.mcpTokenExpiry = Date.now() + 999999 * 1000;

    // Advance past 24 hours
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    store.cleanup();

    expect(store.sessions.has(mcpAccessToken)).toBe(false);
  });

  it('removes sessions with expired Zendesk tokens', () => {
    const session = store.createOAuthSession('s', 'v');
    const { mcpAccessToken } = store.completeOAuthFlow(session, {
      ...quickTokens,
      expires_in: 1, // Expires in 1 second
    });

    // Advance 2 seconds so Zendesk token expires
    vi.advanceTimersByTime(2000);
    store.cleanup();

    expect(store.sessions.has(mcpAccessToken)).toBe(false);
  });

  it('removes sessions with expired MCP tokens', () => {
    const session = store.createOAuthSession('s', 'v');
    const { mcpAccessToken } = store.completeOAuthFlow(session, quickTokens);

    // MCP tokens expire in 24h, advance past that
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    store.cleanup();

    expect(store.sessions.has(mcpAccessToken)).toBe(false);
  });

  it('removes stale state entries older than 10 minutes', () => {
    store.createOAuthSession('stale-state', 'v');
    expect(store.sessionsByState.has('stale-state')).toBe(true);

    // Advance 11 minutes
    vi.advanceTimersByTime(11 * 60 * 1000);
    store.cleanup();

    expect(store.sessionsByState.has('stale-state')).toBe(false);
  });

  it('removes expired authorization codes', () => {
    const session = store.createOAuthSession('s', 'v');
    const code = store.createAuthorizationCode(session, quickTokens);
    expect(store.authorizationCodes.has(code)).toBe(true);

    // Advance past 10-minute code expiry
    vi.advanceTimersByTime(11 * 60 * 1000);
    store.cleanup();

    expect(store.authorizationCodes.has(code)).toBe(false);
  });

  it('removes used authorization codes', () => {
    const session = store.createOAuthSession('s', 'v');
    const code = store.createAuthorizationCode(session, quickTokens);

    // Mark as used
    store.authorizationCodes.get(code).used = true;

    store.cleanup();
    expect(store.authorizationCodes.has(code)).toBe(false);
  });

  it('keeps valid sessions', () => {
    const session = store.createOAuthSession('s', 'v');
    const { mcpAccessToken } = store.completeOAuthFlow(session, {
      ...quickTokens,
      expires_in: 7200,
    });

    // Advance only 1 minute - everything should still be valid
    vi.advanceTimersByTime(60 * 1000);
    store.cleanup();

    expect(store.sessions.has(mcpAccessToken)).toBe(true);
  });

  it('keeps state entries younger than 10 minutes', () => {
    store.createOAuthSession('fresh-state', 'v');

    // Advance only 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000);
    store.cleanup();

    expect(store.sessionsByState.has('fresh-state')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSessionCount()
// ---------------------------------------------------------------------------
describe('getSessionCount()', () => {
  it('returns correct counts with no sessions', () => {
    const counts = store.getSessionCount();
    expect(counts).toEqual({ active: 0, pending: 0 });
  });

  it('returns correct pending count after creating OAuth session', () => {
    store.createOAuthSession('s1', 'v1');
    store.createOAuthSession('s2', 'v2');

    const counts = store.getSessionCount();
    expect(counts).toEqual({ active: 0, pending: 2 });
  });

  it('returns correct active count after completing OAuth flow', () => {
    const session = store.createOAuthSession('s', 'v');
    store.completeOAuthFlow(session, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 7200,
      scope: '',
    });

    const counts = store.getSessionCount();
    expect(counts).toEqual({ active: 1, pending: 0 });
  });

  it('reflects both active and pending correctly', () => {
    store.createOAuthSession('pending1', 'v1');
    store.createOAuthSession('pending2', 'v2');

    const active = store.createOAuthSession('active', 'v3');
    store.completeOAuthFlow(active, {
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 7200,
      scope: '',
    });

    const counts = store.getSessionCount();
    expect(counts).toEqual({ active: 1, pending: 2 });
  });
});

// ---------------------------------------------------------------------------
// destroy()
// ---------------------------------------------------------------------------
describe('destroy()', () => {
  it('clears the cleanup interval', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval');
    const interval = store.cleanupInterval;

    store.destroy();

    expect(clearSpy).toHaveBeenCalledWith(interval);
  });

  it('prevents further cleanup runs after destroy', () => {
    const cleanupSpy = vi.spyOn(store, 'cleanup');
    store.destroy();

    // Advance past cleanup interval
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    expect(cleanupSpy).not.toHaveBeenCalled();
  });
});
