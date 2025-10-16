import { z } from 'zod';
    import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

    export const talkTools = [
      {
        name: "get_talk_stats",
        description: "Get Zendesk Talk statistics",
        schema: z.object({}),
        handler: async () => {
          try {
            const zendeskClient = getZendeskClient();
            const result = await zendeskClient.getTalkStats();
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
