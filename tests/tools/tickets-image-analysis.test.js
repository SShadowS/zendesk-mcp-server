import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dotenv before anything else
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

// Mock request-context
const mockGetZendeskClient = vi.fn();
vi.mock('../../src/request-context.js', () => ({
  getZendeskClient: (...args) => mockGetZendeskClient(...args)
}));

// Mock errors
vi.mock('../../src/utils/errors.js', () => ({
  createErrorResponse: vi.fn(error => ({
    content: [{ type: 'text', text: `Error: ${error.message}` }],
    isError: true
  }))
}));

// Mock axios
const mockAxios = vi.fn();
vi.mock('axios', () => ({ default: mockAxios }));

// Mock Anthropic
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      constructor() {
        this.messages = { create: mockCreate };
      }
    }
  };
});

// NOW import the module under test
const { ticketsTools } = await import('../../src/tools/tickets.js');
const analyzeImagesTool = ticketsTools.find(t => t.name === 'analyze_ticket_images');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockZendeskClient(attachments = [], ticketData = null) {
  const defaultTicketData = {
    ticket: {
      id: 123,
      subject: 'Test ticket subject',
      description: 'Customer reports an issue with the application',
      tags: ['support', 'bug']
    },
    comments: [
      { plain_body: 'I am having trouble with the login page' }
    ]
  };
  return {
    getTicketAttachments: vi.fn().mockResolvedValue({ attachments }),
    getTicket: vi.fn().mockResolvedValue(ticketData || defaultTicketData),
    downloadAttachment: vi.fn().mockResolvedValue({
      data: Buffer.from('fake-image'),
      contentType: 'image/png',
      size: 10
    })
  };
}

