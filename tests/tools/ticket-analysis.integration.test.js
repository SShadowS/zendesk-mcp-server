/**
 * Integration tests for image & document analysis against a real Zendesk ticket.
 *
 * Uses ticket #256829 on continia.zendesk.com as a READ-ONLY test subject.
 * NEVER writes to the ticket — all operations are GET requests only.
 *
 * Requires in .env:
 *   ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN, ANTHROPIC_API_KEY
 *
 * Skipped automatically if any required env var is missing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { DocumentHandler } from '../../src/utils/document-handler.js';
import { validateBatch } from '../../src/config/document-types.js';

dotenv.config();

const SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN;
const EMAIL = process.env.ZENDESK_EMAIL;
const API_TOKEN = process.env.ZENDESK_API_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const TICKET_ID = 256829;
const MODEL = 'claude-sonnet-4-6';

const hasAllCreds = SUBDOMAIN && EMAIL && API_TOKEN && ANTHROPIC_KEY;

/**
 * Make authenticated GET request to Zendesk API (read-only).
 */
async function zendeskGet(endpoint) {
  const url = `https://${SUBDOMAIN}.zendesk.com/api/v2${endpoint}`;
  const auth = Buffer.from(`${EMAIL}/token:${API_TOKEN}`).toString('base64');
  const response = await axios({
    method: 'GET',
    url,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 30000
  });
  return response.data;
}

/**
 * Download a file from a URL (Zendesk CDN or authenticated).
 */
