import { describe, it, expect, beforeEach } from 'vitest';
import { ZendeskClientBase } from '../../src/zendesk-client/base.js';

describe('ZendeskClientBase auth modes', () => {
  let client;

  beforeEach(() => {
    client = new ZendeskClientBase();
  });

  describe('initial state', () => {
    it('has no auth mode set', () => {
      expect(client._authMode).toBeNull();
    });

    it('throws when getAuthHeader is called with no auth', () => {
      expect(() => client.getAuthHeader()).toThrow('No valid OAuth access token');
    });
  });

  describe('setApiTokenAuth', () => {
    it('sets auth mode to api_token', () => {
      client.setApiTokenAuth('user@example.com', 'abc123');
      expect(client._authMode).toBe('api_token');
    });

    it('stores email and apiToken', () => {
      client.setApiTokenAuth('user@example.com', 'abc123');
      expect(client._email).toBe('user@example.com');
      expect(client._apiToken).toBe('abc123');
    });

    it('returns Basic auth header with correct encoding', () => {
      client.setApiTokenAuth('user@example.com', 'abc123');
      const header = client.getAuthHeader();

      const expected = Buffer.from('user@example.com/token:abc123').toString('base64');
      expect(header).toBe(`Basic ${expected}`);
    });
  });

  describe('setAccessToken (OAuth)', () => {
    it('sets auth mode to oauth', () => {
      client.setAccessToken('oauth-token-123');
      expect(client._authMode).toBe('oauth');
    });

    it('returns Bearer auth header', () => {
      client.setAccessToken('oauth-token-123');
      expect(client.getAuthHeader()).toBe('Bearer oauth-token-123');
    });

    it('throws when token is expired', () => {
      client.setAccessToken('oauth-token-123', Date.now() - 1000);
      expect(() => client.getAuthHeader()).toThrow('No valid OAuth access token');
    });
  });

  describe('auth mode switching', () => {
    it('switches from api_token to oauth', () => {
      client.setApiTokenAuth('user@example.com', 'abc123');
      expect(client._authMode).toBe('api_token');

      client.setAccessToken('oauth-token');
      expect(client._authMode).toBe('oauth');
      expect(client.getAuthHeader()).toBe('Bearer oauth-token');
    });

    it('switches from oauth to api_token', () => {
      client.setAccessToken('oauth-token');
      expect(client._authMode).toBe('oauth');

      client.setApiTokenAuth('user@example.com', 'abc123');
      expect(client._authMode).toBe('api_token');

      const expected = Buffer.from('user@example.com/token:abc123').toString('base64');
      expect(client.getAuthHeader()).toBe(`Basic ${expected}`);
    });
  });

  describe('api_token error cases', () => {
    it('throws when email is missing', () => {
      client._authMode = 'api_token';
      client._email = null;
      client._apiToken = 'abc123';
      expect(() => client.getAuthHeader()).toThrow('API token credentials not configured');
    });

    it('throws when apiToken is missing', () => {
      client._authMode = 'api_token';
      client._email = 'user@example.com';
      client._apiToken = null;
      expect(() => client.getAuthHeader()).toThrow('API token credentials not configured');
    });
  });
});
