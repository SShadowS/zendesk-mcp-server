/**
 * Business Rules mixin - adds macros, views, triggers, and automations methods
 * @param {typeof import('./base.js').ZendeskClientBase} Base
 */
export function BusinessRulesMixin(Base) {
  return class extends Base {
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
  };
}
