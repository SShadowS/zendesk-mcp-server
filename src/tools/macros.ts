import { z } from 'zod';
import { zendeskClient } from '../zendesk-client.js';
import { createErrorResponse } from '../utils/errors.js';
import { McpTool, McpToolResponse } from '../types/index.js';

export const macrosTools: McpTool[] = [
  {
    name: "list_macros",
    description: "List macros in Zendesk",
    schema: {
      page: z.coerce.number().optional().describe("Page number for pagination"),
      per_page: z.coerce.number().optional().describe("Number of macros per page (max 100)")
    },
    handler: async ({ page, per_page }: {
      page?: number;
      per_page?: number;
    }): Promise<McpToolResponse> => {
      try {
        const params = { page, per_page };
        const result = await zendeskClient.listMacros(params);
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
    name: "get_macro",
    description: "Get a specific macro by ID",
    schema: {
      id: z.coerce.number().describe("Macro ID")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        const result = await zendeskClient.getMacro(id);
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
    name: "create_macro",
    description: "Create a new macro",
    schema: {
      title: z.string().describe("Macro title"),
      description: z.string().optional().describe("Macro description"),
      actions: z.array(z.object({
        field: z.string().describe("Field to modify"),
        value: z.any().describe("Value to set")
      })).describe("Actions to perform when macro is applied")
    },
    handler: async ({ title, description, actions }: {
      title: string;
      description?: string;
      actions: Array<{ field: string; value: any }>;
    }): Promise<McpToolResponse> => {
      try {
        const macroData = {
          title,
          description,
          actions
        };
        
        const result = await zendeskClient.createMacro(macroData);
        return {
          content: [{ 
            type: "text", 
            text: `Macro created successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "update_macro",
    description: "Update an existing macro",
    schema: {
      id: z.coerce.number().describe("Macro ID to update"),
      title: z.string().optional().describe("Updated macro title"),
      description: z.string().optional().describe("Updated macro description"),
      actions: z.array(z.object({
        field: z.string().describe("Field to modify"),
        value: z.any().describe("Value to set")
      })).optional().describe("Updated actions")
    },
    handler: async ({ id, title, description, actions }: {
      id: number;
      title?: string;
      description?: string;
      actions?: Array<{ field: string; value: any }>;
    }): Promise<McpToolResponse> => {
      try {
        const macroData: any = {};
        
        if (title !== undefined) macroData.title = title;
        if (description !== undefined) macroData.description = description;
        if (actions !== undefined) macroData.actions = actions;
        
        const result = await zendeskClient.updateMacro(id, macroData);
        return {
          content: [{ 
            type: "text", 
            text: `Macro updated successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "delete_macro",
    description: "Delete a macro",
    schema: {
      id: z.coerce.number().describe("Macro ID to delete")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        await zendeskClient.deleteMacro(id);
        return {
          content: [{ 
            type: "text", 
            text: `Macro ${id} deleted successfully!`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  }
];