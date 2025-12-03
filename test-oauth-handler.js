import dotenv from 'dotenv';
import { OAuthHandler, generateState } from './src/auth/oauth-handler.js';

// Load environment variables
dotenv.config();

console.log('Testing OAuth Handler...\n');

// Check required environment variables
const requiredVars = ['ZENDESK_OAUTH_CLIENT_ID', 'ZENDESK_OAUTH_CLIENT_SECRET', 'ZENDESK_SUBDOMAIN'];
const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing.join(', '));
  console.log('\nPlease add these to your .env file:');
  missing.forEach(v => console.log(`  ${v}=your_value_here`));
  process.exit(1);
}

try {
  // Create handler
  const handler = new OAuthHandler({
    clientId: process.env.ZENDESK_OAUTH_CLIENT_ID,
    clientSecret: process.env.ZENDESK_OAUTH_CLIENT_SECRET,
    subdomain: process.env.ZENDESK_SUBDOMAIN,
    redirectUri: process.env.ZENDESK_OAUTH_REDIRECT_URI || 'http://localhost:3030/zendesk/oauth/callback'
  });

  console.log('✅ OAuthHandler created successfully');
  console.log(`   Base URL: ${handler.baseUrl}`);
  console.log(`   Redirect URI: ${handler.redirectUri}\n`);

  // Test configuration validation
  if (handler.validateConfig()) {
    console.log('✅ Configuration validation passed\n');
  } else {
    console.error('❌ Configuration validation failed\n');
    process.exit(1);
  }

  // Test PKCE generation
  console.log('Testing PKCE generation...');
  const { verifier, challenge } = handler.generatePKCE();

  console.log(`✅ PKCE Verifier: ${verifier}`);
  console.log(`   Length: ${verifier.length} characters (should be 43)`);
  console.log(`   Valid base64url: ${/^[A-Za-z0-9_-]+$/.test(verifier) ? 'Yes' : 'No'}`);

  console.log(`✅ PKCE Challenge: ${challenge}`);
  console.log(`   Length: ${challenge.length} characters (should be 43)`);
  console.log(`   Valid base64url: ${/^[A-Za-z0-9_-]+$/.test(challenge) ? 'Yes' : 'No'}\n`);

  if (verifier.length !== 43 || challenge.length !== 43) {
    console.error('❌ PKCE lengths are incorrect!');
    process.exit(1);
  }

  // Test state generation
  console.log('Testing state generation...');
  const state1 = generateState();
  const state2 = generateState();

  console.log(`✅ State 1: ${state1}`);
  console.log(`✅ State 2: ${state2}`);
  console.log(`   Unique: ${state1 !== state2 ? 'Yes' : 'No'}\n`);

  if (state1 === state2) {
    console.error('❌ State tokens are not unique!');
    process.exit(1);
  }

  // Test authorization URL
  console.log('Testing authorization URL generation...');
  const state = generateState();
  const authUrl = handler.getAuthorizationUrl(state, challenge);

  console.log(`✅ Authorization URL generated:`);
  console.log(`   ${authUrl}\n`);

  // Validate URL parameters
  const url = new URL(authUrl);
  const params = {
    response_type: url.searchParams.get('response_type'),
    client_id: url.searchParams.get('client_id'),
    redirect_uri: url.searchParams.get('redirect_uri'),
    scope: url.searchParams.get('scope'),
    state: url.searchParams.get('state'),
    code_challenge: url.searchParams.get('code_challenge'),
    code_challenge_method: url.searchParams.get('code_challenge_method')
  };

  console.log('URL Parameters:');
  console.log(`   response_type: ${params.response_type} (should be "code")`);
  console.log(`   client_id: ${params.client_id}`);
  console.log(`   redirect_uri: ${params.redirect_uri}`);
  console.log(`   scope: ${params.scope} (should be "read write")`);
  console.log(`   state: ${params.state}`);
  console.log(`   code_challenge: ${params.code_challenge}`);
  console.log(`   code_challenge_method: ${params.code_challenge_method} (should be "S256")\n`);

  // Validate required parameters
  const validations = [
    { name: 'response_type', expected: 'code', actual: params.response_type },
    { name: 'code_challenge_method', expected: 'S256', actual: params.code_challenge_method },
    { name: 'scope', expected: 'read write', actual: params.scope }
  ];

  let allValid = true;
  validations.forEach(({ name, expected, actual }) => {
    if (actual !== expected) {
      console.error(`❌ ${name}: expected "${expected}", got "${actual}"`);
      allValid = false;
    }
  });

  if (!allValid) {
    process.exit(1);
  }

  console.log('✅ All OAuth handler tests passed!\n');
  console.log('📋 Next steps:');
  console.log('   1. The OAuth handler is ready to use');
  console.log('   2. Proceed to Phase 2: HTTP Server & Transport');
  console.log('   3. Visit the authorization URL in your browser to test the full flow\n');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