function makeAttachment(overrides = {}) {
  return {
    id: 1001,
    file_name: 'screenshot.png',
    content_type: 'image/png',
    content_url: 'https://zendesk.com/attachments/1001',
    size: 2048,
    comment_id: 5001,
    is_inline: false,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('analyze_ticket_images tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Tool exists and has expected shape
  // -----------------------------------------------------------------------
  describe('tool definition', () => {
    it('exists in ticketsTools array', () => {
      expect(analyzeImagesTool).toBeDefined();
    });

    it('has the correct name', () => {
      expect(analyzeImagesTool.name).toBe('analyze_ticket_images');
    });

    it('has a description', () => {
      expect(typeof analyzeImagesTool.description).toBe('string');
      expect(analyzeImagesTool.description.length).toBeGreaterThan(0);
    });

    it('has a handler function', () => {
      expect(typeof analyzeImagesTool.handler).toBe('function');
    });

    it('has a zod schema', () => {
      expect(analyzeImagesTool.schema).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // No images found
  // -----------------------------------------------------------------------
  describe('no images found', () => {
    it('returns "No image attachments or inline images" when attachments have no image content types', async () => {
      const client = createMockZendeskClient([
        makeAttachment({ content_type: 'application/pdf', file_name: 'doc.pdf' }),
        makeAttachment({ content_type: 'text/plain', file_name: 'notes.txt' })
      ]);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeImagesTool.handler({ id: 123 });

      expect(result.content[0].text).toBe(
        'No image attachments or inline images found in this ticket.'
      );
    });

    it('returns "No image attachments or inline images" when attachments array is empty', async () => {
      const client = createMockZendeskClient([]);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeImagesTool.handler({ id: 123 });

      expect(result.content[0].text).toBe(
        'No image attachments or inline images found in this ticket.'
      );
    });

    it('returns "No image attachments" (without inline mention) when include_inline is false', async () => {
      const client = createMockZendeskClient([]);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeImagesTool.handler({ id: 123, include_inline: false });

      expect(result.content[0].text).toBe(
        'No image attachments found in this ticket.'
      );
    });

    it('passes includeInlineImages option to getTicketAttachments', async () => {
      const client = createMockZendeskClient([]);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeImagesTool.handler({ id: 42, include_inline: false });

      expect(client.getTicketAttachments).toHaveBeenCalledWith(42, {
        includeInlineImages: false
      });
    });

    it('defaults include_inline to true', async () => {
      const client = createMockZendeskClient([]);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeImagesTool.handler({ id: 42 });

      expect(client.getTicketAttachments).toHaveBeenCalledWith(42, {
        includeInlineImages: true
      });
    });
  });

  // -----------------------------------------------------------------------
  // Filters only image content types
  // -----------------------------------------------------------------------
  describe('image content type filtering', () => {
    it('only processes attachments whose content_type starts with image/', async () => {
      const imageAtt = makeAttachment({
        id: 1,
        file_name: 'photo.png',
        content_type: 'image/png'
      });
      const pdfAtt = makeAttachment({
        id: 2,
        file_name: 'doc.pdf',
        content_type: 'application/pdf'
      });
      const textAtt = makeAttachment({
        id: 3,
        file_name: 'notes.txt',
        content_type: 'text/plain'
      });

      const client = createMockZendeskClient([imageAtt, pdfAtt, textAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Analysis of photo.png' }]
      });

      const result = await analyzeImagesTool.handler({ id: 100 });

      // Only one image should be processed
      expect(client.downloadAttachment).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(result.content[0].text).toContain('Found 1 image(s) in ticket 100');
      expect(result.content[0].text).toContain('photo.png');
      expect(result.content[0].text).not.toContain('doc.pdf');
      expect(result.content[0].text).not.toContain('notes.txt');
    });

    it('filters out attachments with null content_type', async () => {
      const nullTypeAtt = makeAttachment({
        id: 4,
        file_name: 'unknown.bin',
        content_type: null
      });
      const client = createMockZendeskClient([nullTypeAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeImagesTool.handler({ id: 100 });

      expect(result.content[0].text).toBe(
        'No image attachments or inline images found in this ticket.'
      );
    });

    it('accepts various image/* content types', async () => {
      const jpegAtt = makeAttachment({ id: 10, file_name: 'photo.jpg', content_type: 'image/jpeg' });
      const gifAtt = makeAttachment({ id: 11, file_name: 'anim.gif', content_type: 'image/gif' });
      const webpAtt = makeAttachment({ id: 12, file_name: 'modern.webp', content_type: 'image/webp' });

      const client = createMockZendeskClient([jpegAtt, gifAtt, webpAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Image analysis result' }]
      });

      const result = await analyzeImagesTool.handler({ id: 200 });

      expect(mockCreate).toHaveBeenCalledTimes(3);
      expect(result.content[0].text).toContain('Found 3 image(s) in ticket 200');
    });
  });

  // -----------------------------------------------------------------------
  // Single image success
  // -----------------------------------------------------------------------
  describe('single image success', () => {
    it('downloads the image, sends to Claude, and returns formatted result', async () => {
      const attachment = makeAttachment({
        id: 42,
        file_name: 'error-screenshot.png',
        content_type: 'image/png',
        size: 5000,
        comment_id: 9001,
        is_inline: false
      });

      const client = createMockZendeskClient([attachment]);
      const fakeImageData = Buffer.from('fake-png-data');
      client.downloadAttachment.mockResolvedValue({
        data: fakeImageData,
        contentType: 'image/png',
        size: fakeImageData.length
      });
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'This image shows an error dialog with message "Connection refused".' }]
      });

      const result = await analyzeImagesTool.handler({ id: 777 });
      const text = result.content[0].text;

      expect(text).toContain('Found 1 image(s) in ticket 777');
      expect(text).toContain('error-screenshot.png');
      expect(text).toContain('image/png');
      expect(text).toContain('Connection refused');
      expect(text).toContain('Comment ID: 9001');
      expect(text).toContain('AI Analysis:');
    });

    it('passes base64-encoded image data to Claude', async () => {
      const attachment = makeAttachment({ content_type: 'image/jpeg' });
      const client = createMockZendeskClient([attachment]);
      const imageBuffer = Buffer.from('jpeg-content');
      client.downloadAttachment.mockResolvedValue({
        data: imageBuffer,
        contentType: 'image/jpeg',
        size: imageBuffer.length
      });
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Analysis' }]
      });

      await analyzeImagesTool.handler({ id: 1 });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-6');
      expect(callArgs.messages[0].content[0].type).toBe('image');
      expect(callArgs.messages[0].content[0].source.type).toBe('base64');
      expect(callArgs.messages[0].content[0].source.media_type).toBe('image/jpeg');
      expect(callArgs.messages[0].content[0].source.data).toBe(
        imageBuffer.toString('base64')
      );
    });

    it('uses the custom analysis_prompt when provided', async () => {
      const attachment = makeAttachment();
      const client = createMockZendeskClient([attachment]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Custom analysis' }]
      });

      const customPrompt = 'Identify all error codes in this screenshot.';
      await analyzeImagesTool.handler({ id: 1, analysis_prompt: customPrompt });

      const callArgs = mockCreate.mock.calls[0][0];
      // Custom prompt should be included (with ticket context prepended)
      expect(callArgs.messages[0].content[1].text).toContain(customPrompt);
    });

    it('uses the default analysis prompt when none is specified', async () => {
      const attachment = makeAttachment();
      const client = createMockZendeskClient([attachment]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Default analysis' }]
      });

      await analyzeImagesTool.handler({ id: 1 });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content[1].text).toContain(
        'Analyze this image from a support ticket'
      );
    });

    it('includes system prompt in Claude API call', async () => {
      const attachment = makeAttachment();
      const client = createMockZendeskClient([attachment]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Analysis with system prompt' }]
      });

      await analyzeImagesTool.handler({ id: 1 });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toBeDefined();
      expect(callArgs.system).toContain('technical support analyst');
    });

    it('includes ticket context in the analysis prompt', async () => {
      const attachment = makeAttachment();
      const client = createMockZendeskClient([attachment]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Contextual analysis' }]
      });

      await analyzeImagesTool.handler({ id: 1 });

      const callArgs = mockCreate.mock.calls[0][0];
      const promptText = callArgs.messages[0].content[1].text;
      expect(promptText).toContain('Support ticket: "Test ticket subject"');
      expect(promptText).toContain('Customer reports an issue');
    });

    it('fetches ticket context only once for multiple images', async () => {
      const att1 = makeAttachment({ id: 1, file_name: 'first.png' });
      const att2 = makeAttachment({ id: 2, file_name: 'second.png' });
      const client = createMockZendeskClient([att1, att2]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Analysis' }]
      });

      await analyzeImagesTool.handler({ id: 1 });

      // getTicket should be called exactly once, not once per image
      expect(client.getTicket).toHaveBeenCalledTimes(1);
      expect(client.getTicket).toHaveBeenCalledWith(1, true);
    });

    it('proceeds without context if getTicket fails', async () => {
      const attachment = makeAttachment();
      const client = createMockZendeskClient([attachment]);
      client.getTicket.mockRejectedValue(new Error('Ticket not found'));
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Analysis without context' }]
      });

      const result = await analyzeImagesTool.handler({ id: 999 });

      // Should still succeed
      expect(result.content[0].text).toContain('Analysis without context');
      // Prompt should not contain ticket context prefix
      const callArgs = mockCreate.mock.calls[0][0];
      const promptText = callArgs.messages[0].content[1].text;
      expect(promptText).not.toContain('Support ticket:');
      expect(promptText).toContain('Analyze this image from a support ticket');
    });
  });

  // -----------------------------------------------------------------------
  // Multiple images
  // -----------------------------------------------------------------------
  describe('multiple images', () => {
    it('processes all image attachments and includes all analyses', async () => {
      const att1 = makeAttachment({
        id: 1,
        file_name: 'first.png',
        content_type: 'image/png',
        comment_id: 100,
        is_inline: false
      });
      const att2 = makeAttachment({
        id: 2,
        file_name: 'second.jpg',
        content_type: 'image/jpeg',
        comment_id: 200,
        is_inline: false
      });

      const client = createMockZendeskClient([att1, att2]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate
        .mockResolvedValueOnce({ content: [{ text: 'Analysis of first image' }] })
        .mockResolvedValueOnce({ content: [{ text: 'Analysis of second image' }] });

      const result = await analyzeImagesTool.handler({ id: 50 });
      const text = result.content[0].text;

      expect(text).toContain('Found 2 image(s) in ticket 50');
      expect(text).toContain('first.png');
      expect(text).toContain('Analysis of first image');
      expect(text).toContain('second.jpg');
      expect(text).toContain('Analysis of second image');
      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(client.downloadAttachment).toHaveBeenCalledTimes(2);
    });

    it('shows attached and inline counts when include_inline is true', async () => {
      const attachedImg = makeAttachment({
        id: 1,
        file_name: 'attached.png',
        content_type: 'image/png',
        is_inline: false
      });
      const inlineImg = makeAttachment({
        id: 2,
        file_name: 'inline.png',
        content_type: 'image/png',
        is_inline: true,
        content_url: 'https://example.com/inline.png'
      });

      const client = createMockZendeskClient([attachedImg, inlineImg]);
      mockGetZendeskClient.mockReturnValue(client);

      mockAxios.mockResolvedValue({
        data: Buffer.from('inline-data'),
        headers: { 'content-type': 'image/png' }
      });

      mockCreate.mockResolvedValue({
        content: [{ text: 'Image analysis' }]
      });

      const result = await analyzeImagesTool.handler({ id: 60, include_inline: true });
      const text = result.content[0].text;

      expect(text).toContain('(1 attached, 1 inline)');
    });
  });

  // -----------------------------------------------------------------------
  // Inline image download
  // -----------------------------------------------------------------------
  describe('inline image download', () => {
    it('uses axios for inline images instead of downloadAttachment', async () => {
      const inlineAtt = makeAttachment({
        id: 10,
        file_name: 'inline-img.png',
        content_type: 'image/png',
        is_inline: true,
        content_url: 'https://example.com/inline-img.png'
      });

      const client = createMockZendeskClient([inlineAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      const inlineData = Buffer.from('inline-image-bytes');
      mockAxios.mockResolvedValue({
        data: inlineData,
        headers: { 'content-type': 'image/png' }
      });

      mockCreate.mockResolvedValue({
        content: [{ text: 'Inline image analysis' }]
      });

      const result = await analyzeImagesTool.handler({ id: 300 });

      // axios should be called for inline images
      expect(mockAxios).toHaveBeenCalledTimes(1);
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'https://example.com/inline-img.png',
          responseType: 'arraybuffer',
          timeout: 30000
        })
      );

      // downloadAttachment should NOT be called (axios succeeded)
      expect(client.downloadAttachment).not.toHaveBeenCalled();

      expect(result.content[0].text).toContain('Inline image analysis');
    });

    it('falls back to downloadAttachment when axios fails for inline image', async () => {
      const inlineAtt = makeAttachment({
        id: 20,
        file_name: 'inline-fallback.png',
        content_type: 'image/png',
        is_inline: true,
        content_url: 'https://example.com/inline-fallback.png'
      });

      const client = createMockZendeskClient([inlineAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      // axios fails
      mockAxios.mockRejectedValue(new Error('Network error'));

      // fallback succeeds
      client.downloadAttachment.mockResolvedValue({
        data: Buffer.from('fallback-data'),
        contentType: 'image/png',
        size: 13
      });

      mockCreate.mockResolvedValue({
        content: [{ text: 'Fallback analysis' }]
      });

      const result = await analyzeImagesTool.handler({ id: 301 });

      expect(mockAxios).toHaveBeenCalledTimes(1);
      expect(client.downloadAttachment).toHaveBeenCalledWith(
        'https://example.com/inline-fallback.png'
      );
      expect(result.content[0].text).toContain('Fallback analysis');
    });

    it('uses content-type from axios response headers when available', async () => {
      const inlineAtt = makeAttachment({
        id: 30,
        file_name: 'photo.jpg',
        content_type: 'image/jpeg',
        is_inline: true,
        content_url: 'https://example.com/photo.jpg'
      });

      const client = createMockZendeskClient([inlineAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      mockAxios.mockResolvedValue({
        data: Buffer.from('jpeg-bytes'),
        headers: { 'content-type': 'image/webp' }  // server reports different type
      });

      mockCreate.mockResolvedValue({
        content: [{ text: 'Analysis' }]
      });

      await analyzeImagesTool.handler({ id: 302 });

      const callArgs = mockCreate.mock.calls[0][0];
      // Should use the content-type from the HTTP response
      expect(callArgs.messages[0].content[0].source.media_type).toBe('image/webp');
    });

    it('uses attachment content_type when axios response has no content-type header', async () => {
      const inlineAtt = makeAttachment({
        id: 31,
        file_name: 'image.png',
        content_type: 'image/png',
        is_inline: true,
        content_url: 'https://example.com/image.png'
      });

      const client = createMockZendeskClient([inlineAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      mockAxios.mockResolvedValue({
        data: Buffer.from('image-bytes'),
        headers: {}  // no content-type header
      });

      mockCreate.mockResolvedValue({
        content: [{ text: 'Analysis' }]
      });

      await analyzeImagesTool.handler({ id: 303 });

      const callArgs = mockCreate.mock.calls[0][0];
      // Falls back to attachment.content_type
      expect(callArgs.messages[0].content[0].source.media_type).toBe('image/png');
    });

    it('does not use axios for non-inline attachments', async () => {
      const regularAtt = makeAttachment({
        id: 40,
        file_name: 'attached.png',
        content_type: 'image/png',
        is_inline: false
      });

      const client = createMockZendeskClient([regularAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Regular analysis' }]
      });

      await analyzeImagesTool.handler({ id: 304 });

      expect(mockAxios).not.toHaveBeenCalled();
      expect(client.downloadAttachment).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Download failure
  // -----------------------------------------------------------------------
  describe('download failure', () => {
    it('includes error message for failed image while other images still process', async () => {
      const failAtt = makeAttachment({
        id: 1,
        file_name: 'broken.png',
        content_type: 'image/png',
        comment_id: 100,
        is_inline: false
      });
      const goodAtt = makeAttachment({
        id: 2,
        file_name: 'working.png',
        content_type: 'image/png',
        comment_id: 200,
        is_inline: false
      });

      const client = createMockZendeskClient([failAtt, goodAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      // First download fails, second succeeds
      client.downloadAttachment
        .mockRejectedValueOnce(new Error('Download timed out'))
        .mockResolvedValueOnce({
          data: Buffer.from('good-data'),
          contentType: 'image/png',
          size: 9
        });

      mockCreate.mockResolvedValue({
        content: [{ text: 'Working image analysis' }]
      });

      const result = await analyzeImagesTool.handler({ id: 500 });
      const text = result.content[0].text;

      expect(text).toContain('Found 2 image(s) in ticket 500');
      expect(text).toContain('broken.png');
      expect(text).toContain('Download timed out');
      expect(text).toContain('working.png');
      expect(text).toContain('Working image analysis');
    });

    it('shows error info for failed attachment without size or content_type', async () => {
      const failAtt = makeAttachment({
        id: 99,
        file_name: 'fail.png',
        content_type: 'image/png',
        comment_id: 555,
        is_inline: false
      });

      const client = createMockZendeskClient([failAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      client.downloadAttachment.mockRejectedValue(new Error('403 Forbidden'));

      const result = await analyzeImagesTool.handler({ id: 501 });
      const text = result.content[0].text;

      expect(text).toContain('fail.png');
      expect(text).toContain('403 Forbidden');
    });
  });

  // -----------------------------------------------------------------------
  // Claude API failure
  // -----------------------------------------------------------------------
  describe('Claude API failure', () => {
    it('includes error message when anthropic.messages.create throws', async () => {
      const attachment = makeAttachment({
        id: 77,
        file_name: 'image.png',
        content_type: 'image/png',
        comment_id: 800,
        is_inline: false
      });

      const client = createMockZendeskClient([attachment]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockRejectedValue(new Error('Anthropic API rate limit exceeded'));

      const result = await analyzeImagesTool.handler({ id: 600 });
      const text = result.content[0].text;

      expect(text).toContain('image.png');
      expect(text).toContain('Anthropic API rate limit exceeded');
    });

    it('still processes other images if one Claude call fails', async () => {
      const att1 = makeAttachment({
        id: 1,
        file_name: 'first.png',
        content_type: 'image/png',
        is_inline: false
      });
      const att2 = makeAttachment({
        id: 2,
        file_name: 'second.png',
        content_type: 'image/png',
        is_inline: false
      });

      const client = createMockZendeskClient([att1, att2]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate
        .mockRejectedValueOnce(new Error('Claude unavailable'))
        .mockResolvedValueOnce({ content: [{ text: 'Second image OK' }] });

      const result = await analyzeImagesTool.handler({ id: 601 });
      const text = result.content[0].text;

      expect(text).toContain('first.png');
      expect(text).toContain('Claude unavailable');
      expect(text).toContain('second.png');
      expect(text).toContain('Second image OK');
    });
  });

  // -----------------------------------------------------------------------
  // max_tokens capping
  // -----------------------------------------------------------------------
  describe('max_tokens capping', () => {
    it('caps max_tokens at 4096 when a higher value is provided', async () => {
      const attachment = makeAttachment();
      const client = createMockZendeskClient([attachment]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Analysis' }]
      });

      await analyzeImagesTool.handler({ id: 1, max_tokens: 8000 });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(4096);
    });

    it('uses provided max_tokens when it is below 4096', async () => {
      const attachment = makeAttachment();
      const client = createMockZendeskClient([attachment]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Short analysis' }]
      });

      await analyzeImagesTool.handler({ id: 1, max_tokens: 1024 });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(1024);
    });

    it('uses default max_tokens of 4096 when not specified', async () => {
      const attachment = makeAttachment();
      const client = createMockZendeskClient([attachment]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Default tokens analysis' }]
      });

      await analyzeImagesTool.handler({ id: 1 });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(4096);
    });
  });

  // -----------------------------------------------------------------------
  // Handler-level error (e.g. getZendeskClient throws)
  // -----------------------------------------------------------------------
  describe('handler-level errors', () => {
    it('calls createErrorResponse when getZendeskClient throws', async () => {
      const { createErrorResponse } = await import('../../src/utils/errors.js');

      mockGetZendeskClient.mockImplementation(() => {
        throw new Error('No session context');
      });

      const result = await analyzeImagesTool.handler({ id: 999 });

      expect(createErrorResponse).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'No session context' })
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No session context');
    });

    it('calls createErrorResponse when getTicketAttachments throws', async () => {
      const { createErrorResponse } = await import('../../src/utils/errors.js');

      const client = createMockZendeskClient();
      client.getTicketAttachments.mockRejectedValue(new Error('Zendesk API 503'));
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeImagesTool.handler({ id: 888 });

      expect(createErrorResponse).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Zendesk API 503' })
      );
      expect(result.isError).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Result formatting details
  // -----------------------------------------------------------------------
  describe('result formatting', () => {
    it('labels inline images with "Inline" source type', async () => {
      const inlineAtt = makeAttachment({
        id: 50,
        file_name: 'inline.png',
        content_type: 'image/png',
        is_inline: true,
        content_url: 'https://example.com/inline.png'
      });

      const client = createMockZendeskClient([inlineAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      mockAxios.mockResolvedValue({
        data: Buffer.from('data'),
        headers: { 'content-type': 'image/png' }
      });

      mockCreate.mockResolvedValue({
        content: [{ text: 'Inline analysis' }]
      });

      const result = await analyzeImagesTool.handler({ id: 700 });
      const text = result.content[0].text;

      expect(text).toContain('Inline');
    });

    it('labels attached images with "Attached" source type', async () => {
      const attachedAtt = makeAttachment({
        id: 51,
        file_name: 'attached.png',
        content_type: 'image/png',
        is_inline: false
      });

      const client = createMockZendeskClient([attachedAtt]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Attached analysis' }]
      });

      const result = await analyzeImagesTool.handler({ id: 701 });
      const text = result.content[0].text;

      expect(text).toContain('Attached');
    });

    it('includes byte size in output when available', async () => {
      const attachment = makeAttachment({
        id: 60,
        file_name: 'sized.png',
        content_type: 'image/png',
        size: 12345,
        is_inline: false
      });

      const client = createMockZendeskClient([attachment]);
      const fakeData = Buffer.alloc(12345);
      client.downloadAttachment.mockResolvedValue({
        data: fakeData,
        contentType: 'image/png',
        size: 12345
      });
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Size analysis' }]
      });

      const result = await analyzeImagesTool.handler({ id: 702 });
      const text = result.content[0].text;

      expect(text).toContain('12345 bytes');
    });

    it('does not show inline/attached breakdown when include_inline is false', async () => {
      const attachment = makeAttachment({
        id: 70,
        file_name: 'only-attached.png',
        content_type: 'image/png',
        is_inline: false
      });

      const client = createMockZendeskClient([attachment]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Analysis' }]
      });

      const result = await analyzeImagesTool.handler({ id: 703, include_inline: false });
      const text = result.content[0].text;

      // When include_inline is false, formatImageAnalysisResults should not show breakdown
      expect(text).toContain('Found 1 image(s) in ticket 703');
      expect(text).not.toContain('attached, 0 inline');
    });

    it('returns MCP-compatible response shape', async () => {
      const attachment = makeAttachment();
      const client = createMockZendeskClient([attachment]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ text: 'Test' }]
      });

      const result = await analyzeImagesTool.handler({ id: 1 });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(typeof result.content[0].text).toBe('string');
    });
  });
});
