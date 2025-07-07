import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { classifyError, ZendeskAuthError } from './utils/errors.js';
import { withRetry, retryProfiles } from './utils/retry.js';
import { RetryConfig } from './types/config.js';
import { logger } from './utils/logger.js';
import {
  ZendeskResponse,
  ZendeskTicket,
  ZendeskUser,
  ZendeskOrganization,
  ZendeskGroup,
  ZendeskView,
  ZendeskMacro,
  ZendeskAutomation,
  ZendeskTrigger,
  ZendeskArticle,
  ZendeskComment,
  ZendeskAttachment
} from './types/zendesk.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type RetryProfile = 'default' | 'upload' | 'aggressive' | 'none';

interface Credentials {
  subdomain?: string;
  email?: string;
  apiToken?: string;
}

interface AttachmentWithMetadata extends ZendeskAttachment {
  comment_id: number;
  comment_author: number;
}

interface DownloadResult {
  data: Buffer;
  contentType: string;
  size: number;
}

class ZendeskClient {
  private debug: boolean;
  private _credentials?: Credentials;

  constructor() {
    // Don't load credentials in constructor - load them lazily
    this.debug = process.env.ZENDESK_DEBUG === 'true';
  }

  private getCredentials(): Credentials {
    if (!this._credentials) {
      this._credentials = {
        subdomain: process.env.ZENDESK_SUBDOMAIN,
        email: process.env.ZENDESK_EMAIL,
        apiToken: process.env.ZENDESK_API_TOKEN
      };
      
      logger.debug('Loading Zendesk credentials from environment', {
        subdomain: this._credentials.subdomain,
        email: this._credentials.email,
        hasApiToken: !!this._credentials.apiToken,
        apiTokenLength: this._credentials.apiToken?.length
      });
      
      if (!this._credentials.subdomain || !this._credentials.email || !this._credentials.apiToken) {
        logger.error('Zendesk credentials not found in environment variables', {
          hasSubdomain: !!this._credentials.subdomain,
          hasEmail: !!this._credentials.email,
          hasApiToken: !!this._credentials.apiToken
        });
        console.warn('Zendesk credentials not found in environment variables. Please set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, and ZENDESK_API_TOKEN.');
      }
    }
    return this._credentials;
  }

  private getBaseUrl(): string {
    const { subdomain } = this.getCredentials();
    return `https://${subdomain}.zendesk.com/api/v2`;
  }

  private getAuthHeader(): string {
    const { email, apiToken } = this.getCredentials();
    // Zendesk API token auth format: {email}/token:{apiToken}
    const authString = `${email}/token:${apiToken}`;
    logger.debug('Building auth header', { 
      email,
      authFormat: `${email}/token:***`,
      hasToken: !!apiToken,
      tokenLength: apiToken?.length
    });
    const auth = Buffer.from(authString).toString('base64');
    return `Basic ${auth}`;
  }

  private async request<T = any>(
    method: HttpMethod,
    endpoint: string,
    data: any = null,
    params: any = null,
    retryProfile: RetryProfile = 'default'
  ): Promise<T> {
    const { subdomain, email, apiToken } = this.getCredentials();
    
    // Check credentials before making request
    if (!subdomain || !email || !apiToken) {
      throw new ZendeskAuthError(
        'Zendesk credentials not configured. Please set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, and ZENDESK_API_TOKEN environment variables.',
        401,
        null
      );
    }

    const url = `${this.getBaseUrl()}${endpoint}`;
    const requestConfig: AxiosRequestConfig = {
      method,
      url,
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      data,
      params,
      // Add timeout to prevent hanging requests
      timeout: 30000
    };

    // Log request details in debug mode
    if (this.debug) {
      console.log(`[Zendesk API] ${method} ${endpoint}`, {
        params,
        dataKeys: data ? Object.keys(data) : null
      });
    }

    // Select retry profile
    const retryOptions: Partial<RetryConfig> = retryProfile === 'none' 
      ? { maxRetries: 1 }
      : retryProfiles[retryProfile] || retryProfiles.default;

    // Execute request with retry logic
    try {
      const response = await withRetry(async () => {
        try {
          const axiosResponse: AxiosResponse<T> = await axios(requestConfig);
          
          // Log success in debug mode
          logger.debug(`[Zendesk API] Success: ${method} ${endpoint}`, {
            status: axiosResponse.status,
            hasData: !!axiosResponse.data
          });
          
          return axiosResponse.data;
        } catch (error: any) {
          // Transform axios error to our custom error types
          throw classifyError(error);
        }
      }, retryOptions);

      return response;
    } catch (error: any) {
      // Log error details in debug mode
      logger.debug(`[Zendesk API] Failed: ${method} ${endpoint}`, {
        errorType: error.name,
        statusCode: error.statusCode,
        message: error.message
      });
      
      // Re-throw the classified error
      throw error;
    }
  }

