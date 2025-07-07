import Anthropic from '@anthropic-ai/sdk';
import { logger } from './utils/logger.js';

class AnthropicClient {
  private client: Anthropic | null = null;
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
  }

  private getClient(): Anthropic {
    if (!this.client) {
      if (!this.apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
      }
      this.client = new Anthropic({
        apiKey: this.apiKey
      });
    }
    return this.client;
  }

  async testConnection(): Promise<void> {
    try {
      const client = this.getClient();
      
      // Make a minimal API call to test the connection
      await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      });
      
      logger.info('✓ Successfully connected to Anthropic API');
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error('Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY environment variable.');
      } else if (error.status === 403) {
        throw new Error('Anthropic API key lacks required permissions.');
      } else {
        throw new Error(`Failed to connect to Anthropic API: ${error.message}`);
      }
    }
  }

  async createMessage(params: Anthropic.MessageCreateParams) {
    const client = this.getClient();
    return await client.messages.create(params);
  }
}

// Export a singleton instance
export const anthropicClient = new AnthropicClient();