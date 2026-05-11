import { z } from 'zod';
    import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

    export const organizationsTools = [
      {
        name: "list_organizations",
        description: "List ALL organizations in the Zendesk instance. No filter parameters — to find an organization by name, domain, external_id, or tag use `search` with `type:organization name:<name>` or `type:organization tags:<tag>`. Supports pagination.",
        schema: z.object({
          page: z.number().optional().describe("Page number for pagination"),
          per_page: z.number().optional().describe("Number of organizations per page (max 100)")
        }),
        handler: async ({ page, per_page }) => {
          try {
            const zendeskClient = getZendeskClient();
            const params = { page, per_page };
            const result = await zendeskClient.listOrganizations(params);
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
        name: "get_organization",
        description: "Fetch one organization by numeric ID, returning name, domain_names, tags, custom_fields, and notes. If you only have a name or domain, use `search` first to find the ID.",
        schema: z.object({
          id: z.number().describe("Organization ID")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            const result = await zendeskClient.getOrganization(id);
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
        name: "create_organization",
        description: "Create a new organization. Name must be unique within the instance. Use domain_names (array) to auto-associate end-users whose email domain matches.",
        schema: z.object({
          name: z.string().describe("Organization name"),
          domain_names: z.array(z.string()).optional().describe("Domain names for the organization"),
          details: z.string().optional().describe("Details about the organization"),
          notes: z.string().optional().describe("Notes about the organization"),
          tags: z.array(z.string()).optional().describe("Tags for the organization")
        }),
        handler: async ({ name, domain_names, details, notes, tags }) => {
          try {
            const zendeskClient = getZendeskClient();
            const orgData = {
              name,
              domain_names,
              details,
              notes,
              tags
            };
            
            const result = await zendeskClient.createOrganization(orgData);
            return {
              content: [{ 
                type: "text", 
                text: `Organization created successfully!\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "update_organization",
        description: "Update an existing organization. Pass only the fields you want to change. To clear domain_names or tags, pass an empty array.",
        schema: z.object({
          id: z.number().describe("Organization ID to update"),
          name: z.string().optional().describe("Updated organization name"),
          domain_names: z.array(z.string()).optional().describe("Updated domain names"),
          details: z.string().optional().describe("Updated details"),
          notes: z.string().optional().describe("Updated notes"),
          tags: z.array(z.string()).optional().describe("Updated tags")
        }),
        handler: async ({ id, name, domain_names, details, notes, tags }) => {
          try {
            const zendeskClient = getZendeskClient();
            const orgData = {};
            
            if (name !== undefined) orgData.name = name;
            if (domain_names !== undefined) orgData.domain_names = domain_names;
            if (details !== undefined) orgData.details = details;
            if (notes !== undefined) orgData.notes = notes;
            if (tags !== undefined) orgData.tags = tags;
            
            const result = await zendeskClient.updateOrganization(id, orgData);
            return {
              content: [{ 
                type: "text", 
                text: `Organization updated successfully!\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "delete_organization",
        description: "Delete an organization. Associated users are not deleted but are unlinked from the org.",
        schema: z.object({
          id: z.number().describe("Organization ID to delete")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            await zendeskClient.deleteOrganization(id);
            return {
              content: [{ 
                type: "text", 
                text: `Organization ${id} deleted successfully!`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      }
    ];