  // Tickets
  async listTickets(params?: any): Promise<ZendeskResponse<ZendeskTicket>> {
    return this.request<ZendeskResponse<ZendeskTicket>>('GET', '/tickets.json', null, params);
  }

  async getTicket(id: number, includeComments: boolean = false): Promise<{ ticket: ZendeskTicket }> {
    const endpoint = includeComments ? 
      `/tickets/${id}.json?include=comments` : 
      `/tickets/${id}.json`;
    return this.request<{ ticket: ZendeskTicket }>('GET', endpoint);
  }

  async createTicket(data: Partial<ZendeskTicket>): Promise<{ ticket: ZendeskTicket }> {
    return this.request<{ ticket: ZendeskTicket }>('POST', '/tickets.json', { ticket: data });
  }

  async updateTicket(id: number, data: Partial<ZendeskTicket>): Promise<{ ticket: ZendeskTicket }> {
    return this.request<{ ticket: ZendeskTicket }>('PUT', `/tickets/${id}.json`, { ticket: data });
  }

  async deleteTicket(id: number): Promise<void> {
    return this.request<void>('DELETE', `/tickets/${id}.json`);
  }

  async getTicketComments(id: number, params?: any): Promise<{ comments: ZendeskComment[] }> {
    return this.request<{ comments: ZendeskComment[] }>('GET', `/tickets/${id}/comments.json`, null, params);
  }

  async addTicketComment(id: number, data: any): Promise<{ ticket: ZendeskTicket }> {
    return this.request<{ ticket: ZendeskTicket }>('PUT', `/tickets/${id}.json`, { ticket: { comment: data } });
  }

  async getTicketAttachments(id: number): Promise<{ attachments: AttachmentWithMetadata[] }> {
    const comments = await this.getTicketComments(id);
    const attachments: AttachmentWithMetadata[] = [];
    
    if (comments.comments) {
      comments.comments.forEach(comment => {
        if (comment.attachments && comment.attachments.length > 0) {
          comment.attachments.forEach(attachment => {
            attachments.push({
              ...attachment,
              comment_id: comment.id,
              comment_author: comment.author_id
            });
          });
        }
      });
    }
    
    return { attachments };
  }

  async downloadAttachment(url: string): Promise<DownloadResult> {
    // Downloads don't need the full retry logic, use conservative profile
    const requestConfig: AxiosRequestConfig = {
      method: 'GET',
      url,
      headers: {
        'Authorization': this.getAuthHeader()
      },
      responseType: 'arraybuffer',
      timeout: 60000 // Longer timeout for downloads
    };

    try {
      const response = await withRetry(async () => {
        try {
          return await axios(requestConfig);
        } catch (error: any) {
          throw classifyError(error);
        }
      }, { maxRetries: 2, baseDelay: 2000, maxDelay: 10000, factor: 2 });
      
      return {
        data: response.data,
        contentType: response.headers['content-type'] || 'application/octet-stream',
        size: response.data.length
      };
    } catch (error: any) {
      // Re-throw with more specific message
      error.message = `Failed to download attachment: ${error.message}`;
      throw error;
    }
  }

  // Users
  async listUsers(params?: any): Promise<ZendeskResponse<ZendeskUser>> {
    return this.request<ZendeskResponse<ZendeskUser>>('GET', '/users.json', null, params);
  }

  async getUser(id: number): Promise<{ user: ZendeskUser }> {
    return this.request<{ user: ZendeskUser }>('GET', `/users/${id}.json`);
  }

  async createUser(data: Partial<ZendeskUser>): Promise<{ user: ZendeskUser }> {
    return this.request<{ user: ZendeskUser }>('POST', '/users.json', { user: data });
  }

  async updateUser(id: number, data: Partial<ZendeskUser>): Promise<{ user: ZendeskUser }> {
    return this.request<{ user: ZendeskUser }>('PUT', `/users/${id}.json`, { user: data });
  }

