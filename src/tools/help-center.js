import { z } from 'zod';
    import { getZendeskClient } from '../request-context.js';
import { createErrorResponse } from '../utils/errors.js';

    export const helpCenterTools = [
      {
        name: "list_articles",
        description: "List Help Center articles",
        schema: z.object({
          page: z.number().optional().describe("Page number for pagination"),
          per_page: z.number().optional().describe("Number of articles per page (max 100)"),
          sort_by: z.string().optional().describe("Field to sort by"),
          sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)")
        }),
        handler: async ({ page, per_page, sort_by, sort_order }) => {
          try {
            const zendeskClient = getZendeskClient();
            const params = { page, per_page, sort_by, sort_order };
            const result = await zendeskClient.listArticles(params);
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
        name: "get_article",
        description: "Get a specific Help Center article by ID",
        schema: z.object({
          id: z.number().describe("Article ID")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            const result = await zendeskClient.getArticle(id);
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
        name: "create_article",
        description: "Create a new Help Center article",
        schema: z.object({
          title: z.string().describe("Article title"),
          body: z.string().describe("Article body content (HTML)"),
          section_id: z.number().describe("Section ID where the article will be created"),
          locale: z.string().optional().describe("Article locale (e.g., 'en-us')"),
          draft: z.boolean().optional().describe("Whether the article is a draft"),
          permission_group_id: z.number().optional().describe("Permission group ID for the article"),
          user_segment_id: z.number().optional().describe("User segment ID for the article"),
          label_names: z.array(z.string()).optional().describe("Labels for the article")
        }),
        handler: async ({ title, body, section_id, locale, draft, permission_group_id, user_segment_id, label_names }) => {
          try {
            const zendeskClient = getZendeskClient();
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
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "update_article",
        description: "Update an existing Help Center article",
        schema: z.object({
          id: z.number().describe("Article ID to update"),
          title: z.string().optional().describe("Updated article title"),
          body: z.string().optional().describe("Updated article body content (HTML)"),
          locale: z.string().optional().describe("Updated article locale (e.g., 'en-us')"),
          draft: z.boolean().optional().describe("Whether the article is a draft"),
          permission_group_id: z.number().optional().describe("Updated permission group ID"),
          user_segment_id: z.number().optional().describe("Updated user segment ID"),
          label_names: z.array(z.string()).optional().describe("Updated labels")
        }),
        handler: async ({ id, title, body, locale, draft, permission_group_id, user_segment_id, label_names }) => {
          try {
            const zendeskClient = getZendeskClient();
            const articleData = {};
            
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
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      },
      {
        name: "delete_article",
        description: "Delete a Help Center article",
        schema: z.object({
          id: z.number().describe("Article ID to delete")
        }),
        handler: async ({ id }) => {
          try {
            const zendeskClient = getZendeskClient();
            await zendeskClient.deleteArticle(id);
            return {
              content: [{ 
                type: "text", 
                text: `Article ${id} deleted successfully!`
              }]
            };
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      }
    ];
