import { z } from 'zod';
import { CUSTOM_FIELD_DEFINITIONS } from '../config/custom-fields.js';

function baseSchemaForType(zendeskType) {
  switch (zendeskType) {
    case 'text':
    case 'textarea':
    case 'regexp':
    case 'partialcreditcard':
    case 'tagger':
      return z.string();
    case 'checkbox':
      return z.boolean();
    case 'integer':
      return z.number().int();
    case 'decimal':
      return z.number();
    case 'date':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
    case 'multiselect':
      return z.array(z.string());
    default:
      return z.unknown();
  }
}

export function buildNamedCustomFieldsSchema() {
  const shape = {};
  for (const [name, def] of Object.entries(CUSTOM_FIELD_DEFINITIONS)) {
    const note = `${def.description || def.title} (Zendesk field id ${def.id}, type ${def.zendeskType}). Pass null on update to clear.`;
    shape[name] = baseSchemaForType(def.zendeskType).nullable().optional().describe(note);
  }
  return z
    .object(shape)
    .optional()
    .describe('Named custom fields. Keys map to Zendesk custom field ids via src/config/custom-fields.js.');
}

function definitionByName(name) {
  const def = CUSTOM_FIELD_DEFINITIONS[name];
  if (!def) throw new Error(`Unknown named custom field: ${name}`);
  return def;
}

function definitionById(id) {
  for (const [name, def] of Object.entries(CUSTOM_FIELD_DEFINITIONS)) {
    if (def.id === id) return { name, def };
  }
  return null;
}

export function namedToCustomFields(named) {
  if (!named) return [];
  const out = [];
  for (const [name, value] of Object.entries(named)) {
    if (value === undefined) continue;
    const def = definitionByName(name);
    out.push({ id: def.id, value });
  }
  return out;
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  return false;
}

export function mergeCustomFields(rawList, namedList) {
  const byId = new Map();
  for (const f of rawList || []) {
    if (!f || typeof f.id !== 'number') continue;
    byId.set(f.id, f.value);
  }
  for (const f of namedList || []) {
    if (byId.has(f.id) && !valuesEqual(byId.get(f.id), f.value)) {
      const hit = definitionById(f.id);
      const label = hit ? `${hit.def.title} (id ${f.id}, named "${hit.name}")` : `id ${f.id}`;
      throw new Error(
        `Conflicting values for custom field ${label}: raw custom_fields has ${JSON.stringify(byId.get(f.id))}, named_custom_fields has ${JSON.stringify(f.value)}. Provide only one.`
      );
    }
    byId.set(f.id, f.value);
  }
  return Array.from(byId, ([id, value]) => ({ id, value }));
}

export function buildCustomFieldsPayload({ custom_fields, named_custom_fields }) {
  const named = namedToCustomFields(named_custom_fields);
  if (!custom_fields && named.length === 0) return undefined;
  return mergeCustomFields(custom_fields, named);
}

function buildNamedFromTicket(ticket) {
  const named = {};
  if (!ticket || !Array.isArray(ticket.custom_fields)) return named;
  for (const f of ticket.custom_fields) {
    const hit = definitionById(f.id);
    if (hit) named[hit.name] = f.value;
  }
  return named;
}

export function enrichTicketWithNamedFields(ticket) {
  if (!ticket || !Array.isArray(ticket.custom_fields)) return ticket;
  return { ...ticket, named_custom_fields: buildNamedFromTicket(ticket) };
}

export function enrichTicketResponse(response) {
  if (!response) return response;
  if (response.ticket) {
    return { ...response, ticket: enrichTicketWithNamedFields(response.ticket) };
  }
  if (Array.isArray(response.tickets)) {
    return { ...response, tickets: response.tickets.map(enrichTicketWithNamedFields) };
  }
  return response;
}
