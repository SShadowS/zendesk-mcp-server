import { z } from 'zod';
    import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

    export const talkTools = [
      {
        name: "get_talk_stats",
        description: "Return Zendesk Talk (voice) aggregate stats: total calls, average wait, abandoned rate, agent availability. Requires Zendesk Talk add-on. Returns the rolling window Zendesk publishes (typically last 30 days).",
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
