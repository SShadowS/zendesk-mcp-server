import { z } from 'zod';
    import { zendeskClient } from '../zendesk-client.js';

    export const talkTools = [
      {
        name: "get_talk_stats",
        description: "Get Zendesk Talk statistics",
        schema: {},
        handler: async () => {
          try {
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
