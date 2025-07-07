
/**
 * MCP Tool Definition
 */
export interface McpTool {
  name: string;
  description: string;
  schema: any; // MCP SDK expects a plain object, not a Zod schema
  handler: McpToolHandler;
}

/**
 * MCP Tool Handler Function
 */
export type McpToolHandler = (args: any) => Promise<McpToolResponse>;

/**
 * MCP Tool Response
 */
export interface McpToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

/**
 * MCP Error Response
 */
export interface McpErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

/**
 * Type guard for MCP error responses
 */
export function isMcpError(response: any): response is McpErrorResponse {
  return response && typeof response === 'object' && 'error' in response;
}

/**
 * Resource definition for MCP server
 */
export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Tool array type for consistent exports
 */
export type ToolArray = McpTool[];