  async deleteUser(id: number): Promise<void> {
    return this.request<void>('DELETE', `/users/${id}.json`);
  }

  // Organizations
  async listOrganizations(params?: any): Promise<ZendeskResponse<ZendeskOrganization>> {
    return this.request<ZendeskResponse<ZendeskOrganization>>('GET', '/organizations.json', null, params);
  }

  async getOrganization(id: number): Promise<{ organization: ZendeskOrganization }> {
    return this.request<{ organization: ZendeskOrganization }>('GET', `/organizations/${id}.json`);
  }

  async createOrganization(data: Partial<ZendeskOrganization>): Promise<{ organization: ZendeskOrganization }> {
    return this.request<{ organization: ZendeskOrganization }>('POST', '/organizations.json', { organization: data });
  }

  async updateOrganization(id: number, data: Partial<ZendeskOrganization>): Promise<{ organization: ZendeskOrganization }> {
    return this.request<{ organization: ZendeskOrganization }>('PUT', `/organizations/${id}.json`, { organization: data });
  }

  async deleteOrganization(id: number): Promise<void> {
    return this.request<void>('DELETE', `/organizations/${id}.json`);
  }

  // Groups
  async listGroups(params?: any): Promise<ZendeskResponse<ZendeskGroup>> {
    return this.request<ZendeskResponse<ZendeskGroup>>('GET', '/groups.json', null, params);
  }

  async getGroup(id: number): Promise<{ group: ZendeskGroup }> {
    return this.request<{ group: ZendeskGroup }>('GET', `/groups/${id}.json`);
  }

  async createGroup(data: Partial<ZendeskGroup>): Promise<{ group: ZendeskGroup }> {
    return this.request<{ group: ZendeskGroup }>('POST', '/groups.json', { group: data });
  }

  async updateGroup(id: number, data: Partial<ZendeskGroup>): Promise<{ group: ZendeskGroup }> {
    return this.request<{ group: ZendeskGroup }>('PUT', `/groups/${id}.json`, { group: data });
  }

  async deleteGroup(id: number): Promise<void> {
    return this.request<void>('DELETE', `/groups/${id}.json`);
  }

  // Macros
  async listMacros(params?: any): Promise<ZendeskResponse<ZendeskMacro>> {
    return this.request<ZendeskResponse<ZendeskMacro>>('GET', '/macros.json', null, params);
  }

  async getMacro(id: number): Promise<{ macro: ZendeskMacro }> {
    return this.request<{ macro: ZendeskMacro }>('GET', `/macros/${id}.json`);
  }

  async createMacro(data: Partial<ZendeskMacro>): Promise<{ macro: ZendeskMacro }> {
    return this.request<{ macro: ZendeskMacro }>('POST', '/macros.json', { macro: data });
  }

  async updateMacro(id: number, data: Partial<ZendeskMacro>): Promise<{ macro: ZendeskMacro }> {
    return this.request<{ macro: ZendeskMacro }>('PUT', `/macros/${id}.json`, { macro: data });
  }

  async deleteMacro(id: number): Promise<void> {
    return this.request<void>('DELETE', `/macros/${id}.json`);
  }

  // Views
  async listViews(params?: any): Promise<ZendeskResponse<ZendeskView>> {
    return this.request<ZendeskResponse<ZendeskView>>('GET', '/views.json', null, params);
  }

  async getView(id: number): Promise<{ view: ZendeskView }> {
    return this.request<{ view: ZendeskView }>('GET', `/views/${id}.json`);
  }

  async createView(data: Partial<ZendeskView>): Promise<{ view: ZendeskView }> {
    return this.request<{ view: ZendeskView }>('POST', '/views.json', { view: data });
  }

  async updateView(id: number, data: Partial<ZendeskView>): Promise<{ view: ZendeskView }> {
    return this.request<{ view: ZendeskView }>('PUT', `/views/${id}.json`, { view: data });
  }

  async deleteView(id: number): Promise<void> {
    return this.request<void>('DELETE', `/views/${id}.json`);
  }

  // Triggers
  async listTriggers(params?: any): Promise<ZendeskResponse<ZendeskTrigger>> {
    return this.request<ZendeskResponse<ZendeskTrigger>>('GET', '/triggers.json', null, params);
  }

