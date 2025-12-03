/**
 * Search mixin - adds search functionality to ZendeskClient
 * @param {typeof import('./base.js').ZendeskClientBase} Base
 */
export function SearchMixin(Base) {
  return class extends Base {
    async search(query, params = {}) {
      return this.request('GET', '/search.json', null, { query, ...params });
    }
  };
}
