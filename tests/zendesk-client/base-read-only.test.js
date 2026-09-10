import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { ZendeskClientBase } from '../../src/zendesk-client/base.js';
import { ZendeskReadOnlyError } from '../../src/utils/errors.js';

vi.mock('axios', () => ({
  default: vi.fn(() => Promise.resolve({ status: 200, data: { ok: true } }))
}));

/**
 * The guard has to sit inside request() rather than only in the tool layer:
 * every Zendesk call funnels through here, so a write cannot reach the API
 * by any other route while READ_ONLY is set.
 */
describe('ZendeskClientBase.request() under READ_ONLY', () => {
  const originalReadOnly = process.env.READ_ONLY;
  const originalSubdomain = process.env.ZENDESK_SUBDOMAIN;
  let client;

  beforeEach(() => {
    vi.mocked(axios).mockClear();
    process.env.READ_ONLY = 'true';
    process.env.ZENDESK_SUBDOMAIN = 'example';
    client = new ZendeskClientBase();
    client.setApiTokenAuth('user@example.com', 'token');
  });

  afterEach(() => {
    if (originalReadOnly === undefined) delete process.env.READ_ONLY;
    else process.env.READ_ONLY = originalReadOnly;
    if (originalSubdomain === undefined) delete process.env.ZENDESK_SUBDOMAIN;
    else process.env.ZENDESK_SUBDOMAIN = originalSubdomain;
  });

  it('lets a GET through to the API', async () => {
    await client.request('GET', '/tickets/1.json');
    expect(vi.mocked(axios)).toHaveBeenCalledTimes(1);
  });

  it('lets an internal note through to the API', async () => {
    await client.request('PUT', '/tickets/1.json', {
      ticket: { comment: { body: 'note', public: false } }
    });
    expect(vi.mocked(axios)).toHaveBeenCalledTimes(1);
  });

  it('rejects a ticket update', async () => {
    await expect(
      client.request('PUT', '/tickets/1.json', { ticket: { status: 'solved' } })
    ).rejects.toThrow(ZendeskReadOnlyError);
  });

  it('rejects a public reply', async () => {
    await expect(
      client.request('PUT', '/tickets/1.json', {
        ticket: { comment: { body: 'hi', public: true } }
      })
    ).rejects.toThrow(ZendeskReadOnlyError);
  });

  it('rejects a DELETE', async () => {
    await expect(
      client.request('DELETE', '/tickets/1.json')
    ).rejects.toThrow(ZendeskReadOnlyError);
  });

  it('never reaches the network when a write is rejected', async () => {
    await expect(
      client.request('POST', '/tickets.json', { ticket: {} })
    ).rejects.toThrow(ZendeskReadOnlyError);
    expect(vi.mocked(axios)).not.toHaveBeenCalled();
  });

  it('does not retry a rejected write', async () => {
    const error = await client.request('DELETE', '/tickets/1.json').catch(e => e);
    expect(error.isRetryable).toBe(false);
  });

  it('allows writes again once READ_ONLY is off', async () => {
    process.env.READ_ONLY = 'false';
    await client.request('DELETE', '/tickets/1.json');
    expect(vi.mocked(axios)).toHaveBeenCalledTimes(1);
  });
});

describe('ZendeskClientBase.request() under READ_ONLY_STRICT', () => {
  const originalReadOnly = process.env.READ_ONLY;
  const originalStrict = process.env.READ_ONLY_STRICT;
  const originalSubdomain = process.env.ZENDESK_SUBDOMAIN;
  let client;

  beforeEach(() => {
    vi.mocked(axios).mockClear();
    process.env.READ_ONLY = 'true';
    process.env.READ_ONLY_STRICT = 'true';
    process.env.ZENDESK_SUBDOMAIN = 'example';
    client = new ZendeskClientBase();
    client.setApiTokenAuth('user@example.com', 'token');
  });

  afterEach(() => {
    if (originalReadOnly === undefined) delete process.env.READ_ONLY;
    else process.env.READ_ONLY = originalReadOnly;
    if (originalStrict === undefined) delete process.env.READ_ONLY_STRICT;
    else process.env.READ_ONLY_STRICT = originalStrict;
    if (originalSubdomain === undefined) delete process.env.ZENDESK_SUBDOMAIN;
    else process.env.ZENDESK_SUBDOMAIN = originalSubdomain;
  });

  it('still lets a GET through', async () => {
    await client.request('GET', '/tickets/1.json');
    expect(vi.mocked(axios)).toHaveBeenCalledTimes(1);
  });

  it('rejects an internal note', async () => {
    await expect(
      client.request('PUT', '/tickets/1.json', {
        ticket: { comment: { body: 'note', public: false } }
      })
    ).rejects.toThrow(ZendeskReadOnlyError);
  });

  it('never reaches the network for an internal note', async () => {
    await client.request('PUT', '/tickets/1.json', {
      ticket: { comment: { body: 'note', public: false } }
    }).catch(() => {});
    expect(vi.mocked(axios)).not.toHaveBeenCalled();
  });
});
