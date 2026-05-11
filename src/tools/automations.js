import { z } from 'zod';
    import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

    export const automationsTools = [
      {
        name: "list_automations",
        description: "List ALL automations (time-based rules that run hourly — e.g. closing pending tickets after 7 days). Unlike triggers, automations fire on a schedule, not on events. Use this to audit existing time-based workflows.",
        schema: z.object({
          page: z.number().optional().describe("Page number for pagination"),
          per_page: z.number().optional().describe("Number of automations per page (max 100)")
        }),
        handler: async ({ page, per_page }) => {
          try {
            const zendeskClient = getZendeskClient();
            const params = { page, per_page };
            const result = await zendeskClient.listAutomations(params);
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
        name: "get_automation",
        description: "Fetch one automation's definition by numeric ID, including its conditions and actions array.",
        schema: z.object({
          id: z.number().describe("Automation ID")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            const result = await zendeskClient.getAutomation(id);
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
        name: "create_automation",
        description: "Create a new automation (runs hourly on tickets matching the conditions). Requires title, conditions, and actions. Conditions should include a time-based field (e.g. hours_since_update) — otherwise consider a trigger instead.",
        schema: z.object({
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
        }),
        handler: async ({ title, description, conditions, actions }) => {
          try {
            const zendeskClient = getZendeskClient();
            const automationData = {
              title,
              description,
              conditions,
              actions
            };
            
            const result = await zendeskClient.createAutomation(automationData);
            return {
              content: [{ 
                type: "text", 
                text: `Automation created successfully!\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "update_automation",
        description: "Update an existing automation. Pass `conditions` and/or `actions` to replace those sections (not merge).",
        schema: z.object({
          id: z.number().describe("Automation ID to update"),
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
        }),
        handler: async ({ id, title, description, conditions, actions }) => {
          try {
            const zendeskClient = getZendeskClient();
            const automationData = {};
            
            if (title !== undefined) automationData.title = title;
            if (description !== undefined) automationData.description = description;
            if (conditions !== undefined) automationData.conditions = conditions;
            if (actions !== undefined) automationData.actions = actions;
            
            const result = await zendeskClient.updateAutomation(id, automationData);
            return {
              content: [{ 
                type: "text", 
                text: `Automation updated successfully!\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "delete_automation",
        description: "Delete an automation. Tickets previously modified by it are unaffected.",
        schema: z.object({
          id: z.number().describe("Automation ID to delete")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            await zendeskClient.deleteAutomation(id);
            return {
              content: [{ 
                type: "text", 
                text: `Automation ${id} deleted successfully!`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      }
    ];
