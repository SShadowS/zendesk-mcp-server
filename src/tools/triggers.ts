import { z } from 'zod';
import { zendeskClient } from '../zendesk-client.js';
import { createErrorResponse } from '../utils/errors.js';
import { McpTool, McpToolResponse } from '../types/index.js';

export const triggersTools: McpTool[] = [
  {
    name: "list_triggers",
    description: "List triggers in Zendesk",
    schema: {
      page: z.coerce.number().optional().describe("Page number for pagination"),
      per_page: z.coerce.number().optional().describe("Number of triggers per page (max 100)")
    },
    handler: async ({ page, per_page }: {
      page?: number;
      per_page?: number;
    }): Promise<McpToolResponse> => {
      try {
        const params = { page, per_page };
        const result = await zendeskClient.listTriggers(params);
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
  },
  {
    name: "get_trigger",
    description: "Get a specific trigger by ID",
    schema: {
      id: z.coerce.number().describe("Trigger ID")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        const result = await zendeskClient.getTrigger(id);
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
  },
  {
    name: "create_trigger",
    description: "Create a new trigger",
    schema: {
      title: z.string().describe("Trigger title"),
      description: z.string().optional().describe("Trigger description"),
      conditions: z.object({
        all: z.array(z.object({
          field: z.string().describe("Field to check"),
          operator: z.string().describe("Operator for comparison"),
          value: z.any().describe("Value to compare against")
        })).optional(),
        any: z.array(z.object({
          field: z.string().describe("Field to check"),
          operator: z.string().describe("Operator for comparison"),
          value: z.any().describe("Value to compare against")
        })).optional()
      }).describe("Conditions for the trigger"),
      actions: z.array(z.object({
        field: z.string().describe("Field to modify"),
        value: z.any().describe("Value to set")
      })).describe("Actions to perform when trigger conditions are met")
    },
    handler: async ({ title, description, conditions, actions }: {
      title: string;
      description?: string;
      conditions: {
        all?: Array<{ field: string; operator: string; value: any }>;
        any?: Array<{ field: string; operator: string; value: any }>;
      };
      actions: Array<{ field: string; value: any }>;
    }): Promise<McpToolResponse> => {
      try {
        const triggerData: any = {
          title,
          description,
          conditions: {
            all: conditions.all || [],
            any: conditions.any || []
          },
          actions
        };
        
        const result = await zendeskClient.createTrigger(triggerData);
        return {
          content: [{ 
            type: "text", 
            text: `Trigger created successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "update_trigger",
    description: "Update an existing trigger",
    schema: {
      id: z.coerce.number().describe("Trigger ID to update"),
      title: z.string().optional().describe("Updated trigger title"),
      description: z.string().optional().describe("Updated trigger description"),
      conditions: z.object({
        all: z.array(z.object({
          field: z.string().describe("Field to check"),
          operator: z.string().describe("Operator for comparison"),
          value: z.any().describe("Value to compare against")
        })).optional(),
        any: z.array(z.object({
          field: z.string().describe("Field to check"),
          operator: z.string().describe("Operator for comparison"),
          value: z.any().describe("Value to compare against")
        })).optional()
      }).optional().describe("Updated conditions"),
      actions: z.array(z.object({
        field: z.string().describe("Field to modify"),
        value: z.any().describe("Value to set")
      })).optional().describe("Updated actions")
    },
    handler: async ({ id, title, description, conditions, actions }: {
      id: number;
      title?: string;
      description?: string;
      conditions?: {
        all?: Array<{ field: string; operator: string; value: any }>;
        any?: Array<{ field: string; operator: string; value: any }>;
      };
      actions?: Array<{ field: string; value: any }>;
    }): Promise<McpToolResponse> => {
      try {
        const triggerData: any = {};
        
        if (title !== undefined) triggerData.title = title;
        if (description !== undefined) triggerData.description = description;
        if (conditions !== undefined) {
          triggerData.conditions = {
            all: conditions.all || [],
            any: conditions.any || []
          };
        }
        if (actions !== undefined) triggerData.actions = actions;
        
        const result = await zendeskClient.updateTrigger(id, triggerData);
        return {
          content: [{ 
            type: "text", 
            text: `Trigger updated successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "delete_trigger",
    description: "Delete a trigger",
    schema: {
      id: z.coerce.number().describe("Trigger ID to delete")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        await zendeskClient.deleteTrigger(id);
        return {
          content: [{ 
            type: "text", 
            text: `Trigger ${id} deleted successfully!`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  }
];