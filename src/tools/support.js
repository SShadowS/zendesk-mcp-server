import { z } from 'zod';
import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

async function settle(zendeskClient, method, endpoint) {
  try {
    return { ok: true, value: await zendeskClient.request(method, endpoint) };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

export const supportTools = [
  {
    name: "support_info",
    description: "Return the authenticated agent's identity (id, name, email, role) plus account-level Support metadata: subdomain, account settings, brands, and ticket forms. Use this to confirm which Zendesk instance the session is connected to and which ticket forms / brands are available before constructing tickets.",
    schema: z.object({}),
    handler: async () => {
      try {
        const zendeskClient = getZendeskClient();
        const { subdomain } = zendeskClient.getCredentials();

        // Auth/config failures on /users/me are fatal — propagate via
        // createErrorResponse so clients see isError:true rather than a
        // partial-success payload that hides expired tokens.
        const meResponse = await zendeskClient.request('GET', '/users/me.json');

        const [settings, brands, forms] = await Promise.all([
          settle(zendeskClient, 'GET', '/account/settings.json'),
          settle(zendeskClient, 'GET', '/brands.json'),
          settle(zendeskClient, 'GET', '/ticket_forms.json')
        ]);

        const meUser = meResponse?.user || {};
        const info = {
          subdomain: subdomain || null,
          user: {
            id: meUser.id,
            name: meUser.name,
            email: meUser.email,
            role: meUser.role,
            locale: meUser.locale,
            time_zone: meUser.time_zone,
            organization_id: meUser.organization_id,
            default_group_id: meUser.default_group_id,
            two_factor_auth_enabled: meUser.two_factor_auth_enabled
          },
          account_settings: settings.ok ? (settings.value?.settings ?? null) : { error: settings.error },
          brands: brands.ok && Array.isArray(brands.value?.brands)
            ? brands.value.brands.map(b => ({
                id: b.id,
                name: b.name,
                subdomain: b.subdomain,
                brand_url: b.brand_url,
                default: b.default,
                active: b.active
              }))
            : { error: brands.error || 'unavailable' },
          ticket_forms: forms.ok && Array.isArray(forms.value?.ticket_forms)
            ? forms.value.ticket_forms.map(f => ({
                id: f.id,
                name: f.name,
                display_name: f.display_name,
                active: f.active,
                default: f.default,
                ticket_field_ids: f.ticket_field_ids
              }))
            : { error: forms.error || 'unavailable' }
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(info, null, 2)
          }]
        };
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  }
];
