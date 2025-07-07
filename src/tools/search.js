import { z } from 'zod';
    import { zendeskClient } from '../zendesk-client.js';

    export const searchTools = [
      {
        name: "search",
        description: "Search across Zendesk data",
        schema: {
          query: z.string().describe("Search query string"),
          sort_by: z.string().optional().describe("Field to sort by"),
          sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)"),
          page: z.number().optional().describe("Page number for pagination"),
          per_page: z.number().optional().describe("Number of results per page (max 100)")
        },
        handler: async ({ query, sort_by, sort_order, page, per_page }) => {
          try {
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
