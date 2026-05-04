import { describe, it, expect } from 'vitest';
import {
  buildNamedCustomFieldsSchema,
  namedToCustomFields,
  mergeCustomFields,
  buildCustomFieldsPayload,
  enrichTicketWithNamedFields,
  enrichTicketResponse
} from '../../src/utils/custom-fields.js';
import { CUSTOM_FIELD_DEFINITIONS } from '../../src/config/custom-fields.js';

const ADO_ID = CUSTOM_FIELD_DEFINITIONS.ado_work_item_id.id;

describe('buildNamedCustomFieldsSchema()', () => {
  const schema = buildNamedCustomFieldsSchema();

  it('accepts known named field with string value', () => {
    expect(() => schema.parse({ ado_work_item_id: '12345' })).not.toThrow();
  });

  it('accepts null (clear-on-update semantics)', () => {
    expect(() => schema.parse({ ado_work_item_id: null })).not.toThrow();
  });

  it('rejects wrong type', () => {
    expect(() => schema.parse({ ado_work_item_id: 12345 })).toThrow();
  });

  it('rejects unknown keys (Zod strips by default → result lacks key)', () => {
    const parsed = schema.parse({ unknown_field: 'x' });
    expect(parsed.unknown_field).toBeUndefined();
  });

  it('treats whole object as optional', () => {
    expect(() => schema.parse(undefined)).not.toThrow();
  });
});

describe('namedToCustomFields()', () => {
  it('returns [] for null/undefined', () => {
    expect(namedToCustomFields(undefined)).toEqual([]);
    expect(namedToCustomFields(null)).toEqual([]);
  });

  it('maps named -> {id, value}', () => {
    expect(namedToCustomFields({ ado_work_item_id: '789' })).toEqual([
      { id: ADO_ID, value: '789' }
    ]);
  });

  it('skips undefined values but keeps null (clear)', () => {
    expect(namedToCustomFields({ ado_work_item_id: null })).toEqual([
      { id: ADO_ID, value: null }
    ]);
  });

  it('throws on unknown named field', () => {
    expect(() => namedToCustomFields({ bogus: 'x' })).toThrow(/Unknown named custom field: bogus/);
  });
});

describe('mergeCustomFields()', () => {
  it('returns merged list when both empty', () => {
    expect(mergeCustomFields(undefined, undefined)).toEqual([]);
  });

  it('passes raw through untouched', () => {
    const raw = [{ id: 999, value: 'a' }];
    expect(mergeCustomFields(raw, [])).toEqual([{ id: 999, value: 'a' }]);
  });

  it('appends named when no overlap', () => {
    const raw = [{ id: 999, value: 'a' }];
    const named = [{ id: ADO_ID, value: '1' }];
    const merged = mergeCustomFields(raw, named);
    expect(merged).toContainEqual({ id: 999, value: 'a' });
    expect(merged).toContainEqual({ id: ADO_ID, value: '1' });
  });

  it('dedupes when raw and named agree on same id+value', () => {
    const raw = [{ id: ADO_ID, value: '1' }];
    const named = [{ id: ADO_ID, value: '1' }];
    expect(mergeCustomFields(raw, named)).toEqual([{ id: ADO_ID, value: '1' }]);
  });

  it('rejects on conflict (same id, different value)', () => {
    const raw = [{ id: ADO_ID, value: '1' }];
    const named = [{ id: ADO_ID, value: '2' }];
    expect(() => mergeCustomFields(raw, named)).toThrow(/Conflicting values/);
  });
});

describe('buildCustomFieldsPayload()', () => {
  it('returns undefined when nothing provided', () => {
    expect(buildCustomFieldsPayload({})).toBeUndefined();
  });

  it('returns merged list when named provided', () => {
    expect(buildCustomFieldsPayload({ named_custom_fields: { ado_work_item_id: '5' } }))
      .toEqual([{ id: ADO_ID, value: '5' }]);
  });

  it('returns merged list when raw provided', () => {
    expect(buildCustomFieldsPayload({ custom_fields: [{ id: 42, value: 'x' }] }))
      .toEqual([{ id: 42, value: 'x' }]);
  });

  it('rejects conflicting raw vs named', () => {
    expect(() =>
      buildCustomFieldsPayload({
        custom_fields: [{ id: ADO_ID, value: 'a' }],
        named_custom_fields: { ado_work_item_id: 'b' }
      })
    ).toThrow(/Conflicting values/);
  });
});

describe('enrichTicketWithNamedFields()', () => {
  it('flattens known fields into named_custom_fields', () => {
    const ticket = {
      id: 1,
      custom_fields: [
        { id: ADO_ID, value: '999' },
        { id: 12345, value: 'unmapped' }
      ]
    };
    const enriched = enrichTicketWithNamedFields(ticket);
    expect(enriched.named_custom_fields).toEqual({ ado_work_item_id: '999' });
    expect(enriched.custom_fields).toBe(ticket.custom_fields);
  });

  it('returns input unchanged when custom_fields missing', () => {
    const t = { id: 1 };
    expect(enrichTicketWithNamedFields(t)).toBe(t);
  });

  it('returns null/undefined unchanged', () => {
    expect(enrichTicketWithNamedFields(null)).toBeNull();
    expect(enrichTicketWithNamedFields(undefined)).toBeUndefined();
  });
});

describe('enrichTicketResponse()', () => {
  it('enriches { ticket } payloads', () => {
    const res = { ticket: { id: 1, custom_fields: [{ id: ADO_ID, value: 'X' }] } };
    expect(enrichTicketResponse(res).ticket.named_custom_fields).toEqual({ ado_work_item_id: 'X' });
  });

  it('enriches { tickets: [] } payloads', () => {
    const res = {
      tickets: [
        { id: 1, custom_fields: [{ id: ADO_ID, value: 'A' }] },
        { id: 2, custom_fields: [] }
      ]
    };
    const out = enrichTicketResponse(res);
    expect(out.tickets[0].named_custom_fields).toEqual({ ado_work_item_id: 'A' });
    expect(out.tickets[1].named_custom_fields).toEqual({});
  });

  it('passes through other shapes', () => {
    expect(enrichTicketResponse({ foo: 'bar' })).toEqual({ foo: 'bar' });
  });
});
