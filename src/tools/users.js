import { z } from 'zod';
    import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

    export const usersTools = [
      {
        name: "list_users",
        description: "List Zendesk users with optional role filter (`end-user`, `agent`, `admin`). For finding a user by email/name/organization/external_id, use `search` with `type:user email:<email>` — that's far cheaper than paginating the full directory. `list_users` is appropriate when you need the full directory feed (e.g. building a snapshot).",
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
        description: "Fetch one user by numeric ID, returning the full profile (name, email, role, organization, tags, custom_fields). If you only have an email or name, use `search` with `type:user email:<email>` first to find the ID.",
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
        description: "Create a new Zendesk user. Email must be unique across the instance — duplicates return 422. Role defaults to `end-user`; specify `agent` or `admin` for staff accounts. Returns the created user's full profile including the auto-assigned ID.",
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
        description: "Update an existing user. Pass only the fields you want to change; omitted fields are preserved. Use `get_user` first to confirm the ID and current state. Note: this tool's schema does not accept null for any optional field — to fully clear a value (e.g. `organization_id`) you'd need to hit Zendesk's PUT /api/v2/users/{id} endpoint directly with an explicit null. String fields can be cleared by passing an empty string.",
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
        description: "Soft-delete a Zendesk user (sets active:false; the record is retained for ticket history). To permanently purge, use Zendesk's GDPR delete endpoint (not exposed by this tool). Cannot delete the account owner.",
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
