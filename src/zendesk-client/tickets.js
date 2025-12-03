import axios from 'axios';
import { classifyError } from '../utils/errors.js';
import { withRetry, RetryProfiles } from '../utils/retry.js';

/**
 * Tickets mixin - adds ticket-related methods to ZendeskClient
 * @param {typeof import('./base.js').ZendeskClientBase} Base
 */
export function TicketsMixin(Base) {
  return class extends Base {
    async listTickets(params) {
      return this.request('GET', '/tickets.json', null, params);
    }

    async getTicket(id, includeComments = false) {
      const endpoint = includeComments
        ? `/tickets/${id}.json?include=comments`
        : `/tickets/${id}.json`;
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

    async getTicketAttachments(id, options = {}) {
      const { includeInlineImages = true } = options;
      const comments = await this.getTicketComments(id);
      const attachments = [];

      if (comments.comments) {
        comments.comments.forEach(comment => {
          if (comment.attachments && comment.attachments.length > 0) {
            comment.attachments.forEach(attachment => {
              attachments.push({
                ...attachment,
                comment_id: comment.id,
                comment_author: comment.author_id,
                is_inline: false
              });
            });
          }

          if (includeInlineImages && comment.html_body) {
            const inlineImages = this.extractInlineImages(comment.html_body, comment.id, comment.author_id);
            attachments.push(...inlineImages);
          }
        });
      }

      return { attachments };
    }

    /**
     * Extract inline image URLs from HTML content
     * @param {string} htmlBody - The HTML body of a comment
     * @param {number} commentId - The comment ID
     * @param {number} authorId - The comment author ID
     * @returns {Array} Array of attachment-like objects for inline images
     */
    extractInlineImages(htmlBody, commentId, authorId) {
      const inlineImages = [];
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
      let match;
      let index = 0;

      while ((match = imgRegex.exec(htmlBody)) !== null) {
        const src = match[1];

        if (!src || src.startsWith('data:') || (!src.startsWith('http') && !src.startsWith('//'))) {
          continue;
        }

        const normalizedUrl = src.startsWith('//') ? `https:${src}` : src;

        let fileName = `inline_image_${index + 1}`;
        try {
          const urlObj = new URL(normalizedUrl);
          const pathParts = urlObj.pathname.split('/');
          const lastPart = pathParts[pathParts.length - 1];
          if (lastPart && lastPart.includes('.')) {
            fileName = lastPart;
          }
        } catch (e) {
          // Keep default filename
        }

        const extension = fileName.split('.').pop()?.toLowerCase();
        const contentTypeMap = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'svg': 'image/svg+xml',
          'bmp': 'image/bmp'
        };
        const contentType = contentTypeMap[extension] || 'image/png';

        inlineImages.push({
          id: `inline_${commentId}_${index}`,
          file_name: fileName,
          content_type: contentType,
          content_url: normalizedUrl,
          comment_id: commentId,
          comment_author: authorId,
          is_inline: true,
          size: null
        });

        index++;
      }

      return inlineImages;
    }

    async downloadAttachment(url) {
      const requestConfig = {
        method: 'GET',
        url,
        headers: {
          'Authorization': this.getAuthHeader()
        },
        responseType: 'arraybuffer',
        timeout: 60000
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
        error.message = `Failed to download attachment: ${error.message}`;
        throw error;
      }
    }
  };
}
