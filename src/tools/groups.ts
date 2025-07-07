import { z } from 'zod';
import { zendeskClient } from '../zendesk-client.js';
import { createErrorResponse } from '../utils/errors.js';
import { McpTool, McpToolResponse } from '../types/index.js';

export const groupsTools: McpTool[] = [
  {
    name: "list_groups",
    description: "List agent groups in Zendesk",
    schema: {
      page: z.number().optional().describe("Page number for pagination"),
      per_page: z.number().optional().describe("Number of groups per page (max 100)")
    },
    handler: async ({ page, per_page }: {
      page?: number;
      per_page?: number;
    }): Promise<McpToolResponse> => {
      try {
        const params = { page, per_page };
        const result = await zendeskClient.listGroups(params);
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
    name: "get_group",
    description: "Get a specific group by ID",
    schema: {
      id: z.number().describe("Group ID")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        const result = await zendeskClient.getGroup(id);
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
    name: "create_group",
    description: "Create a new agent group",
    schema: {
      name: z.string().describe("Group name"),
      description: z.string().optional().describe("Group description")
    },
    handler: async ({ name, description }: {
      name: string;
      description?: string;
    }): Promise<McpToolResponse> => {
      try {
        const groupData = {
          name,
          description
        };
        
        const result = await zendeskClient.createGroup(groupData);
        return {
          content: [{ 
            type: "text", 
            text: `Group created successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "update_group",
    description: "Update an existing group",
    schema: {
      id: z.number().describe("Group ID to update"),
      name: z.string().optional().describe("Updated group name"),
      description: z.string().optional().describe("Updated group description")
    },
    handler: async ({ id, name, description }: {
      id: number;
      name?: string;
      description?: string;
    }): Promise<McpToolResponse> => {
      try {
        const groupData: any = {};
        
        if (name !== undefined) groupData.name = name;
        if (description !== undefined) groupData.description = description;
        
        const result = await zendeskClient.updateGroup(id, groupData);
        return {
          content: [{ 
            type: "text", 
            text: `Group updated successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "delete_group",
    description: "Delete a group",
    schema: {
      id: z.number().describe("Group ID to delete")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        await zendeskClient.deleteGroup(id);
        return {
          content: [{ 
            type: "text", 
            text: `Group ${id} deleted successfully!`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  }
];