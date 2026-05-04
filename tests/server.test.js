import { describe, it, expect } from 'vitest';
import { createServer } from '../src/server.js';

/**
 * Regression coverage for the empty-schema bug fixed in v1.2.1.
 *
 * Background: the legacy positional `server.tool(name, schema, handler, opts)`
 * call combined with a `z.object({...})` schema caused @modelcontextprotocol/sdk
 * (>= 1.24) to silently capture the ZodObject as `annotations` and leave
 * `inputSchema` undefined, exposing empty {"properties":{}} schemas to MCP
 * clients. These tests assert that every registered tool has a populated
 * inputSchema and description, so if anyone reverts the registration call
 * the suite breaks.
 */
describe('server tool registration', () => {
  const server = createServer();
  const tools = server._registeredTools;
  const toolEntries = Object.entries(tools);

  function shapeOf(inputSchema) {
    if (!inputSchema) return null;
    const shape = inputSchema.shape ?? inputSchema._def?.shape;
    if (!shape) return null;
    return typeof shape === 'function' ? shape() : shape;
  }

  it('registers a non-empty set of tools', () => {
    expect(toolEntries.length).toBeGreaterThan(0);
  });

  it('every tool has a defined inputSchema (would regress if legacy server.tool overload returns)', () => {
    const missing = toolEntries
      .filter(([, t]) => !t.inputSchema)
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('every tool has a non-empty description', () => {
    const bad = toolEntries
      .filter(([, t]) => typeof t.description !== 'string' || t.description.length === 0)
      .map(([name]) => name);
    expect(bad).toEqual([]);
  });

  it('every tool inputSchema exposes a Zod-style shape', () => {
    const broken = toolEntries
      .filter(([, t]) => shapeOf(t.inputSchema) === null)
      .map(([name]) => name);
    expect(broken).toEqual([]);
  });

  it('preserves declared schema keys for representative tools', () => {
    expect(Object.keys(shapeOf(tools.get_ticket.inputSchema))).toEqual(
      expect.arrayContaining(['id', 'include_comments'])
    );
    expect(Object.keys(shapeOf(tools.create_ticket.inputSchema))).toEqual(
      expect.arrayContaining(['subject', 'comment', 'named_custom_fields'])
    );
    expect(Object.keys(shapeOf(tools.update_ticket.inputSchema))).toEqual(
      expect.arrayContaining(['id', 'named_custom_fields', 'custom_fields'])
    );
  });

  it('does not leave the schema captured as annotations', () => {
    for (const [name, t] of toolEntries) {
      expect(
        t.annotations,
        `tool ${name} unexpectedly has annotations set; check the registerTool call signature`
      ).toBeUndefined();
    }
  });
});
