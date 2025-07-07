import { z } from 'zod';
import { zendeskClient } from '../zendesk-client.js';
import { createErrorResponse } from '../utils/errors.js';
import { McpTool, McpToolResponse } from '../types/index.js';

export const chatTools: McpTool[] = [
  {
    name: "list_chats",
    description: "List Zendesk Chat conversations",
    schema: {
      page: z.number().optional().describe("Page number for pagination"),
      per_page: z.number().optional().describe("Number of chats per page (max 100)")
    },
    handler: async ({ page, per_page }: {
      page?: number;
      per_page?: number;
    }): Promise<McpToolResponse> => {
      try {
        const params = { page, per_page };
        const result = await zendeskClient.listChats(params);
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