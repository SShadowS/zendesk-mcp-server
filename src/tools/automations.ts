import { z } from 'zod';
import { zendeskClient } from '../zendesk-client.js';
import { createErrorResponse } from '../utils/errors.js';
import { McpTool, McpToolResponse } from '../types/index.js';

export const automationsTools: McpTool[] = [
  {
    name: "list_automations",
    description: "List automations in Zendesk",
    schema: {
      page: z.coerce.number().optional().describe("Page number for pagination"),
      per_page: z.coerce.number().optional().describe("Number of automations per page (max 100)")
    },
    handler: async ({ page, per_page }: {
      page?: number;
      per_page?: number;
    }): Promise<McpToolResponse> => {
      try {
        const params = { page, per_page };
        const result = await zendeskClient.listAutomations(params);
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
    name: "get_automation",
    description: "Get a specific automation by ID",
    schema: {
      id: z.coerce.number().describe("Automation ID")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        const result = await zendeskClient.getAutomation(id);
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
    name: "create_automation",
    description: "Create a new automation",
    schema: {
      title: z.string().describe("Automation title"),
      description: z.string().optional().describe("Automation description"),
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
      }).describe("Conditions for the automation"),
      actions: z.array(z.object({
        field: z.string().describe("Field to modify"),
        value: z.any().describe("Value to set")
      })).describe("Actions to perform when automation conditions are met")
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
        const automationData: any = {
          title,
          description,
          conditions: {
            all: conditions.all || [],
            any: conditions.any || []
          },
          actions
        };
        
        const result = await zendeskClient.createAutomation(automationData);
        return {
          content: [{ 
            type: "text", 
            text: `Automation created successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "update_automation",
    description: "Update an existing automation",
    schema: {
      id: z.coerce.number().describe("Automation ID to update"),
      title: z.string().optional().describe("Updated automation title"),
      description: z.string().optional().describe("Updated automation description"),
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
        const automationData: any = {};
        
        if (title !== undefined) automationData.title = title;
        if (description !== undefined) automationData.description = description;
        if (conditions !== undefined) {
          automationData.conditions = {
            all: conditions.all || [],
            any: conditions.any || []
          };
        }
        if (actions !== undefined) automationData.actions = actions;
        
        const result = await zendeskClient.updateAutomation(id, automationData);
        return {
          content: [{ 
            type: "text", 
            text: `Automation updated successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "delete_automation",
    description: "Delete an automation",
    schema: {
      id: z.coerce.number().describe("Automation ID to delete")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        await zendeskClient.deleteAutomation(id);
        return {
          content: [{ 
            type: "text", 
            text: `Automation ${id} deleted successfully!`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  }
];