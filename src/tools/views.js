import { z } from 'zod';
    import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

    export const viewsTools = [
      {
        name: "list_views",
        description: "List ALL saved ticket views (filtered ticket lists agents use as dashboards) accessible to the API user. Use this to discover view IDs, then call Zendesk's `/api/v2/views/{id}/tickets` for the actual ticket list (this MCP doesn't yet expose execute_view; use `search` with the equivalent filters as a workaround).",
        schema: z.object({
          page: z.number().optional().describe("Page number for pagination"),
          per_page: z.number().optional().describe("Number of views per page (max 100)")
        }),
        handler: async ({ page, per_page }) => {
          try {
            const zendeskClient = getZendeskClient();
            const params = { page, per_page };
            const result = await zendeskClient.listViews(params);
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
        name: "get_view",
        description: "Fetch one view's definition by numeric ID, returning the filter conditions, title, and metadata. Useful for understanding how an agent's existing dashboard is built.",
        schema: z.object({
          id: z.number().describe("View ID")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            const result = await zendeskClient.getView(id);
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
        name: "create_view",
        description: "Create a new ticket view. Pass `conditions` as an object with optional `all` and `any` arrays (Zendesk evaluates `all` as AND-logic, `any` as OR-logic). Each condition is `{field, operator, value}` per Zendesk's view conditions schema.",
        schema: z.object({
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
        }),
        handler: async ({ title, description, conditions }) => {
          try {
            const zendeskClient = getZendeskClient();
            const viewData = {
              title,
              description,
              conditions
            };
            
            const result = await zendeskClient.createView(viewData);
            return {
              content: [{ 
                type: "text", 
                text: `View created successfully!\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "update_view",
        description: "Update an existing view's title, description, or conditions (the fields this tool's schema exposes). Use `get_view` first to retrieve and modify the current condition structure. Note: output-column and group-by tweaks aren't supported by this tool's schema — for those, hit Zendesk's PUT /api/v2/views/{id} directly.",
        schema: z.object({
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
        }),
        handler: async ({ id, title, description, conditions }) => {
          try {
            const zendeskClient = getZendeskClient();
            const viewData = {};
            
            if (title !== undefined) viewData.title = title;
            if (description !== undefined) viewData.description = description;
            if (conditions !== undefined) viewData.conditions = conditions;
            
            const result = await zendeskClient.updateView(id, viewData);
            return {
              content: [{ 
                type: "text", 
                text: `View updated successfully!\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "delete_view",
        description: "Delete a saved view. Tickets are unaffected.",
        schema: z.object({
          id: z.number().describe("View ID to delete")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            await zendeskClient.deleteView(id);
            return {
              content: [{ 
                type: "text", 
                text: `View ${id} deleted successfully!`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      }
    ];
