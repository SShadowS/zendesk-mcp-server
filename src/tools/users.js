import { z } from 'zod';
    import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

    export const usersTools = [
      {
        name: "list_users",
        description: "List users in Zendesk",
        schema: z.object({
          page: z.number().optional().describe("Page number for pagination"),
          per_page: z.number().optional().describe("Number of users per page (max 100)"),
          role: z.enum(["end-user", "agent", "admin"]).optional().describe("Filter users by role")
        }),
        handler: async ({ page, per_page, role }) => {
          try {
            const zendeskClient = getZendeskClient();
            const params = { page, per_page, role };
            const result = await zendeskClient.listUsers(params);
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
        name: "get_user",
        description: "Get a specific user by ID",
        schema: z.object({
          id: z.number().describe("User ID")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            const result = await zendeskClient.getUser(id);
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
        name: "create_user",
        description: "Create a new user",
        schema: z.object({
          name: z.string().describe("User's full name"),
          email: z.string().email().describe("User's email address"),
          role: z.enum(["end-user", "agent", "admin"]).optional().describe("User's role"),
          phone: z.string().optional().describe("User's phone number"),
          organization_id: z.number().optional().describe("ID of the user's organization"),
          tags: z.array(z.string()).optional().describe("Tags for the user"),
          notes: z.string().optional().describe("Notes about the user")
        }),
        handler: async ({ name, email, role, phone, organization_id, tags, notes }) => {
          try {
            const zendeskClient = getZendeskClient();
            const userData = {
              name,
              email,
              role,
              phone,
              organization_id,
              tags,
              notes
            };
            
            const result = await zendeskClient.createUser(userData);
            return {
              content: [{ 
                type: "text", 
                text: `User created successfully!\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "update_user",
        description: "Update an existing user",
        schema: z.object({
          id: z.number().describe("User ID to update"),
          name: z.string().optional().describe("Updated user's name"),
          email: z.string().email().optional().describe("Updated email address"),
          role: z.enum(["end-user", "agent", "admin"]).optional().describe("Updated user's role"),
          phone: z.string().optional().describe("Updated phone number"),
          organization_id: z.number().optional().describe("Updated organization ID"),
          tags: z.array(z.string()).optional().describe("Updated tags for the user"),
          notes: z.string().optional().describe("Updated notes about the user")
        }),
        handler: async ({ id, name, email, role, phone, organization_id, tags, notes }) => {
          try {
            const zendeskClient = getZendeskClient();
            const userData = {};
            
            if (name !== undefined) userData.name = name;
            if (email !== undefined) userData.email = email;
            if (role !== undefined) userData.role = role;
            if (phone !== undefined) userData.phone = phone;
            if (organization_id !== undefined) userData.organization_id = organization_id;
            if (tags !== undefined) userData.tags = tags;
            if (notes !== undefined) userData.notes = notes;
            
            const result = await zendeskClient.updateUser(id, userData);
            return {
              content: [{ 
                type: "text", 
                text: `User updated successfully!\n\n${JSON.stringify(result, null, 2)}`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "delete_user",
        description: "Delete a user",
        schema: z.object({
          id: z.number().describe("User ID to delete")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            await zendeskClient.deleteUser(id);
            return {
              content: [{ 
                type: "text", 
                text: `User ${id} deleted successfully!`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      }
    ];
