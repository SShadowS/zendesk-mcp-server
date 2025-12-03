#!/usr/bin/env node

/**
 * OAuth Flow Test Script
 *
 * This script tests the OAuth 2.1 authorization flow for the Zendesk MCP Server.
 *
 * Test Steps:
 * 1. Start authorization flow (GET /oauth/authorize)
 * 2. Follow redirect to Zendesk (manual step - user must authorize)
 * 3. Handle callback (GET /zendesk/oauth/callback)
 * 4. Test MCP endpoint with Bearer token
 *
 * Usage:
 *   node test-oauth-flow.js
 */

import http from 'http';

const BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:3030';

console.log('🧪 Testing Zendesk MCP Server OAuth Flow\n');
console.log('Base URL:', BASE_URL);
console.log('');

// Test 1: Health Check
async function testHealthCheck() {
  console.log('1️⃣  Testing health endpoint...');

  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const health = JSON.parse(data);
          console.log('   ✅ Health check passed');
          console.log('   📊 Status:', health.status);
          console.log('   🚀 Server:', health.server);
          console.log('   🔌 Transport:', health.transport);
          console.log('');
          resolve();
        } else {
          console.log('   ❌ Health check failed:', res.statusCode);
          reject(new Error(`Health check failed: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

// Test 2: OAuth Authorization Server Metadata
async function testOAuthServerMetadata() {
  console.log('2️⃣  Testing OAuth authorization server metadata...');

  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}/.well-known/oauth-authorization-server`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const metadata = JSON.parse(data);
          console.log('   ✅ OAuth server metadata available');
          console.log('   🔐 Issuer:', metadata.issuer);
          console.log('   📍 Authorization Endpoint:', metadata.authorization_endpoint);
          console.log('   🎯 Token Endpoint:', metadata.token_endpoint);
          console.log('   🔒 PKCE Methods:', metadata.code_challenge_methods_supported);
          console.log('');
          resolve();
        } else {
          console.log('   ❌ Metadata request failed:', res.statusCode);
          reject(new Error(`Metadata request failed: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

// Test 3: Protected Resource Metadata
async function testProtectedResourceMetadata() {
  console.log('3️⃣  Testing RFC9728 protected resource metadata...');

  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}/.well-known/oauth-protected-resource`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const metadata = JSON.parse(data);
          console.log('   ✅ Protected resource metadata available');
          console.log('   🔐 Resource:', metadata.resource);
          console.log('   🏢 Authorization Servers:', metadata.authorization_servers);
          console.log('   📝 Scopes:', metadata.scopes_supported);
          console.log('');
          resolve();
        } else {
          console.log('   ❌ Metadata request failed:', res.statusCode);
          reject(new Error(`Metadata request failed: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

// Test 4: MCP Endpoint Authentication
async function testMCPAuthentication() {
  console.log('4️⃣  Testing MCP endpoint authentication...');

  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}/mcp`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 401) {
          console.log('   ✅ Authentication required (401 Unauthorized)');
          console.log('   🔒 WWW-Authenticate:', res.headers['www-authenticate']);

          try {
            const error = JSON.parse(data);
            console.log('   💡 Hint:', error.hint);
          } catch (e) {
            // Ignore parse errors
          }
          console.log('');
          resolve();
        } else {
          console.log('   ❌ Expected 401 but got:', res.statusCode);
          reject(new Error(`Expected 401 but got: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

// Test 5: OAuth Authorization Flow (Initiation)
async function testOAuthAuthorize() {
  console.log('5️⃣  Testing OAuth authorization flow initiation...');

  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}/oauth/authorize`, {
      // Don't follow redirects automatically
    }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location;
        console.log('   ✅ Authorization redirect working');
        console.log('   🔗 Redirect URL:', redirectUrl);

        // Parse redirect URL to check parameters
        try {
          const url = new URL(redirectUrl);
          console.log('   📋 PKCE Challenge Method:', url.searchParams.get('code_challenge_method'));
          console.log('   🎲 State parameter present:', !!url.searchParams.get('state'));
          console.log('   🔑 Client ID:', url.searchParams.get('client_id'));
          console.log('   📍 Redirect URI:', url.searchParams.get('redirect_uri'));
          console.log('   🎯 Scopes:', url.searchParams.get('scope'));
        } catch (e) {
          console.log('   ⚠️  Could not parse redirect URL');
        }
        console.log('');
        console.log('   ℹ️  Next step: Visit the redirect URL in a browser to complete authorization');
        console.log('');
        resolve();
      } else {
        console.log('   ❌ Expected redirect but got:', res.statusCode);
        reject(new Error(`Expected redirect but got: ${res.statusCode}`));
      }

      // Drain response
      res.on('data', () => {});
    }).on('error', reject);
  });
}

// Run all tests
async function runTests() {
  try {
    await testHealthCheck();
    await testOAuthServerMetadata();
    await testProtectedResourceMetadata();
    await testMCPAuthentication();
    await testOAuthAuthorize();

    console.log('✅ All automated tests passed!\n');
    console.log('📝 Manual testing steps:\n');
    console.log('1. Visit http://localhost:3030/oauth/authorize in your browser');
    console.log('2. Authorize the application in Zendesk');
    console.log('3. You will be redirected to the callback URL with an access token');
    console.log('4. Copy the access_token from the JSON response');
    console.log('5. Test the MCP endpoint with:');
    console.log('   curl -H "Authorization: Bearer <your_token>" http://localhost:3030/mcp');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
