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

        const [me, settings, brands, forms] = await Promise.all([
          settle(zendeskClient, 'GET', '/users/me.json'),
          settle(zendeskClient, 'GET', '/account/settings.json'),
          settle(zendeskClient, 'GET', '/brands.json'),
          settle(zendeskClient, 'GET', '/ticket_forms.json')
        ]);

        const info = {
          subdomain: subdomain || null,
          user: me.ok && me.value?.user
            ? {
                id: me.value.user.id,
                name: me.value.user.name,
                email: me.value.user.email,
                role: me.value.user.role,
                locale: me.value.user.locale,
                time_zone: me.value.user.time_zone,
                organization_id: me.value.user.organization_id,
                default_group_id: me.value.user.default_group_id,
                two_factor_auth_enabled: me.value.user.two_factor_auth_enabled
              }
            : { error: me.error || 'unavailable' },
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