  async getTrigger(id: number): Promise<{ trigger: ZendeskTrigger }> {
    return this.request<{ trigger: ZendeskTrigger }>('GET', `/triggers/${id}.json`);
  }

  async createTrigger(data: Partial<ZendeskTrigger>): Promise<{ trigger: ZendeskTrigger }> {
    return this.request<{ trigger: ZendeskTrigger }>('POST', '/triggers.json', { trigger: data });
  }

  async updateTrigger(id: number, data: Partial<ZendeskTrigger>): Promise<{ trigger: ZendeskTrigger }> {
    return this.request<{ trigger: ZendeskTrigger }>('PUT', `/triggers/${id}.json`, { trigger: data });
  }

  async deleteTrigger(id: number): Promise<void> {
    return this.request<void>('DELETE', `/triggers/${id}.json`);
  }

  // Automations
  async listAutomations(params?: any): Promise<ZendeskResponse<ZendeskAutomation>> {
    return this.request<ZendeskResponse<ZendeskAutomation>>('GET', '/automations.json', null, params);
  }

  async getAutomation(id: number): Promise<{ automation: ZendeskAutomation }> {
    return this.request<{ automation: ZendeskAutomation }>('GET', `/automations/${id}.json`);
  }

  async createAutomation(data: Partial<ZendeskAutomation>): Promise<{ automation: ZendeskAutomation }> {
    return this.request<{ automation: ZendeskAutomation }>('POST', '/automations.json', { automation: data });
  }

  async updateAutomation(id: number, data: Partial<ZendeskAutomation>): Promise<{ automation: ZendeskAutomation }> {
    return this.request<{ automation: ZendeskAutomation }>('PUT', `/automations/${id}.json`, { automation: data });
  }

  async deleteAutomation(id: number): Promise<void> {
    return this.request<void>('DELETE', `/automations/${id}.json`);
  }

  // Search
  async search(query: string, params: any = {}): Promise<any> {
    return this.request('GET', '/search.json', null, { query, ...params });
  }

  // Help Center
  async listArticles(params?: any): Promise<{ articles: ZendeskArticle[] }> {
    return this.request<{ articles: ZendeskArticle[] }>('GET', '/help_center/articles.json', null, params);
  }

  async getArticle(id: number): Promise<{ article: ZendeskArticle }> {
    return this.request<{ article: ZendeskArticle }>('GET', `/help_center/articles/${id}.json`);
  }

  async createArticle(data: Partial<ZendeskArticle>, sectionId: number): Promise<{ article: ZendeskArticle }> {
    return this.request<{ article: ZendeskArticle }>('POST', `/help_center/sections/${sectionId}/articles.json`, { article: data });
  }

  async updateArticle(id: number, data: Partial<ZendeskArticle>): Promise<{ article: ZendeskArticle }> {
    return this.request<{ article: ZendeskArticle }>('PUT', `/help_center/articles/${id}.json`, { article: data });
  }

  async deleteArticle(id: number): Promise<void> {
    return this.request<void>('DELETE', `/help_center/articles/${id}.json`);
  }

  // Talk
  async getTalkStats(): Promise<any> {
    return this.request('GET', '/channels/voice/stats.json');
  }

  // Chat
  async listChats(params?: any): Promise<any> {
    return this.request('GET', '/chats.json', null, params);
  }

  // Test connection
  async testConnection(): Promise<{ success: boolean; user: ZendeskUser }> {
    try {
      const { subdomain, email, apiToken } = this.getCredentials();
      
      if (!subdomain || !email || !apiToken) {
        throw new ZendeskAuthError(
          'Zendesk credentials not configured. Please set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, and ZENDESK_API_TOKEN environment variables.',
          401,
          null
        );
      }

      logger.info(`Testing connection to ${subdomain}.zendesk.com...`);
      
      // Test connection by fetching current user info (no retry for test)
      const response = await this.request<{ user: ZendeskUser }>('GET', '/users/me.json', null, null, 'none');
      
      if (response && response.user) {
        logger.info(`✓ Successfully connected to Zendesk as ${response.user.name} (${response.user.email})`);
        return { success: true, user: response.user };
      } else {
        throw new Error('Unexpected response from Zendesk API');
      }
    } catch (error: any) {
      console.error(`✗ Failed to connect to Zendesk: ${error.message}`);
      throw error;
    }
  }
}

export const zendeskClient = new ZendeskClient();