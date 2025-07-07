import { z } from 'zod';
import { zendeskClient } from '../zendesk-client.js';
import { createErrorResponse } from '../utils/errors.js';
import { McpTool, McpToolResponse } from '../types/index.js';

export const viewsTools: McpTool[] = [
  {
    name: "list_views",
    description: "List views in Zendesk",
    schema: {
      page: z.number().optional().describe("Page number for pagination"),
      per_page: z.number().optional().describe("Number of views per page (max 100)")
    },
    handler: async ({ page, per_page }: {
      page?: number;
      per_page?: number;
    }): Promise<McpToolResponse> => {
      try {
        const params = { page, per_page };
        const result = await zendeskClient.listViews(params);
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
    name: "get_view",
    description: "Get a specific view by ID",
    schema: {
      id: z.number().describe("View ID")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        const result = await zendeskClient.getView(id);
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
    name: "create_view",
    description: "Create a new view",
    schema: {
      title: z.string().describe("View title"),
      description: z.string().optional().describe("View description"),
      conditions: z.object({
        all: z.array(z.object({
          field: z.string().describe("Field to filter on"),
          operator: z.string().describe("Operator for comparison"),
          value: z.any().describe("Value to compare against")
        })).optional(),
        any: z.array(z.object({
          field: z.string().describe("Field to filter on"),
          operator: z.string().describe("Operator for comparison"),
          value: z.any().describe("Value to compare against")
        })).optional()
      }).describe("Conditions for the view")
    },
    handler: async ({ title, description, conditions }: {
      title: string;
      description?: string;
      conditions: {
        all?: Array<{ field: string; operator: string; value: any }>;
        any?: Array<{ field: string; operator: string; value: any }>;
      };
    }): Promise<McpToolResponse> => {
      try {
        const viewData: any = {
          title,
          description,
          conditions: {
            all: conditions.all || [],
            any: conditions.any || []
          }
        };
        
        const result = await zendeskClient.createView(viewData);
        return {
          content: [{ 
            type: "text", 
            text: `View created successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "update_view",
    description: "Update an existing view",
    schema: {
      id: z.number().describe("View ID to update"),
      title: z.string().optional().describe("Updated view title"),
      description: z.string().optional().describe("Updated view description"),
      conditions: z.object({
        all: z.array(z.object({
          field: z.string().describe("Field to filter on"),
          operator: z.string().describe("Operator for comparison"),
          value: z.any().describe("Value to compare against")
        })).optional(),
        any: z.array(z.object({
          field: z.string().describe("Field to filter on"),
          operator: z.string().describe("Operator for comparison"),
          value: z.any().describe("Value to compare against")
        })).optional()
      }).optional().describe("Updated conditions")
    },
    handler: async ({ id, title, description, conditions }: {
      id: number;
      title?: string;
      description?: string;
      conditions?: {
        all?: Array<{ field: string; operator: string; value: any }>;
        any?: Array<{ field: string; operator: string; value: any }>;
      };
    }): Promise<McpToolResponse> => {
      try {
        const viewData: any = {};
        
        if (title !== undefined) viewData.title = title;
        if (description !== undefined) viewData.description = description;
        if (conditions !== undefined) {
          viewData.conditions = {
            all: conditions.all || [],
            any: conditions.any || []
          };
        }
        
        const result = await zendeskClient.updateView(id, viewData);
        return {
          content: [{ 
            type: "text", 
            text: `View updated successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "delete_view",
    description: "Delete a view",
    schema: {
      id: z.number().describe("View ID to delete")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        await zendeskClient.deleteView(id);
        return {
          content: [{ 
            type: "text", 
            text: `View ${id} deleted successfully!`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  }
];