import { z } from 'zod';
    import { zendeskClient } from '../zendesk-client.js';

    export const viewsTools = [
      {
        name: "list_views",
        description: "List views in Zendesk",
        schema: {
          page: z.number().optional().describe("Page number for pagination"),
          per_page: z.number().optional().describe("Number of views per page (max 100)")
        },
        handler: async ({ page, per_page }) => {
          try {
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
        description: "Get a specific view by ID",
        schema: {
          id: z.number().describe("View ID")
        },
        handler: async ({ id }) => {
          try {
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
        handler: async ({ title, description, conditions }) => {
          try {
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
        handler: async ({ id, title, description, conditions }) => {
          try {
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
        description: "Delete a view",
        schema: {
          id: z.number().describe("View ID to delete")
        },
        handler: async ({ id }) => {
          try {
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
