/**
 * Groups mixin - adds group-related methods to ZendeskClient
 * @param {typeof import('./base.js').ZendeskClientBase} Base
 */
export function GroupsMixin(Base) {
  return class extends Base {
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
  };
}
