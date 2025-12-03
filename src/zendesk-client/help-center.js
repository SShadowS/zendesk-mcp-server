/**
 * Help Center mixin - adds article-related methods to ZendeskClient
 * @param {typeof import('./base.js').ZendeskClientBase} Base
 */
export function HelpCenterMixin(Base) {
  return class extends Base {
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
  };
}
