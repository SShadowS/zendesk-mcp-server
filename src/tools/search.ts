import { z } from 'zod';
import { zendeskClient } from '../zendesk-client.js';
import { createErrorResponse } from '../utils/errors.js';
import { McpTool, McpToolResponse } from '../types/index.js';

export const searchTools: McpTool[] = [
  {
    name: "search",
    description: "Search across Zendesk data",
    schema: {
      query: z.string().describe("Search query string"),
      sort_by: z.string().optional().describe("Field to sort by"),
      sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)"),
      page: z.coerce.number().optional().describe("Page number for pagination"),
      per_page: z.coerce.number().optional().describe("Number of results per page (max 100)")
    },
    handler: async ({ query, sort_by, sort_order, page, per_page }: {
      query: string;
      sort_by?: string;
      sort_order?: "asc" | "desc";
      page?: number;
      per_page?: number;
    }): Promise<McpToolResponse> => {
      try {
        const params = { sort_by, sort_order, page, per_page };
        const result = await zendeskClient.search(query, params);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  }
];