import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isReadOnly,
  isStrictReadOnly,
  getReadOnlyMode,
  filterToolsByReadOnly,
  READ_ONLY_ALLOWED_TOOLS,
  READ_ONLY_MUTATING_TOOLS,
  assertReadOnlyAllowed,
  logReadOnlyInfo
} from '../../src/config/read-only.js';
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

describe('getReadOnlyMode()', () => {
  const originalReadOnly = process.env.READ_ONLY;
  const originalStrict = process.env.READ_ONLY_STRICT;

  beforeEach(() => {
    delete process.env.READ_ONLY;
    delete process.env.READ_ONLY_STRICT;
  });

  afterEach(() => {
    if (originalReadOnly === undefined) delete process.env.READ_ONLY;
    else process.env.READ_ONLY = originalReadOnly;
    if (originalStrict === undefined) delete process.env.READ_ONLY_STRICT;
    else process.env.READ_ONLY_STRICT = originalStrict;
  });

  it("is 'off' when neither flag is set", () => {
    expect(getReadOnlyMode()).toBe('off');
  });

  it("is 'standard' for READ_ONLY alone", () => {
    process.env.READ_ONLY = 'true';
    expect(getReadOnlyMode()).toBe('standard');
  });

  it("is 'strict' when both flags are set", () => {
    process.env.READ_ONLY = 'true';
    process.env.READ_ONLY_STRICT = 'true';
    expect(getReadOnlyMode()).toBe('strict');
  });

  it("is 'strict' for READ_ONLY_STRICT alone, so the flag never fails open", () => {
    process.env.READ_ONLY_STRICT = 'true';
    expect(getReadOnlyMode()).toBe('strict');
  });

  it("is 'strict' even when READ_ONLY is explicitly false", () => {
    process.env.READ_ONLY = 'false';
    process.env.READ_ONLY_STRICT = 'true';
    expect(getReadOnlyMode()).toBe('strict');
  });

  it("accepts '1' for the strict flag", () => {
    process.env.READ_ONLY_STRICT = '1';
    expect(getReadOnlyMode()).toBe('strict');
  });

  it("is 'standard' when the strict flag is an unrecognised value", () => {
    process.env.READ_ONLY = 'true';
    process.env.READ_ONLY_STRICT = 'yes-please';
    expect(getReadOnlyMode()).toBe('standard');
  });
});

describe('isStrictReadOnly()', () => {
  const originalReadOnly = process.env.READ_ONLY;
  const originalStrict = process.env.READ_ONLY_STRICT;

  beforeEach(() => {
    delete process.env.READ_ONLY;
    delete process.env.READ_ONLY_STRICT;
  });

  afterEach(() => {
    if (originalReadOnly === undefined) delete process.env.READ_ONLY;
    else process.env.READ_ONLY = originalReadOnly;
    if (originalStrict === undefined) delete process.env.READ_ONLY_STRICT;
    else process.env.READ_ONLY_STRICT = originalStrict;
  });

  it('is false in standard read-only mode', () => {
    process.env.READ_ONLY = 'true';
    expect(isStrictReadOnly()).toBe(false);
  });

  it('is true in strict mode', () => {
    process.env.READ_ONLY = 'true';
    process.env.READ_ONLY_STRICT = 'true';
    expect(isStrictReadOnly()).toBe(true);
  });

  it('reports read-only as enabled in strict mode', () => {
    process.env.READ_ONLY_STRICT = 'true';
    expect(isReadOnly()).toBe(true);
  });
});

describe('READ_ONLY_MUTATING_TOOLS', () => {
  it('names add_ticket_comment as the mutating allowlist entry', () => {
    expect(READ_ONLY_MUTATING_TOOLS).toContain('add_ticket_comment');
  });

  it('only names tools that are on the allowlist', () => {
    const stray = READ_ONLY_MUTATING_TOOLS.filter(n => !READ_ONLY_ALLOWED_TOOLS.includes(n));
    expect(stray).toEqual([]);
  });
});

