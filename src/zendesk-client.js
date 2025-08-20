import axios from 'axios';
import { classifyError, ZendeskAuthError } from './utils/errors.js';
import { withRetry, RetryProfiles } from './utils/retry.js';

class ZendeskClient {
  constructor() {
    // Don't load credentials in constructor - load them lazily
    this.debug = process.env.ZENDESK_DEBUG === 'true';
  }

  getCredentials() {
    if (!this._credentials) {
      this._credentials = {
        subdomain: process.env.ZENDESK_SUBDOMAIN,
        email: process.env.ZENDESK_EMAIL,
        apiToken: process.env.ZENDESK_API_TOKEN
      };
      
      if (!this._credentials.subdomain || !this._credentials.email || !this._credentials.apiToken) {
        console.warn('Zendesk credentials not found in environment variables. Please set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, and ZENDESK_API_TOKEN.');
      }
    }
    return this._credentials;
  }

  getBaseUrl() {
    const { subdomain } = this.getCredentials();
    return `https://${subdomain}.zendesk.com/api/v2`;
  }

  getAuthHeader() {
    const { email, apiToken } = this.getCredentials();
    const auth = Buffer.from(`${email}/token:${apiToken}`).toString('base64');
    return `Basic ${auth}`;
  }

  async request(method, endpoint, data = null, params = null, retryProfile = 'default') {
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
    const requestConfig = {
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
      timeout: 60000 // Increased timeout for document downloads
    };

    // Log request details in debug mode
    if (this.debug) {
      console.log(`[Zendesk API] ${method} ${endpoint}`, {
        params,
        dataKeys: data ? Object.keys(data) : null
      });
    }

    // Select retry profile
    const retryOptions = retryProfile === 'none' 
      ? RetryProfiles.none
      : retryProfile === 'aggressive'
      ? RetryProfiles.aggressive
      : retryProfile === 'conservative'
      ? RetryProfiles.conservative
      : {}; // Use default

    // Execute request with retry logic
    try {
      const response = await withRetry(async () => {
        try {
          const axiosResponse = await axios(requestConfig);
          
          // Log success in debug mode
          if (this.debug) {
            console.log(`[Zendesk API] Success: ${method} ${endpoint}`, {
              status: axiosResponse.status,
              hasData: !!axiosResponse.data
            });
          }
          
          return axiosResponse.data;
        } catch (error) {
          // Transform axios error to our custom error types
          throw classifyError(error);
        }
      }, retryOptions);

      return response;
    } catch (error) {
      // Log error details in debug mode
      if (this.debug) {
        console.error(`[Zendesk API] Failed: ${method} ${endpoint}`, {
          errorType: error.name,
          statusCode: error.statusCode,
          message: error.message
        });
      }
      
      // Re-throw the classified error
      throw error;
    }
  }

  // Tickets
  async listTickets(params) {
    return this.request('GET', '/tickets.json', null, params);
  }

  async getTicket(id, includeComments = false) {
    const endpoint = includeComments ? 
      `/tickets/${id}.json?include=comments` : 
      `/tickets/${id}.json`;
    return this.request('GET', endpoint);
  }

  async createTicket(data) {
    return this.request('POST', '/tickets.json', { ticket: data });
  }

  async updateTicket(id, data) {
    return this.request('PUT', `/tickets/${id}.json`, { ticket: data });
  }

  async deleteTicket(id) {
    return this.request('DELETE', `/tickets/${id}.json`);
  }

  async getTicketComments(id, params) {
    return this.request('GET', `/tickets/${id}/comments.json`, null, params);
  }

  async addTicketComment(id, data) {
    return this.request('PUT', `/tickets/${id}.json`, { ticket: { comment: data } });
  }

  async getTicketAttachments(id) {
    const comments = await this.getTicketComments(id);
    const attachments = [];
    
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

  async downloadAttachment(url) {
    // Downloads don't need the full retry logic, use conservative profile
    const requestConfig = {
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
        } catch (error) {
          throw classifyError(error);
        }
      }, RetryProfiles.conservative);
      
