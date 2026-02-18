/**
 * Integration tests for image analysis using real Anthropic API.
 *
 * These tests verify that the Anthropic SDK call format used in
 * tickets.js and document-analysis.js actually works end-to-end.
 *
 * Requires ANTHROPIC_API_KEY in .env.
 * Skipped automatically if the key is missing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

// Minimal 1x1 red PNG (68 bytes)
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

// 4x4 blue PNG (different from the 1x1 above, tests a distinct image)
const SMALL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGNgYPiPhIjiAACOsw/xs6MvMwAAAABJRU5ErkJggg==';

describe.skipIf(!API_KEY)('Image analysis integration (real Anthropic API)', () => {
  let anthropic;

  beforeAll(() => {
    anthropic = new Anthropic({ apiKey: API_KEY, timeout: 60000 });
  });

  it('analyzes a PNG image (same format as analyzeImageWithClaude)', async () => {
    // This mirrors the exact call in src/tools/tickets.js:analyzeImageWithClaude
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
              media_type: 'image/png',
              data: TINY_PNG_BASE64
            }
          },
          {
            type: 'text',
            text: 'Describe this image in one sentence.'
          }
        ]
      }]
    });

    expect(message).toBeDefined();
    expect(message.content).toBeInstanceOf(Array);
    expect(message.content.length).toBeGreaterThan(0);
    expect(message.content[0].type).toBe('text');
    expect(message.content[0].text).toBeTruthy();
    expect(typeof message.content[0].text).toBe('string');
  }, 30000);

  it('analyzes a second image with custom prompt', async () => {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: SMALL_PNG_BASE64
            }
          },
          {
            type: 'text',
            text: 'What color is this image? Reply in one word.'
          }
        ]
      }]
    });

    expect(message.content[0].text).toBeTruthy();
  }, 30000);

  it('analyzes a PDF document (same format as document-analysis.js)', async () => {
    // Minimal valid PDF
    const pdfContent = `%PDF-1.0
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 100 700 Td (Hello World) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000360 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
441
%%EOF`;

    const pdfBase64 = Buffer.from(pdfContent).toString('base64');

    // This mirrors the exact call in src/tools/document-analysis.js:analyzeDocument
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
              data: pdfBase64
            }
          },
          {
            type: 'text',
            text: 'What text does this PDF contain? Reply briefly.'
          }
        ]
      }]
    });

    expect(message.content[0].type).toBe('text');
    expect(message.content[0].text.toLowerCase()).toContain('hello');
  }, 30000);

  it('handles text document analysis (same format as document-analysis.js for text/data)', async () => {
    // This mirrors how text/data documents are sent in analyzeDocument
    const textContent = 'Customer reported login failure at 2024-03-15 14:30 UTC.';
    const analysisPrompt = 'Summarize the key information in one sentence.';

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: Math.min(4096, 4096),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${analysisPrompt}\n\nDocument content:\n\n${textContent}`
          }
        ]
      }]
    });

    expect(message.content[0].type).toBe('text');
    expect(message.content[0].text).toBeTruthy();
  }, 30000);

  it('respects max_tokens capping at 4096', async () => {
    const maxTokens = 10; // Very low to get a short response

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: Math.min(maxTokens, 4096),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: TINY_PNG_BASE64
            }
          },
          {
            type: 'text',
            text: 'Describe this image.'
          }
        ]
      }]
    });

    expect(message.content[0].text).toBeTruthy();
    // With max_tokens=10, response should be short
    expect(message.usage.output_tokens).toBeLessThanOrEqual(10);
  }, 30000);

  it('returns proper error for invalid model', async () => {
    await expect(
      anthropic.messages.create({
        model: 'claude-nonexistent-model',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: 'test' }]
        }]
      })
    ).rejects.toThrow();
  }, 15000);
});
