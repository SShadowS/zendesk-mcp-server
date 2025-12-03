/**
 * Users mixin - adds user-related methods to ZendeskClient
 * @param {typeof import('./base.js').ZendeskClientBase} Base
 */
export function UsersMixin(Base) {
  return class extends Base {
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
  };
}