describe('filterToolsByReadOnly() in strict mode', () => {
  const originalReadOnly = process.env.READ_ONLY;
  const originalStrict = process.env.READ_ONLY_STRICT;

  const sampleTools = [
    { name: 'get_ticket' },
    { name: 'search' },
    { name: 'add_ticket_comment' },
    { name: 'update_ticket' }
  ];

  beforeEach(() => {
    process.env.READ_ONLY = 'true';
    process.env.READ_ONLY_STRICT = 'true';
  });

  afterEach(() => {
    if (originalReadOnly === undefined) delete process.env.READ_ONLY;
    else process.env.READ_ONLY = originalReadOnly;
    if (originalStrict === undefined) delete process.env.READ_ONLY_STRICT;
    else process.env.READ_ONLY_STRICT = originalStrict;
  });

  it('drops add_ticket_comment', () => {
    const names = filterToolsByReadOnly(sampleTools).map(t => t.name);
    expect(names).not.toContain('add_ticket_comment');
  });

  it('keeps read tools', () => {
    const names = filterToolsByReadOnly(sampleTools).map(t => t.name);
    expect(names).toEqual(['get_ticket', 'search']);
  });

  it('leaves no mutating tool behind', () => {
    const allowed = READ_ONLY_ALLOWED_TOOLS.map(name => ({ name }));
    const names = filterToolsByReadOnly(allowed).map(t => t.name);
    const leaked = names.filter(n => READ_ONLY_MUTATING_TOOLS.includes(n));
    expect(leaked).toEqual([]);
  });

  it('yields exactly the allowlist minus the mutating entries', () => {
    const allowed = READ_ONLY_ALLOWED_TOOLS.map(name => ({ name }));
    const names = filterToolsByReadOnly(allowed).map(t => t.name);
    const expected = READ_ONLY_ALLOWED_TOOLS.filter(n => !READ_ONLY_MUTATING_TOOLS.includes(n));
    expect(names).toEqual(expected);
  });

  it('still keeps add_ticket_comment when strict is off', () => {
    delete process.env.READ_ONLY_STRICT;
    const names = filterToolsByReadOnly(sampleTools).map(t => t.name);
    expect(names).toContain('add_ticket_comment');
  });
});

describe('assertReadOnlyAllowed() in strict mode', () => {
  const originalReadOnly = process.env.READ_ONLY;
  const originalStrict = process.env.READ_ONLY_STRICT;

  const internalNote = { ticket: { comment: { body: 'note', public: false } } };

  beforeEach(() => {
    process.env.READ_ONLY = 'true';
    process.env.READ_ONLY_STRICT = 'true';
  });

  afterEach(() => {
    if (originalReadOnly === undefined) delete process.env.READ_ONLY;
    else process.env.READ_ONLY = originalReadOnly;
    if (originalStrict === undefined) delete process.env.READ_ONLY_STRICT;
    else process.env.READ_ONLY_STRICT = originalStrict;
  });

  it('still permits GET', () => {
    expect(() => assertReadOnlyAllowed('GET', '/tickets/1.json', null)).not.toThrow();
  });

  it('rejects the internal-note payload that standard mode allows', () => {
    expect(() => assertReadOnlyAllowed('PUT', '/tickets/1.json', internalNote))
      .toThrow(ZendeskReadOnlyError);
  });

  it('says the block came from strict mode', () => {
    expect(() => assertReadOnlyAllowed('PUT', '/tickets/1.json', internalNote))
      .toThrow(/strict/i);
  });

  it('still rejects other writes', () => {
    expect(() => assertReadOnlyAllowed('DELETE', '/tickets/1.json', null))
      .toThrow(ZendeskReadOnlyError);
  });

  it('permits the internal note again once strict is off', () => {
    delete process.env.READ_ONLY_STRICT;
    expect(() => assertReadOnlyAllowed('PUT', '/tickets/1.json', internalNote)).not.toThrow();
  });
});

