/**
 * Organizations mixin - adds organization-related methods to ZendeskClient
 * @param {typeof import('./base.js').ZendeskClientBase} Base
 */
export function OrganizationsMixin(Base) {
  return class extends Base {
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
  };
}
