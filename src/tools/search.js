import { z } from 'zod';
    import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

    export const searchTools = [
      {
        name: "search",
        description: "Search Zendesk tickets, users, organizations, groups, and Help Center articles using Zendesk's full search query language. The `query` parameter supports operators (combined with spaces, implicit AND): `type:ticket|user|organization|group|article`, `recipient:<email>`, `assignee:<email|me|none>`, `requester:<email>`, `submitter:<email>`, `status<solved` (also `>`, `<=`, `>=`), `tags:<tag>`, `brand:<id>`, `group:<id>`, `created>2026-05-01` (also `updated`, `solved_at`, `due_at`), `priority:high|normal|low|urgent`, `via:web|email|chat|phone`, plus full-text on subject/description. Combine for precision (e.g. `type:ticket recipient:support@acme.com status<solved created>2026-05-01`). IMPORTANT: default sort is *relevance*, not date — for chronological results pass `sort_by:created_at` (or `updated_at`) with `sort_order:desc`. Use this instead of `list_tickets` whenever you need filtering by recipient/assignee/tag/status/dates or full-text search; `list_tickets` has no filter parameters. Reference: https://support.zendesk.com/hc/en-us/articles/4408886879258",
        schema: z.object({
          query: z.string().describe("Zendesk search query. Use operators like `type:ticket`, `recipient:<email>`, `assignee:<email|me>`, `tags:<tag>`, `status<solved`, `created>YYYY-MM-DD`. Combine with spaces (implicit AND). Example: `type:ticket recipient:support@acme.com status<solved`."),
          sort_by: z.string().optional().describe("Sort field — `created_at`, `updated_at`, `priority`, `status`, `ticket_type`. Defaults to relevance (NOT date) when omitted; pass `created_at` for chronological results."),
          sort_order: z.enum(["asc", "desc"]).optional().describe("`desc` for newest-first (typical), `asc` for oldest-first. Only takes effect when `sort_by` is set."),
          page: z.number().optional().describe("1-based page number. Defaults to 1."),
          per_page: z.number().optional().describe("Results per page, 1-100. Defaults to 100. Combined with `page` to walk large result sets — `count` in the response tells you the total.")
        }),
        handler: async ({ query, sort_by, sort_order, page, per_page }) => {
          try {
            const zendeskClient = getZendeskClient();
            const params = { sort_by, sort_order, page, per_page };
            const result = await zendeskClient.search(query, params);
            return {
              content: [{ 
                type: "text", 
                text: JSON.stringify(result, null, 2)
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      }
    ];