describe('logReadOnlyInfo() config warnings', () => {
  const originalReadOnly = process.env.READ_ONLY;
  const originalStrict = process.env.READ_ONLY_STRICT;
  let errors;

  beforeEach(() => {
    delete process.env.READ_ONLY;
    delete process.env.READ_ONLY_STRICT;
    errors = [];
    vi.spyOn(console, 'error').mockImplementation(msg => errors.push(String(msg)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalReadOnly === undefined) delete process.env.READ_ONLY;
    else process.env.READ_ONLY = originalReadOnly;
    if (originalStrict === undefined) delete process.env.READ_ONLY_STRICT;
    else process.env.READ_ONLY_STRICT = originalStrict;
  });

  it('warns when READ_ONLY_STRICT holds an unrecognised value', () => {
    process.env.READ_ONLY = 'true';
    process.env.READ_ONLY_STRICT = 'yes';
    logReadOnlyInfo();
    expect(errors.join('\n')).toMatch(/READ_ONLY_STRICT.*unrecognised/i);
  });

  it('names the value it could not parse', () => {
    process.env.READ_ONLY = 'true';
    process.env.READ_ONLY_STRICT = 'yes';
    logReadOnlyInfo();
    expect(errors.join('\n')).toContain('yes');
  });

  it('warns when READ_ONLY holds an unrecognised value', () => {
    process.env.READ_ONLY = 'enabled';
    logReadOnlyInfo();
    expect(errors.join('\n')).toMatch(/READ_ONLY.*unrecognised/i);
  });

  it('stays quiet for an explicit false', () => {
    process.env.READ_ONLY = 'false';
    process.env.READ_ONLY_STRICT = 'false';
    logReadOnlyInfo();
    expect(errors.join('\n')).not.toMatch(/unrecognised/i);
  });

  it('stays quiet for recognised truthy values', () => {
    process.env.READ_ONLY = 'true';
    process.env.READ_ONLY_STRICT = '1';
    logReadOnlyInfo();
    expect(errors.join('\n')).not.toMatch(/unrecognised/i);
  });

  it('still reports the resolved mode alongside the warning', () => {
    process.env.READ_ONLY = 'true';
    process.env.READ_ONLY_STRICT = 'yes';
    logReadOnlyInfo();
    expect(errors.join('\n')).toMatch(/mode=STANDARD/);
  });
});

describe('logReadOnlyInfo() reports the mode in every state', () => {
  const originalReadOnly = process.env.READ_ONLY;
  const originalStrict = process.env.READ_ONLY_STRICT;
  let errors;

  beforeEach(() => {
    delete process.env.READ_ONLY;
    delete process.env.READ_ONLY_STRICT;
    errors = [];
    vi.spyOn(console, 'error').mockImplementation(msg => errors.push(String(msg)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalReadOnly === undefined) delete process.env.READ_ONLY;
    else process.env.READ_ONLY = originalReadOnly;
    if (originalStrict === undefined) delete process.env.READ_ONLY_STRICT;
    else process.env.READ_ONLY_STRICT = originalStrict;
  });

  it('states the mode is off when neither flag is set', () => {
    logReadOnlyInfo();
    expect(errors.join('\n')).toMatch(/mode=OFF/);
  });

  it('states STANDARD for READ_ONLY', () => {
    process.env.READ_ONLY = 'true';
    logReadOnlyInfo();
    expect(errors.join('\n')).toMatch(/mode=STANDARD/);
  });

  it('states STRICT for READ_ONLY_STRICT', () => {
    process.env.READ_ONLY = 'true';
    process.env.READ_ONLY_STRICT = 'true';
    logReadOnlyInfo();
    expect(errors.join('\n')).toMatch(/mode=STRICT/);
  });
});
