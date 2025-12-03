/**
 * Channels mixin - adds Talk and Chat methods to ZendeskClient
 * @param {typeof import('./base.js').ZendeskClientBase} Base
 */
export function ChannelsMixin(Base) {
  return class extends Base {
    // Talk
    async getTalkStats() {
      return this.request('GET', '/channels/voice/stats.json');
    }

    // Chat
    async listChats(params) {
      return this.request('GET', '/chats.json', null, params);
    }
  };
}
