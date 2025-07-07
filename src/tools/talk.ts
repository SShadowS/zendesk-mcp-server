import { zendeskClient } from '../zendesk-client.js';
import { createErrorResponse } from '../utils/errors.js';
import { McpTool, McpToolResponse } from '../types/index.js';

export const talkTools: McpTool[] = [
  {
    name: "get_talk_stats",
    description: "Get Zendesk Talk statistics",
    schema: {},
    handler: async (): Promise<McpToolResponse> => {
      try {
        const result = await zendeskClient.getTalkStats();
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