async function downloadFile(url) {
  const auth = Buffer.from(`${EMAIL}/token:${API_TOKEN}`).toString('base64');
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: {
      'Authorization': `Basic ${auth}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  return {
    data: response.data,
    contentType: response.headers['content-type'] || 'application/octet-stream',
    size: response.data.length
  };
}

/**
 * Extract inline images from HTML body (mirrors extractInlineImages logic).
 */
function extractInlineImages(htmlBody, commentId, authorId) {
  const inlineImages = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  let index = 0;

  while ((match = imgRegex.exec(htmlBody)) !== null) {
    const src = match[1];
    if (!src || src.startsWith('data:') || (!src.startsWith('http') && !src.startsWith('//'))) {
      continue;
    }
    const normalizedUrl = src.startsWith('//') ? `https:${src}` : src;
    let fileName = `inline_image_${index + 1}`;
    try {
      const urlObj = new URL(normalizedUrl);
      const pathParts = urlObj.pathname.split('/');
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && lastPart.includes('.')) {
        fileName = lastPart;
      }
    } catch (e) { /* keep default */ }

    const extension = fileName.split('.').pop()?.toLowerCase();
    const contentTypeMap = {
      'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
      'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml', 'bmp': 'image/bmp'
    };

    inlineImages.push({
      id: `inline_${commentId}_${index}`,
      file_name: fileName,
      content_type: contentTypeMap[extension] || 'image/png',
      content_url: normalizedUrl,
      comment_id: commentId,
      comment_author: authorId,
      is_inline: true,
      size: null
    });
    index++;
  }
  return inlineImages;
}

// Old prompts for comparison testing
const OLD_IMAGE_PROMPT = 'Describe this image in detail, including any text, UI elements, error messages, or relevant information visible.';
const NEW_IMAGE_SYSTEM_PROMPT = `You are a technical support analyst examining attachments from a customer support ticket. Your job is to extract information that helps resolve the customer's issue.

Focus on:
- Error messages, codes, and stack traces
- Software versions, build numbers, environment details
- Configuration settings and their values
- UI state that indicates a problem (greyed-out buttons, missing elements, incorrect values)
- Steps the customer appears to have taken
- Any discrepancy between expected and actual behavior

Be concise. Lead with the most actionable finding. Skip describing obvious UI chrome unless it's relevant to the issue.`;

const NEW_IMAGE_PROMPT = `Analyze this image from a support ticket. Extract:
1. Any error messages, warning dialogs, or status indicators
2. Software/product version numbers or environment details visible
3. Configuration or settings shown
4. What action the user appears to be performing
5. Any anomaly or issue visible

If this is a screenshot of a UI, identify the application and the specific screen/page shown.`;

/**
 * Build ticket context (mirrors src/utils/ticket-context.js)
 */
function buildTicketContext(ticketData) {
  const ticket = ticketData?.ticket;
  if (!ticket) return '';

  let context = `Support ticket: "${ticket.subject || 'No subject'}"`;
  if (ticket.description) {
    context += `\nCustomer reported: ${ticket.description.substring(0, 500)}`;
  }
  if (ticket.tags?.length) {
    context += `\nTags: ${ticket.tags.join(', ')}`;
  }

  const comments = ticketData?.comments || ticket?.comments;
  if (comments?.length > 0) {
    const recent = comments.slice(-5);
    context += '\n\nRecent conversation:';
    for (const c of recent) {
      const body = (c.plain_body || c.body || '').substring(0, 300);
      context += `\n- ${body}`;
    }
  }

  return context;
}

describe.skipIf(!hasAllCreds)(`Ticket #${TICKET_ID} analysis integration (real Zendesk + Anthropic)`, () => {
  let anthropic;
  let comments;
  let allAttachments;

  beforeAll(async () => {
    anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY, timeout: 60000 });

    // Fetch ticket comments (READ-ONLY)
    const commentsData = await zendeskGet(`/tickets/${TICKET_ID}/comments.json`);
    comments = commentsData.comments;

    // Collect all attachments (regular + inline)
    allAttachments = [];
    for (const comment of comments) {
      if (comment.attachments?.length > 0) {
        for (const att of comment.attachments) {
          allAttachments.push({
            ...att,
            comment_id: comment.id,
            comment_author: comment.author_id,
            is_inline: false
          });
        }
      }
      if (comment.html_body) {
        const inline = extractInlineImages(comment.html_body, comment.id, comment.author_id);
        allAttachments.push(...inline);
      }
    }
  }, 30000);

  it('fetches ticket comments successfully', () => {
    expect(comments).toBeDefined();
    expect(comments.length).toBeGreaterThan(0);
  });

  it('finds attachments in the ticket', () => {
    expect(allAttachments.length).toBeGreaterThan(0);
    console.log(`  Found ${allAttachments.length} total attachments (${allAttachments.filter(a => !a.is_inline).length} regular, ${allAttachments.filter(a => a.is_inline).length} inline)`);
  });

  it('validates attachments with validateBatch', () => {
    const validation = validateBatch(allAttachments);
    console.log(`  Valid: ${validation.valid.length}, Blocked: ${validation.blocked.length}, Unsupported: ${validation.unsupported.length}, Too large: ${validation.tooLarge.length}`);
    // At least some should be processable
    expect(validation.valid.length + validation.blocked.length + validation.unsupported.length + validation.tooLarge.length)
      .toBe(allAttachments.length);
  });

  it('detects types for all attachments', () => {
    for (const att of allAttachments) {
      const typeInfo = DocumentHandler.detectType(att);
      expect(typeInfo).toBeDefined();
      expect(typeInfo).toHaveProperty('supported');
      expect(typeInfo).toHaveProperty('category');
      if (typeInfo.supported) {
        expect(typeInfo.processor).toBeTruthy();
      }
    }
  });

  it('downloads at least one attachment', async () => {
    const firstAtt = allAttachments.find(a => a.content_url);
    expect(firstAtt).toBeDefined();

    const downloaded = await downloadFile(firstAtt.content_url);
    expect(downloaded.data).toBeDefined();
    expect(downloaded.data.length).toBeGreaterThan(0);
    console.log(`  Downloaded ${firstAtt.file_name || firstAtt.id}: ${downloaded.size} bytes, type: ${downloaded.contentType}`);
  }, 30000);

  it('routes a downloaded attachment through DocumentHandler', async () => {
    // Pick a non-inline attachment with known content_type
    const att = allAttachments.find(a => !a.is_inline && a.content_type);
    if (!att) {
      console.log('  Skipped: no regular attachments with content_type');
      return;
    }

    const downloaded = await downloadFile(att.content_url);
    const routeResult = await DocumentHandler.route(att, downloaded.data);

    expect(routeResult).toBeDefined();
    console.log(`  Route result for ${att.file_name}: success=${routeResult.success}, category=${routeResult.category || 'N/A'}`);

    if (routeResult.success) {
      expect(routeResult.processor).toBeTruthy();
      expect(routeResult.category).toBeTruthy();
    }
  }, 30000);

  it('analyzes the first image attachment with Claude', async () => {
    const imageAtt = allAttachments.find(a =>
      a.content_type?.startsWith('image/') &&
      ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(a.content_type)
    );

    if (!imageAtt) {
      console.log('  Skipped: no supported image attachments found');
      return;
    }

    // Download the image
    const downloaded = await downloadFile(imageAtt.content_url);
    const base64Data = Buffer.from(downloaded.data).toString('base64');
    const mediaType = downloaded.contentType.split(';')[0] || imageAtt.content_type;

    console.log(`  Analyzing image: ${imageAtt.file_name || imageAtt.id} (${mediaType}, ${downloaded.size} bytes)`);

    // Call Claude exactly as tickets.js does
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: Math.min(4096, 4096),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data
            }
          },
          {
            type: 'text',
            text: 'Describe this image in detail, including any text, UI elements, error messages, or relevant information visible.'
          }
        ]
      }]
    });

    expect(message.content[0].type).toBe('text');
    expect(message.content[0].text).toBeTruthy();
    console.log(`  Analysis (first 200 chars): ${message.content[0].text.substring(0, 200)}...`);
  }, 60000);

  it('analyzes a PDF attachment with Claude if present', async () => {
    const pdfAtt = allAttachments.find(a =>
      a.content_type === 'application/pdf' ||
      a.file_name?.toLowerCase().endsWith('.pdf')
    );

    if (!pdfAtt) {
      console.log('  Skipped: no PDF attachments found');
      return;
    }

    const downloaded = await downloadFile(pdfAtt.content_url);
    const base64Data = Buffer.from(downloaded.data).toString('base64');

    console.log(`  Analyzing PDF: ${pdfAtt.file_name} (${downloaded.size} bytes)`);

    // Call Claude exactly as document-analysis.js does for PDFs
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: Math.min(4096, 4096),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Data
            }
          },
          {
            type: 'text',
            text: 'Provide a comprehensive analysis of this document. Extract key information, summarize main points, identify any issues or action items.'
          }
        ]
      }]
    });

    expect(message.content[0].type).toBe('text');
    expect(message.content[0].text).toBeTruthy();
    console.log(`  Analysis (first 200 chars): ${message.content[0].text.substring(0, 200)}...`);
  }, 60000);

  it('processes all image attachments end-to-end (full pipeline)', async () => {
    const imageAtts = allAttachments.filter(a =>
      a.content_type?.startsWith('image/') &&
      ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(a.content_type)
    );

    if (imageAtts.length === 0) {
      console.log('  Skipped: no image attachments');
      return;
    }

    console.log(`  Processing ${imageAtts.length} images...`);
    const results = [];

    for (const att of imageAtts) {
      try {
        const downloaded = await downloadFile(att.content_url);
        const base64Data = Buffer.from(downloaded.data).toString('base64');
        const mediaType = (downloaded.contentType?.split(';')[0]) || att.content_type;

        const message = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
              { type: 'text', text: 'Briefly describe what you see in this image.' }
            ]
          }]
        });

        results.push({
          file: att.file_name || att.id,
          is_inline: att.is_inline,
          size: downloaded.size,
          success: true,
          analysis: message.content[0].text.substring(0, 100)
        });
      } catch (error) {
        results.push({
          file: att.file_name || att.id,
          is_inline: att.is_inline,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`  Results:`);
    for (const r of results) {
      const status = r.success ? 'OK' : `FAIL: ${r.error}`;
      console.log(`    ${r.is_inline ? 'inline' : 'attached'} ${r.file}: ${status}`);
    }

    // At least some should succeed
    const successes = results.filter(r => r.success);
    expect(successes.length).toBeGreaterThan(0);
  }, 120000);

  it('compares old vs new prompt quality on first image', async () => {
    const imageAtt = allAttachments.find(a =>
      a.content_type?.startsWith('image/') &&
      ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(a.content_type)
    );

    if (!imageAtt) {
      console.log('  Skipped: no supported image attachments found');
      return;
    }

    // Download the image
    const downloaded = await downloadFile(imageAtt.content_url);
    const base64Data = Buffer.from(downloaded.data).toString('base64');
    const mediaType = downloaded.contentType.split(';')[0] || imageAtt.content_type;

    // Fetch ticket context
    const ticketData = await zendeskGet(`/tickets/${TICKET_ID}.json?include=comments`);
    const ticketContext = buildTicketContext(ticketData);

    console.log(`\n  === PROMPT COMPARISON: ${imageAtt.file_name || imageAtt.id} ===\n`);

    // OLD prompt (no system prompt, no context)
    const oldMessage = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: OLD_IMAGE_PROMPT }
        ]
      }]
    });

    // NEW prompt (system prompt + ticket context)
    const contextualPrompt = ticketContext
      ? `${ticketContext}\n\n${NEW_IMAGE_PROMPT}`
      : NEW_IMAGE_PROMPT;

    const newMessage = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: NEW_IMAGE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: contextualPrompt }
        ]
      }]
    });

    const oldResult = oldMessage.content[0].text;
    const newResult = newMessage.content[0].text;

    console.log(`  --- OLD PROMPT RESULT (first 500 chars) ---`);
    console.log(`  ${oldResult.substring(0, 500)}`);
    console.log(`\n  --- NEW PROMPT RESULT (first 500 chars) ---`);
    console.log(`  ${newResult.substring(0, 500)}`);
    console.log(`\n  --- END COMPARISON ---\n`);

    // Both should produce non-empty results
    expect(oldResult).toBeTruthy();
    expect(newResult).toBeTruthy();

    // New result should be more actionable — basic quality check:
    // it should reference the application context (Business Central or similar)
    // This is a soft check; the main value is the console output for manual review
    const newResultLower = newResult.toLowerCase();
    const mentionsApp = newResultLower.includes('business central') ||
                        newResultLower.includes('error') ||
                        newResultLower.includes('issue') ||
                        newResultLower.includes('version');
    expect(mentionsApp).toBe(true);
  }, 120000);
});
