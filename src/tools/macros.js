import { z } from 'zod';
    import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

    export const macrosTools = [
      {
        name: "list_macros",
        description: "List ALL macros (predefined ticket actions agents can apply) accessible to the API user. Use this to discover macro IDs and inspect what canned responses or ticket updates your team has built.",
        schema: z.object({
          page: z.number().optional().describe("Page number for pagination"),
          per_page: z.number().optional().describe("Number of macros per page (max 100)")
        }),
        handler: async ({ page, per_page }) => {
          try {
            const zendeskClient = getZendeskClient();
            const params = { page, per_page };
            const result = await zendeskClient.listMacros(params);
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
      },
      {
        name: "get_macro",
        description: "Fetch one macro's definition by numeric ID, including the title and the array of actions it performs (status change, comment, tag adds, etc.).",
        schema: z.object({
          id: z.number().describe("Macro ID")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            const result = await zendeskClient.getMacro(id);
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
      },
      {
        name: "create_macro",
        description: "Create a new macro. Provide `title` and an `actions` array. Each action is `{field, value}` describing what the macro changes when applied.",
        schema: z.object({
          title: z.string().describe("Macro title"),
          description: z.string().optional().describe("Macro description"),
          actions: z.array(z.object({
            field: z.string().describe("Field to modify"),
            value: z.any().describe("Value to set")
          })).describe("Actions to perform when macro is applied")
        }),
        handler: async ({ title, description, actions }) => {
          try {
            const zendeskClient = getZendeskClient();
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
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "update_macro",
        description: "Update an existing macro's title or actions. Pass `actions` to replace the full action set (not merge).",
        schema: z.object({
          id: z.number().describe("Macro ID to update"),
          title: z.string().optional().describe("Updated macro title"),
          description: z.string().optional().describe("Updated macro description"),
          actions: z.array(z.object({
            field: z.string().describe("Field to modify"),
            value: z.any().describe("Value to set")
          })).optional().describe("Updated actions")
        }),
        handler: async ({ id, title, description, actions }) => {
          try {
            const zendeskClient = getZendeskClient();
            const macroData = {};
            
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
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "delete_macro",
        description: "Delete a macro. Tickets previously modified by it are unaffected.",
        schema: z.object({
          id: z.number().describe("Macro ID to delete")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            await zendeskClient.deleteMacro(id);
            return {
              content: [{ 
                type: "text", 
                text: `Macro ${id} deleted successfully!`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      }
    ];
