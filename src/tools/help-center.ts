import { z } from 'zod';
import { zendeskClient } from '../zendesk-client.js';
import { createErrorResponse } from '../utils/errors.js';
import { McpTool, McpToolResponse } from '../types/index.js';

export const helpCenterTools: McpTool[] = [
  {
    name: "list_articles",
    description: "List Help Center articles",
    schema: {
      page: z.coerce.number().optional().describe("Page number for pagination"),
      per_page: z.coerce.number().optional().describe("Number of articles per page (max 100)"),
      sort_by: z.string().optional().describe("Field to sort by"),
      sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)")
    },
    handler: async ({ page, per_page, sort_by, sort_order }: {
      page?: number;
      per_page?: number;
      sort_by?: string;
      sort_order?: "asc" | "desc";
    }): Promise<McpToolResponse> => {
      try {
        const params = { page, per_page, sort_by, sort_order };
        const result = await zendeskClient.listArticles(params);
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
    name: "get_article",
    description: "Get a specific Help Center article by ID",
    schema: {
      id: z.coerce.number().describe("Article ID")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        const result = await zendeskClient.getArticle(id);
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
    name: "create_article",
    description: "Create a new Help Center article",
    schema: {
      title: z.string().describe("Article title"),
      body: z.string().describe("Article body content (HTML)"),
      section_id: z.coerce.number().describe("Section ID where the article will be created"),
      locale: z.string().optional().describe("Article locale (e.g., 'en-us')"),
      draft: z.coerce.boolean().optional().describe("Whether the article is a draft"),
      permission_group_id: z.coerce.number().optional().describe("Permission group ID for the article"),
      user_segment_id: z.coerce.number().optional().describe("User segment ID for the article"),
      label_names: z.array(z.string()).optional().describe("Labels for the article")
    },
    handler: async ({ title, body, section_id, locale, draft, permission_group_id, user_segment_id, label_names }: {
      title: string;
      body: string;
      section_id: number;
      locale?: string;
      draft?: boolean;
      permission_group_id?: number;
      user_segment_id?: number;
      label_names?: string[];
    }): Promise<McpToolResponse> => {
      try {
        const articleData = {
          title,
          body,
          locale,
          draft,
          permission_group_id,
          user_segment_id,
          label_names
        };
        
        const result = await zendeskClient.createArticle(articleData, section_id);
        return {
          content: [{ 
            type: "text", 
            text: `Article created successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "update_article",
    description: "Update an existing Help Center article",
    schema: {
      id: z.coerce.number().describe("Article ID to update"),
      title: z.string().optional().describe("Updated article title"),
      body: z.string().optional().describe("Updated article body content (HTML)"),
      locale: z.string().optional().describe("Updated article locale (e.g., 'en-us')"),
      draft: z.coerce.boolean().optional().describe("Whether the article is a draft"),
      permission_group_id: z.coerce.number().optional().describe("Updated permission group ID"),
      user_segment_id: z.coerce.number().optional().describe("Updated user segment ID"),
      label_names: z.array(z.string()).optional().describe("Updated labels")
    },
    handler: async ({ id, title, body, locale, draft, permission_group_id, user_segment_id, label_names }: {
      id: number;
      title?: string;
      body?: string;
      locale?: string;
      draft?: boolean;
      permission_group_id?: number;
      user_segment_id?: number;
      label_names?: string[];
    }): Promise<McpToolResponse> => {
      try {
        const articleData: any = {};
        
        if (title !== undefined) articleData.title = title;
        if (body !== undefined) articleData.body = body;
        if (locale !== undefined) articleData.locale = locale;
        if (draft !== undefined) articleData.draft = draft;
        if (permission_group_id !== undefined) articleData.permission_group_id = permission_group_id;
        if (user_segment_id !== undefined) articleData.user_segment_id = user_segment_id;
        if (label_names !== undefined) articleData.label_names = label_names;
        
        const result = await zendeskClient.updateArticle(id, articleData);
        return {
          content: [{ 
            type: "text", 
            text: `Article updated successfully!\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  },
  {
    name: "delete_article",
    description: "Delete a Help Center article",
    schema: {
      id: z.coerce.number().describe("Article ID to delete")
    },
    handler: async ({ id }: { id: number }): Promise<McpToolResponse> => {
      try {
        await zendeskClient.deleteArticle(id);
        return {
          content: [{ 
            type: "text", 
            text: `Article ${id} deleted successfully!`
          }]
        };
      } catch (error: any) {
        return createErrorResponse(error);
      }
    }
  }
];