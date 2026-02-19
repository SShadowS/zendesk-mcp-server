import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  storeZendeskClient,
  runInContext,
  getZendeskClient,
  clearZendeskClient,
  getSessionCount,
  setDefaultZendeskClient
} from '../../src/request-context.js';

// Track session IDs created during each test for cleanup
let createdSessionIds = [];

beforeEach(() => {
  createdSessionIds = [];
});

afterEach(() => {
  // Clean up all sessions created during the test
  for (const id of createdSessionIds) {
    clearZendeskClient(id);
  }
  // Clear default client
  setDefaultZendeskClient(null);
});

/**
 * Helper to store a client and track the session ID for cleanup.
 */
function storeAndTrack(sessionId, client) {
  createdSessionIds.push(sessionId);
  storeZendeskClient(sessionId, client);
}

describe('storeZendeskClient / getZendeskClient within context', () => {
  it('returns the stored client when called inside runInContext', async () => {
    const mockClient = { name: 'client-A' };
    storeAndTrack('session-1', mockClient);

    const result = await runInContext('session-1', () => {
      return getZendeskClient();
    });

    expect(result).toBe(mockClient);
  });

  it('returns different clients for different sessions', async () => {
    const clientA = { name: 'client-A' };
    const clientB = { name: 'client-B' };
    storeAndTrack('session-a', clientA);
    storeAndTrack('session-b', clientB);

    const resultA = await runInContext('session-a', () => getZendeskClient());
    const resultB = await runInContext('session-b', () => getZendeskClient());

    expect(resultA).toBe(clientA);
    expect(resultB).toBe(clientB);
    expect(resultA).not.toBe(resultB);
  });
});

describe('runInContext', () => {
  it('returns the result of the wrapped function', async () => {
    const mockClient = { name: 'client-return' };
    storeAndTrack('session-return', mockClient);

    const result = await runInContext('session-return', () => {
      return 42;
    });

    expect(result).toBe(42);
  });

  it('makes context available inside the function', async () => {
    const mockClient = { name: 'client-ctx' };
    storeAndTrack('session-ctx', mockClient);

    await runInContext('session-ctx', () => {
      // getZendeskClient should not throw, proving context is available
      const client = getZendeskClient();
      expect(client).toBe(mockClient);
    });
  });

  it('supports async functions with await', async () => {
    const mockClient = { name: 'client-async' };
    storeAndTrack('session-async', mockClient);

    const result = await runInContext('session-async', async () => {
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 10));
      const client = getZendeskClient();
      return client.name;
    });

    expect(result).toBe('client-async');
  });
});

describe('getZendeskClient outside context', () => {
  it('throws "No session context available" when called outside runInContext with no default client', () => {
    expect(() => getZendeskClient()).toThrow(
      'No session context available. This tool must be called through the MCP server.'
    );
  });
});

describe('getZendeskClient with missing client', () => {
  it('throws "No Zendesk client found" when sessionId has no stored client', () => {
    // Run inside context but with a session ID that has no stored client
    createdSessionIds.push('session-no-client');

    expect(() =>
      runInContext('session-no-client', () => {
        return getZendeskClient();
      })
    ).toThrow(
      'No Zendesk client found for session session-no-client. This should not happen - please report this bug.'
    );
  });
});

describe('clearZendeskClient', () => {
  it('causes getZendeskClient to throw after the client is cleared', () => {
    const mockClient = { name: 'client-clear' };
    storeAndTrack('session-clear', mockClient);

    // Verify client is accessible before clearing
    const before = runInContext('session-clear', () => getZendeskClient());
    expect(before).toBe(mockClient);

    // Clear the client
    clearZendeskClient('session-clear');

    // Now getZendeskClient should throw inside the same context
    expect(() =>
      runInContext('session-clear', () => getZendeskClient())
    ).toThrow('No Zendesk client found for session session-clear');
  });
});

describe('getSessionCount', () => {
  it('returns 0 when no clients are stored', () => {
    // afterEach from the previous test should have cleaned up
    expect(getSessionCount()).toBe(0);
  });

  it('returns the correct count after storing clients', () => {
    storeAndTrack('session-count-1', { name: 'c1' });
    storeAndTrack('session-count-2', { name: 'c2' });
    storeAndTrack('session-count-3', { name: 'c3' });

    expect(getSessionCount()).toBe(3);
  });

  it('decreases after clearing a client', () => {
    storeAndTrack('session-dec-1', { name: 'c1' });
    storeAndTrack('session-dec-2', { name: 'c2' });

    expect(getSessionCount()).toBe(2);

    clearZendeskClient('session-dec-1');

    expect(getSessionCount()).toBe(1);
  });
});

describe('concurrent context isolation', () => {
  it('two concurrent runInContext calls each get their own client', async () => {
    const clientX = { name: 'client-X' };
    const clientY = { name: 'client-Y' };
    storeAndTrack('session-x', clientX);
    storeAndTrack('session-y', clientY);

    const [resultX, resultY] = await Promise.all([
      runInContext('session-x', async () => {
        // Simulate async delay to increase chance of interleaving
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getZendeskClient();
      }),
      runInContext('session-y', async () => {
        // Simulate async delay to increase chance of interleaving
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getZendeskClient();
      })
    ]);

    expect(resultX).toBe(clientX);
    expect(resultX.name).toBe('client-X');
    expect(resultY).toBe(clientY);
    expect(resultY.name).toBe('client-Y');
  });
});

describe('setDefaultZendeskClient (stdio mode fallback)', () => {
  it('returns default client when called outside runInContext', () => {
    const defaultClient = { name: 'default-stdio' };
    setDefaultZendeskClient(defaultClient);

    // Called outside any runInContext — should fall back to default
    const result = getZendeskClient();
    expect(result).toBe(defaultClient);
  });

  it('prefers session client over default client inside runInContext', async () => {
    const defaultClient = { name: 'default-stdio' };
    const sessionClient = { name: 'session-http' };

    setDefaultZendeskClient(defaultClient);
    storeAndTrack('session-priority', sessionClient);

    const result = await runInContext('session-priority', () => {
      return getZendeskClient();
    });

    // Session client should take priority
    expect(result).toBe(sessionClient);
    expect(result.name).toBe('session-http');
  });

  it('clears default client when set to null', () => {
    const defaultClient = { name: 'default-stdio' };
    setDefaultZendeskClient(defaultClient);

    // Verify it works
    expect(getZendeskClient()).toBe(defaultClient);

    // Clear it
    setDefaultZendeskClient(null);

    // Should throw again
    expect(() => getZendeskClient()).toThrow(
      'No session context available. This tool must be called through the MCP server.'
    );
  });
});
