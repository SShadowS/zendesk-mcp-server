import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isReadOnly, filterToolsByReadOnly, READ_ONLY_ALLOWED_TOOLS, assertReadOnlyAllowed } from '../../src/config/read-only.js';
import { ZendeskReadOnlyError } from '../../src/utils/errors.js';
import { allTools } from '../../src/server.js';

describe('isReadOnly()', () => {
  const originalValue = process.env.READ_ONLY;

  beforeEach(() => {
    delete process.env.READ_ONLY;
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.READ_ONLY;
    } else {
      process.env.READ_ONLY = originalValue;
    }
  });

  it('returns false when READ_ONLY is unset', () => {
    expect(isReadOnly()).toBe(false);
  });

  it('returns true for "true"', () => {
    process.env.READ_ONLY = 'true';
    expect(isReadOnly()).toBe(true);
  });

  it('returns true for "TRUE" regardless of case', () => {
    process.env.READ_ONLY = 'TRUE';
    expect(isReadOnly()).toBe(true);
  });

  it('returns true for "1"', () => {
    process.env.READ_ONLY = '1';
    expect(isReadOnly()).toBe(true);
  });

  it('returns false for "false"', () => {
    process.env.READ_ONLY = 'false';
    expect(isReadOnly()).toBe(false);
  });

  it('returns false for an empty string', () => {
    process.env.READ_ONLY = '';
    expect(isReadOnly()).toBe(false);
  });

  it('returns false for an unrecognized value', () => {
    process.env.READ_ONLY = 'yes-please';
    expect(isReadOnly()).toBe(false);
  });
});

describe('filterToolsByReadOnly()', () => {
  const originalValue = process.env.READ_ONLY;

  const sampleTools = [
    { name: 'get_ticket' },
    { name: 'list_tickets' },
    { name: 'search' },
    { name: 'add_ticket_comment' },
    { name: 'create_ticket' },
    { name: 'update_ticket' },
    { name: 'delete_ticket' }
  ];

  beforeEach(() => {
    delete process.env.READ_ONLY;
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.READ_ONLY;
    } else {
      process.env.READ_ONLY = originalValue;
    }
  });

  it('returns every tool untouched when read-only is off', () => {
    expect(filterToolsByReadOnly(sampleTools)).toEqual(sampleTools);
  });

  it('keeps read tools when read-only is on', () => {
    process.env.READ_ONLY = 'true';
    const names = filterToolsByReadOnly(sampleTools).map(t => t.name);
    expect(names).toContain('get_ticket');
    expect(names).toContain('list_tickets');
    expect(names).toContain('search');
  });

  it('keeps add_ticket_comment when read-only is on', () => {
    process.env.READ_ONLY = 'true';
    const names = filterToolsByReadOnly(sampleTools).map(t => t.name);
    expect(names).toContain('add_ticket_comment');
  });

  it('drops create, update and delete tools when read-only is on', () => {
    process.env.READ_ONLY = 'true';
    const names = filterToolsByReadOnly(sampleTools).map(t => t.name);
    expect(names).not.toContain('create_ticket');
    expect(names).not.toContain('update_ticket');
    expect(names).not.toContain('delete_ticket');
  });

  it('fails closed: drops a tool that is not on the allowlist', () => {
    process.env.READ_ONLY = 'true';
    const names = filterToolsByReadOnly([{ name: 'merge_users_someday' }]).map(t => t.name);
    expect(names).toEqual([]);
  });
});

describe('READ_ONLY_ALLOWED_TOOLS', () => {
  it('names only tools that actually exist on the server', () => {
    const realNames = new Set(allTools.map(t => t.name));
    const unknown = READ_ONLY_ALLOWED_TOOLS.filter(name => !realNames.has(name));
    expect(unknown).toEqual([]);
  });

  it('covers every non-mutating tool the server registers', () => {
    const mutating = /^(create|update|delete)_/;
    const missing = allTools
      .map(t => t.name)
      .filter(name => !mutating.test(name))
      .filter(name => !READ_ONLY_ALLOWED_TOOLS.includes(name));
    expect(missing).toEqual([]);
  });

  it('excludes every mutating tool except add_ticket_comment', () => {
    const mutating = /^(create|update|delete)_/;
    const leaked = READ_ONLY_ALLOWED_TOOLS.filter(name => mutating.test(name));
    expect(leaked).toEqual([]);
  });
});

describe('assertReadOnlyAllowed()', () => {
  const originalValue = process.env.READ_ONLY;

  const internalNote = { ticket: { comment: { body: 'note', public: false } } };

  beforeEach(() => {
    process.env.READ_ONLY = 'true';
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.READ_ONLY;
    } else {
      process.env.READ_ONLY = originalValue;
    }
  });

  describe('when read-only is off', () => {
    it('permits a write that would otherwise be rejected', () => {
      process.env.READ_ONLY = 'false';
      expect(() => assertReadOnlyAllowed('DELETE', '/tickets/1.json', null)).not.toThrow();
    });
  });

  describe('reads', () => {
    it('permits GET', () => {
      expect(() => assertReadOnlyAllowed('GET', '/tickets/1.json', null)).not.toThrow();
    });

    it('permits lowercase get', () => {
      expect(() => assertReadOnlyAllowed('get', '/tickets/1.json', null)).not.toThrow();
    });
  });

  describe('internal notes', () => {
    it('permits a PUT carrying only an internal comment', () => {
      expect(() => assertReadOnlyAllowed('PUT', '/tickets/1.json', internalNote)).not.toThrow();
    });

    it('rejects a public comment', () => {
      const publicReply = { ticket: { comment: { body: 'hi', public: true } } };
      expect(() => assertReadOnlyAllowed('PUT', '/tickets/1.json', publicReply))
        .toThrow(ZendeskReadOnlyError);
    });

    it('rejects a comment that omits the public flag', () => {
      const ambiguous = { ticket: { comment: { body: 'hi' } } };
      expect(() => assertReadOnlyAllowed('PUT', '/tickets/1.json', ambiguous)).toThrow(ZendeskReadOnlyError);
    });

    it('rejects a comment smuggling other ticket fields alongside it', () => {
      const smuggled = { ticket: { comment: { body: 'hi', public: false }, status: 'solved' } };
      expect(() => assertReadOnlyAllowed('PUT', '/tickets/1.json', smuggled)).toThrow(ZendeskReadOnlyError);
    });

    it('rejects an internal-comment payload aimed at a different endpoint', () => {
      expect(() => assertReadOnlyAllowed('PUT', '/users/1.json', internalNote)).toThrow(ZendeskReadOnlyError);
    });

    it('rejects a ticket update with no comment at all', () => {
      const update = { ticket: { status: 'solved' } };
      expect(() => assertReadOnlyAllowed('PUT', '/tickets/1.json', update)).toThrow(ZendeskReadOnlyError);
    });
  });

  describe('other writes', () => {
    it('rejects POST', () => {
      expect(() => assertReadOnlyAllowed('POST', '/tickets.json', { ticket: {} })).toThrow(ZendeskReadOnlyError);
    });

    it('rejects DELETE', () => {
      expect(() => assertReadOnlyAllowed('DELETE', '/tickets/1.json', null)).toThrow(ZendeskReadOnlyError);
    });

    it('throws a ZendeskReadOnlyError carrying HTTP 403', () => {
      try {
        assertReadOnlyAllowed('DELETE', '/tickets/1.json', null);
        expect.unreachable('expected a throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ZendeskReadOnlyError);
        expect(error.statusCode).toBe(403);
        expect(error.isRetryable).toBe(false);
      }
    });
  });
});
