import { describe, it, expect, afterEach, vi } from 'vitest';

const originalReadOnly = process.env.READ_ONLY;
const originalMode = process.env.MODE;

/**
 * server.js resolves its tool list at module load, so each scenario needs a
 * fresh module registry with the environment already in place.
 */
async function registeredToolsWith(env) {
  vi.resetModules();
  delete process.env.READ_ONLY;
  delete process.env.READ_ONLY_STRICT;
  delete process.env.MODE;
  Object.assign(process.env, env);
  const { createServer } = await import('../src/server.js');
  return createServer()._registeredTools;
}

describe('server registration under READ_ONLY', () => {
  afterEach(() => {
    if (originalReadOnly === undefined) delete process.env.READ_ONLY;
    else process.env.READ_ONLY = originalReadOnly;
    if (originalMode === undefined) delete process.env.MODE;
    else process.env.MODE = originalMode;
  });

  it('registers write tools when READ_ONLY is off', async () => {
    const tools = await registeredToolsWith({});
    expect(Object.keys(tools)).toContain('create_ticket');
    expect(Object.keys(tools)).toContain('delete_user');
  });

  it('drops write tools when READ_ONLY is on', async () => {
    const names = Object.keys(await registeredToolsWith({ READ_ONLY: 'true' }));
    expect(names).not.toContain('create_ticket');
    expect(names).not.toContain('update_ticket');
    expect(names).not.toContain('delete_user');
  });

  it('keeps read tools and internal commenting when READ_ONLY is on', async () => {
    const names = Object.keys(await registeredToolsWith({ READ_ONLY: 'true' }));
    expect(names).toContain('get_ticket');
    expect(names).toContain('search');
    expect(names).toContain('add_ticket_comment');
  });

  it('registers exactly the allowlisted tools when READ_ONLY is on', async () => {
    vi.resetModules();
    const { READ_ONLY_ALLOWED_TOOLS } = await import('../src/config/read-only.js');
    const names = Object.keys(await registeredToolsWith({ READ_ONLY: 'true' }));
    expect(names.sort()).toEqual([...READ_ONLY_ALLOWED_TOOLS].sort());
  });

  it('warns in add_ticket_comment description that public replies are unavailable', async () => {
    const tools = await registeredToolsWith({ READ_ONLY: 'true' });
    expect(tools.add_ticket_comment.description).toMatch(/read.only/i);
  });

  it('leaves add_ticket_comment description untouched when READ_ONLY is off', async () => {
    const tools = await registeredToolsWith({});
    expect(tools.add_ticket_comment.description).not.toMatch(/read.only/i);
  });

  it('composes with lite mode', async () => {
    vi.resetModules();
    const { LITE_MODE_TOOLS } = await import('../src/config/tool-modes.js');
    const names = Object.keys(await registeredToolsWith({ READ_ONLY: 'true', MODE: 'lite' }));
    expect(names.sort()).toEqual([...LITE_MODE_TOOLS].sort());
  });
});

describe('server registration under READ_ONLY_STRICT', () => {
  afterEach(() => {
    if (originalReadOnly === undefined) delete process.env.READ_ONLY;
    else process.env.READ_ONLY = originalReadOnly;
    if (originalMode === undefined) delete process.env.MODE;
    else process.env.MODE = originalMode;
    delete process.env.READ_ONLY_STRICT;
  });

  it('does not register add_ticket_comment', async () => {
    const names = Object.keys(
      await registeredToolsWith({ READ_ONLY: 'true', READ_ONLY_STRICT: 'true' })
    );
    expect(names).not.toContain('add_ticket_comment');
  });

  it('registers no mutating tool at all', async () => {
    vi.resetModules();
    const { READ_ONLY_MUTATING_TOOLS } = await import('../src/config/read-only.js');
    const names = Object.keys(
      await registeredToolsWith({ READ_ONLY: 'true', READ_ONLY_STRICT: 'true' })
    );
    const mutating = names.filter(
      n => /^(create|update|delete)_/.test(n) || READ_ONLY_MUTATING_TOOLS.includes(n)
    );
    expect(mutating).toEqual([]);
  });

  it('keeps every read tool', async () => {
    const names = Object.keys(
      await registeredToolsWith({ READ_ONLY: 'true', READ_ONLY_STRICT: 'true' })
    );
    expect(names).toContain('get_ticket');
    expect(names).toContain('search');
    expect(names).toContain('get_ticket_comments');
  });

  it('drops add_ticket_comment from lite mode too', async () => {
    const names = Object.keys(
      await registeredToolsWith({ READ_ONLY: 'true', READ_ONLY_STRICT: 'true', MODE: 'lite' })
    );
    expect(names).not.toContain('add_ticket_comment');
  });

  it('leaves no read-only comment note in any description', async () => {
    const tools = await registeredToolsWith({ READ_ONLY: 'true', READ_ONLY_STRICT: 'true' });
    expect(tools.add_ticket_comment).toBeUndefined();
  });
});