      return {
        data: response.data,
        contentType: response.headers['content-type'] || 'application/octet-stream',
        size: response.data.length
      };
    } catch (error) {
      // Re-throw with more specific message
      error.message = `Failed to download attachment: ${error.message}`;
      throw error;
    }
  }

  // Users
  async listUsers(params) {
    return this.request('GET', '/users.json', null, params);
  }

  async getUser(id) {
    return this.request('GET', `/users/${id}.json`);
  }

  async createUser(data) {
    return this.request('POST', '/users.json', { user: data });
  }

  async updateUser(id, data) {
    return this.request('PUT', `/users/${id}.json`, { user: data });
  }

  async deleteUser(id) {
    return this.request('DELETE', `/users/${id}.json`);
  }

  // Organizations
  async listOrganizations(params) {
    return this.request('GET', '/organizations.json', null, params);
  }

  async getOrganization(id) {
    return this.request('GET', `/organizations/${id}.json`);
  }

  async createOrganization(data) {
    return this.request('POST', '/organizations.json', { organization: data });
  }

  async updateOrganization(id, data) {
    return this.request('PUT', `/organizations/${id}.json`, { organization: data });
  }

  async deleteOrganization(id) {
    return this.request('DELETE', `/organizations/${id}.json`);
  }

  // Groups
  async listGroups(params) {
    return this.request('GET', '/groups.json', null, params);
  }

  async getGroup(id) {
    return this.request('GET', `/groups/${id}.json`);
  }

  async createGroup(data) {
    return this.request('POST', '/groups.json', { group: data });
  }

  async updateGroup(id, data) {
    return this.request('PUT', `/groups/${id}.json`, { group: data });
  }

  async deleteGroup(id) {
    return this.request('DELETE', `/groups/${id}.json`);
  }

  // Macros
  async listMacros(params) {
    return this.request('GET', '/macros.json', null, params);
  }

  async getMacro(id) {
    return this.request('GET', `/macros/${id}.json`);
  }

  async createMacro(data) {
    return this.request('POST', '/macros.json', { macro: data });
  }

  async updateMacro(id, data) {
    return this.request('PUT', `/macros/${id}.json`, { macro: data });
  }

  async deleteMacro(id) {
    return this.request('DELETE', `/macros/${id}.json`);
  }

  // Views
  async listViews(params) {
    return this.request('GET', '/views.json', null, params);
  }

  async getView(id) {
    return this.request('GET', `/views/${id}.json`);
  }

  async createView(data) {
    return this.request('POST', '/views.json', { view: data });
  }

  async updateView(id, data) {
    return this.request('PUT', `/views/${id}.json`, { view: data });
  }

  async deleteView(id) {
    return this.request('DELETE', `/views/${id}.json`);
  }

  // Triggers
  async listTriggers(params) {
    return this.request('GET', '/triggers.json', null, params);
  }

  async getTrigger(id) {
    return this.request('GET', `/triggers/${id}.json`);
  }

  async createTrigger(data) {
    return this.request('POST', '/triggers.json', { trigger: data });
  }

  async updateTrigger(id, data) {
    return this.request('PUT', `/triggers/${id}.json`, { trigger: data });
  }

  async deleteTrigger(id) {
    return this.request('DELETE', `/triggers/${id}.json`);
  }

  // Automations
  async listAutomations(params) {
    return this.request('GET', '/automations.json', null, params);
  }

  async getAutomation(id) {
    return this.request('GET', `/automations/${id}.json`);
  }

  async createAutomation(data) {
    return this.request('POST', '/automations.json', { automation: data });
  }

  async updateAutomation(id, data) {
    return this.request('PUT', `/automations/${id}.json`, { automation: data });
  }

  async deleteAutomation(id) {
    return this.request('DELETE', `/automations/${id}.json`);
  }

  // Search
  async search(query, params = {}) {
    return this.request('GET', '/search.json', null, { query, ...params });
  }

  // Help Center
  async listArticles(params) {
    return this.request('GET', '/help_center/articles.json', null, params);
  }

  async getArticle(id) {
    return this.request('GET', `/help_center/articles/${id}.json`);
  }

  async createArticle(data, sectionId) {
    return this.request('POST', `/help_center/sections/${sectionId}/articles.json`, { article: data });
  }

  async updateArticle(id, data) {
    return this.request('PUT', `/help_center/articles/${id}.json`, { article: data });
  }

  async deleteArticle(id) {
    return this.request('DELETE', `/help_center/articles/${id}.json`);
  }

  // Talk
  async getTalkStats() {
    return this.request('GET', '/channels/voice/stats.json');
  }

  // Chat
  async listChats(params) {
    return this.request('GET', '/chats.json', null, params);
  }

  // Test connection
  async testConnection() {
    try {
      const { subdomain, email, apiToken } = this.getCredentials();
      
      if (!subdomain || !email || !apiToken) {
        throw new ZendeskAuthError(
          'Zendesk credentials not configured. Please set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, and ZENDESK_API_TOKEN environment variables.',
          401,
          null
        );
      }

      // console.log(`Testing connection to ${subdomain}.zendesk.com...`);
      
      // Test connection by fetching current user info (no retry for test)
      const response = await this.request('GET', '/users/me.json', null, null, 'none');
      
      if (response && response.user) {
        // console.log(`✓ Successfully connected to Zendesk as ${response.user.name} (${response.user.email})`);
        return { success: true, user: response.user };
      } else {
        throw new Error('Unexpected response from Zendesk API');
      }
    } catch (error) {
      // console.error(`✗ Failed to connect to Zendesk: ${error.message}`);
      throw error;
    }
  }
}

export const zendeskClient = new ZendeskClient();