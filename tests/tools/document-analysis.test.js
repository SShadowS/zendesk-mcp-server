import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks – must be declared before any imports that depend on them
// ---------------------------------------------------------------------------

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

const mockGetZendeskClient = vi.fn();
vi.mock('../../src/request-context.js', () => ({
  getZendeskClient: (...args) => mockGetZendeskClient(...args),
}));

vi.mock('../../src/utils/errors.js', () => ({
  createErrorResponse: vi.fn((error) => ({
    content: [{ type: 'text', text: `Error: ${error.message}` }],
    isError: true,
  })),
}));

const mockAxios = vi.fn();
vi.mock('axios', () => ({ default: mockAxios }));

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      constructor() {
        this.messages = { create: mockCreate };
      }
    },
  };
});

// Don't mock document-handler or document-types – let them work naturally.
// We DO mock converter-client since document-handler imports it.
vi.mock('../../src/utils/converter-client.js', () => ({
  ConverterClient: vi.fn().mockImplementation(() => ({
    convertToPDF: vi.fn().mockResolvedValue({
      success: true,
      data: Buffer.from('fake-pdf'),
      format: 'pdf',
      size: 8,
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------
const { documentAnalysisTools } = await import(
  '../../src/tools/document-analysis.js'
);

const analyzeDocsTool = documentAnalysisTools.find(
  (t) => t.name === 'analyze_ticket_documents'
);
const getDocSummaryTool = documentAnalysisTools.find(
  (t) => t.name === 'get_document_summary'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock ZendeskClient with configurable attachment responses.
 */
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
      data: Buffer.from('fake-content'),
      contentType: 'application/pdf',
      size: 12,
    }),
  };
}

/** Shorthand for a PDF attachment. */
function pdfAttachment(name = 'report.pdf', size = 5000) {
  return {
    file_name: name,
    content_type: 'application/pdf',
    content_url: `https://cdn.zendesk.com/${name}`,
    size,
    is_inline: false,
  };
}

/** Shorthand for an image attachment. */
function imageAttachment(name = 'screenshot.png', size = 3000) {
  return {
    file_name: name,
    content_type: 'image/png',
    content_url: `https://cdn.zendesk.com/${name}`,
    size,
    is_inline: false,
  };
}

/** Shorthand for a blocked executable attachment. */
function exeAttachment(name = 'malware.exe', size = 1000) {
  return {
    file_name: name,
    content_type: 'application/x-msdownload',
    content_url: `https://cdn.zendesk.com/${name}`,
    size,
    is_inline: false,
  };
}

/** Shorthand for a text attachment. */
function textAttachment(name = 'notes.txt', size = 200) {
  return {
    file_name: name,
    content_type: 'text/plain',
    content_url: `https://cdn.zendesk.com/${name}`,
    size,
    is_inline: false,
  };
}

/** Shorthand for an unsupported file type (e.g., .pages). */
function unsupportedAttachment(name = 'design.pages', size = 4000) {
  return {
    file_name: name,
    content_type: 'application/vnd.apple.pages',
    content_url: `https://cdn.zendesk.com/${name}`,
    size,
    is_inline: false,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Default Claude response
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'This is a detailed analysis of the document.' }],
  });
});

// ===========================================================================
// Tool discovery
// ===========================================================================
describe('documentAnalysisTools exports', () => {
  it('should export an array with two tools', () => {
    expect(documentAnalysisTools).toHaveLength(2);
  });

  it('should contain analyze_ticket_documents tool', () => {
    expect(analyzeDocsTool).toBeDefined();
    expect(analyzeDocsTool.name).toBe('analyze_ticket_documents');
  });

  it('should contain get_document_summary tool', () => {
    expect(getDocSummaryTool).toBeDefined();
    expect(getDocSummaryTool.name).toBe('get_document_summary');
  });
});

// ===========================================================================
// analyze_ticket_documents
// ===========================================================================
describe('analyze_ticket_documents handler', () => {
  // -------------------------------------------------------------------------
  // No attachments
  // -------------------------------------------------------------------------
  describe('when the ticket has no attachments', () => {
    it('should return "No attachments found" message', async () => {
      const client = createMockZendeskClient([]);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeDocsTool.handler({ id: 42 });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe('No attachments found in ticket 42.');
      expect(client.getTicketAttachments).toHaveBeenCalledWith(42, {
        includeInlineImages: true,
      });
    });

    it('should handle undefined attachments array', async () => {
      const client = {
        getTicketAttachments: vi.fn().mockResolvedValue({}),
        downloadAttachment: vi.fn(),
      };
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeDocsTool.handler({ id: 99 });

      expect(result.content[0].text).toBe('No attachments found in ticket 99.');
    });
  });

  // -------------------------------------------------------------------------
  // No processable documents (only blocked)
  // -------------------------------------------------------------------------
  describe('when only blocked files exist', () => {
    it('should return message with blocked file info', async () => {
      const client = createMockZendeskClient([exeAttachment()]);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeDocsTool.handler({ id: 10 });

      const text = result.content[0].text;
      expect(text).toContain('No processable documents found in ticket 10');
      expect(text).toContain('Blocked files (1)');
      expect(text).toContain('malware.exe');
    });
  });

  // -------------------------------------------------------------------------
  // Single PDF success
  // -------------------------------------------------------------------------
  describe('when a single PDF attachment is present', () => {
    it('should download, analyze with Claude, and return the analysis', async () => {
      const pdf = pdfAttachment('invoice.pdf', 2000);
      const client = createMockZendeskClient([pdf]);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Invoice total: $1,234.56' }],
      });

      const result = await analyzeDocsTool.handler({ id: 7 });

      const text = result.content[0].text;
      // Result should contain analysis text
      expect(text).toContain('Invoice total: $1,234.56');
      expect(text).toContain('invoice.pdf');

      // Claude was called
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-6');
      expect(callArgs.max_tokens).toBeLessThanOrEqual(4096);

      // Zendesk client was used to download
      expect(client.downloadAttachment).toHaveBeenCalledWith(pdf.content_url);
    });

    it('should pass custom analysis_prompt to Claude', async () => {
      const pdf = pdfAttachment();
      const client = createMockZendeskClient([pdf]);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeDocsTool.handler({
        id: 1,
        analysis_prompt: 'Summarize in 3 bullet points.',
      });

      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[0].content;
      // The prompt text should appear in the message content (with ticket context prepended)
      const hasPrompt = userContent.some(
        (block) =>
          block.type === 'text' && block.text.includes('Summarize in 3 bullet points.')
      );
      expect(hasPrompt).toBe(true);
    });

    it('should include system prompt in Claude API call', async () => {
      const pdf = pdfAttachment();
      const client = createMockZendeskClient([pdf]);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeDocsTool.handler({ id: 1 });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toBeDefined();
      expect(callArgs.system).toContain('technical support analyst');
    });

    it('should include ticket context in analysis prompt', async () => {
      const pdf = pdfAttachment();
      const client = createMockZendeskClient([pdf]);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeDocsTool.handler({ id: 1 });

      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[0].content;
      const hasContext = userContent.some(
        (block) =>
          block.type === 'text' && block.text.includes('Support ticket: "Test ticket subject"')
      );
      expect(hasContext).toBe(true);
    });

    it('should fetch ticket context only once for multiple documents', async () => {
      const attachments = [
        pdfAttachment('doc1.pdf'),
        pdfAttachment('doc2.pdf'),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeDocsTool.handler({ id: 5 });

      expect(client.getTicket).toHaveBeenCalledTimes(1);
      expect(client.getTicket).toHaveBeenCalledWith(5, true);
    });

    it('should proceed without context if getTicket fails', async () => {
      const pdf = pdfAttachment();
      const client = createMockZendeskClient([pdf]);
      client.getTicket.mockRejectedValue(new Error('Ticket not found'));
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeDocsTool.handler({ id: 999 });

      // Should still succeed
      const text = result.content[0].text;
      expect(text).toContain('report.pdf');
      // Prompt should not contain ticket context prefix
      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[0].content;
      const hasContext = userContent.some(
        (block) =>
          block.type === 'text' && block.text.includes('Support ticket:')
      );
      expect(hasContext).toBe(false);
    });

    it('should respect max_tokens parameter (capped at 4096)', async () => {
      const pdf = pdfAttachment();
      const client = createMockZendeskClient([pdf]);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeDocsTool.handler({ id: 1, max_tokens: 2000 });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(2000);
    });

    it('should cap max_tokens at 4096 when a higher value is given', async () => {
      const pdf = pdfAttachment();
      const client = createMockZendeskClient([pdf]);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeDocsTool.handler({ id: 1, max_tokens: 8000 });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(4096);
    });
  });

  // -------------------------------------------------------------------------
  // Quick mode limits to 3
  // -------------------------------------------------------------------------
  describe('quick_mode', () => {
    it('should process only the first 3 documents when quick_mode=true', async () => {
      const attachments = [
        pdfAttachment('doc1.pdf'),
        pdfAttachment('doc2.pdf'),
        pdfAttachment('doc3.pdf'),
        pdfAttachment('doc4.pdf'),
        pdfAttachment('doc5.pdf'),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeDocsTool.handler({ id: 5, quick_mode: true });

      // Only 3 downloads should have occurred
      expect(client.downloadAttachment).toHaveBeenCalledTimes(3);
      expect(mockCreate).toHaveBeenCalledTimes(3);

      // Result text should mention "Quick analysis"
      const text = result.content[0].text;
      expect(text).toContain('Quick analysis');
      expect(text).toContain('3 document(s)');
    });

    it('should not limit when there are 3 or fewer documents', async () => {
      const attachments = [
        pdfAttachment('doc1.pdf'),
        pdfAttachment('doc2.pdf'),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeDocsTool.handler({ id: 5, quick_mode: true });

      expect(client.downloadAttachment).toHaveBeenCalledTimes(2);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Document type filtering
  // -------------------------------------------------------------------------
  describe('document_types filtering', () => {
    it('should only process PDFs when document_types=["pdf"]', async () => {
      const attachments = [
        pdfAttachment('report.pdf'),
        imageAttachment('photo.png'),
        textAttachment('readme.txt'),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeDocsTool.handler({
        id: 3,
        document_types: ['pdf'],
      });

      // Only 1 download (PDF), not the image or text
      expect(client.downloadAttachment).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledTimes(1);

      const text = result.content[0].text;
      expect(text).toContain('report.pdf');
    });

    it('should allow filtering for multiple types', async () => {
      const attachments = [
        pdfAttachment('doc.pdf'),
        imageAttachment('img.png'),
        textAttachment('notes.txt'),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeDocsTool.handler({
        id: 3,
        document_types: ['pdf', 'text'],
      });

      // PDF + text = 2
      expect(client.downloadAttachment).toHaveBeenCalledTimes(2);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // include_images=false excludes images
  // -------------------------------------------------------------------------
  describe('include_images filtering', () => {
    it('should exclude images when include_images=false', async () => {
      const attachments = [
        pdfAttachment('report.pdf'),
        imageAttachment('screenshot.png'),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeDocsTool.handler({ id: 4, include_images: false });

      // Only the PDF should be processed
      expect(client.downloadAttachment).toHaveBeenCalledTimes(1);
      expect(client.downloadAttachment).toHaveBeenCalledWith(
        'https://cdn.zendesk.com/report.pdf'
      );
    });

    it('should include images by default', async () => {
      const attachments = [
        pdfAttachment('report.pdf'),
        imageAttachment('screenshot.png'),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeDocsTool.handler({ id: 4 });

      // Both should be processed
      expect(client.downloadAttachment).toHaveBeenCalledTimes(2);
    });

    it('should pass includeInlineImages=false to getTicketAttachments', async () => {
      const client = createMockZendeskClient([]);
      mockGetZendeskClient.mockReturnValue(client);

      await analyzeDocsTool.handler({ id: 4, include_images: false });

      expect(client.getTicketAttachments).toHaveBeenCalledWith(4, {
        includeInlineImages: false,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Download failure for one document
  // -------------------------------------------------------------------------
  describe('when download fails for one document', () => {
    it('should record error for that document and continue processing others', async () => {
      const attachments = [
        pdfAttachment('good.pdf'),
        pdfAttachment('bad.pdf'),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      // First call succeeds, second throws
      client.downloadAttachment
        .mockResolvedValueOnce({
          data: Buffer.from('pdf-data'),
          contentType: 'application/pdf',
          size: 8,
        })
        .mockRejectedValueOnce(new Error('Network timeout'));

      const result = await analyzeDocsTool.handler({ id: 20 });

      const text = result.content[0].text;
      // good.pdf should have analysis
      expect(text).toContain('good.pdf');
      // bad.pdf should show error
      expect(text).toContain('bad.pdf');
      expect(text).toContain('Network timeout');

      // Claude only called once (for the successful download)
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Claude API failure
  // -------------------------------------------------------------------------
  describe('when Claude API fails', () => {
    it('should record error in analysis result for that document', async () => {
      const attachments = [pdfAttachment('report.pdf')];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      mockCreate.mockRejectedValue(new Error('Claude API rate limit exceeded'));

      const result = await analyzeDocsTool.handler({ id: 30 });

      const text = result.content[0].text;
      expect(text).toContain('report.pdf');
      expect(text).toContain('Claude API rate limit exceeded');
    });
  });

  // -------------------------------------------------------------------------
  // Inline attachment handling
  // -------------------------------------------------------------------------
  describe('inline attachment download', () => {
    it('should use axios directly for inline attachments', async () => {
      const inlineImage = {
        ...imageAttachment('inline.png'),
        is_inline: true,
      };
      const client = createMockZendeskClient([inlineImage]);
      mockGetZendeskClient.mockReturnValue(client);

      mockAxios.mockResolvedValue({
        data: Buffer.from('inline-image-data'),
        headers: { 'content-type': 'image/png' },
      });

      await analyzeDocsTool.handler({ id: 50 });

      // axios should have been called directly for inline content
      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: inlineImage.content_url,
          responseType: 'arraybuffer',
          timeout: 30000,
        })
      );
      // Zendesk download should NOT have been called
      expect(client.downloadAttachment).not.toHaveBeenCalled();
    });

    it('should fall back to zendeskClient.downloadAttachment when axios fails for inline', async () => {
      const inlineImage = {
        ...imageAttachment('inline.png'),
        is_inline: true,
      };
      const client = createMockZendeskClient([inlineImage]);
      mockGetZendeskClient.mockReturnValue(client);

      mockAxios.mockRejectedValue(new Error('403 Forbidden'));

      await analyzeDocsTool.handler({ id: 51 });

      // Axios was attempted first
      expect(mockAxios).toHaveBeenCalled();
      // Then fell back to zendesk client
      expect(client.downloadAttachment).toHaveBeenCalledWith(
        inlineImage.content_url
      );
    });
  });

  // -------------------------------------------------------------------------
  // Mixed blocked, unsupported, and valid
  // -------------------------------------------------------------------------
  describe('with mixed valid, blocked, and unsupported attachments', () => {
    it('should process valid docs and report skipped files in summary', async () => {
      const attachments = [
        pdfAttachment('report.pdf'),
        exeAttachment('virus.exe'),
        unsupportedAttachment('keynote.pages'),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await analyzeDocsTool.handler({ id: 15 });

      const text = result.content[0].text;
      // Valid doc processed
      expect(text).toContain('report.pdf');
      // Skipped summary
      expect(text).toContain('Files Not Processed');
      expect(text).toContain('1 blocked for security');
      expect(text).toContain('1 unsupported format');
    });
  });

  // -------------------------------------------------------------------------
  // Top-level error (e.g., getZendeskClient throws)
  // -------------------------------------------------------------------------
  describe('when a top-level error occurs', () => {
    it('should return createErrorResponse result', async () => {
      mockGetZendeskClient.mockImplementation(() => {
        throw new Error('No active session');
      });

      const result = await analyzeDocsTool.handler({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No active session');
    });
  });

  // -------------------------------------------------------------------------
  // Text document analysis (not PDF or image – uses text block)
  // -------------------------------------------------------------------------
  describe('text document analysis', () => {
    it('should send text content directly to Claude for text files', async () => {
      const txt = textAttachment('notes.txt', 200);
      const client = createMockZendeskClient([txt]);
      mockGetZendeskClient.mockReturnValue(client);

      client.downloadAttachment.mockResolvedValue({
        data: Buffer.from('Meeting notes from Tuesday'),
        contentType: 'text/plain',
        size: 26,
      });

      await analyzeDocsTool.handler({ id: 60 });

      // Claude should be called with a text block containing file content
      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[0].content;
      expect(userContent).toHaveLength(1);
      expect(userContent[0].type).toBe('text');
      expect(userContent[0].text).toContain('Meeting notes from Tuesday');
    });
  });
});

// ===========================================================================
// get_document_summary
// ===========================================================================
describe('get_document_summary handler', () => {
  // -------------------------------------------------------------------------
  // No attachments
  // -------------------------------------------------------------------------
  describe('when the ticket has no attachments', () => {
    it('should return "No attachments found" message', async () => {
      const client = createMockZendeskClient([]);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await getDocSummaryTool.handler({ id: 100 });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe('No attachments found in ticket 100.');
    });

    it('should handle undefined attachments array', async () => {
      const client = {
        getTicketAttachments: vi.fn().mockResolvedValue({}),
      };
      mockGetZendeskClient.mockReturnValue(client);

      const result = await getDocSummaryTool.handler({ id: 101 });

      expect(result.content[0].text).toBe('No attachments found in ticket 101.');
    });
  });

  // -------------------------------------------------------------------------
  // With mixed attachments
  // -------------------------------------------------------------------------
  describe('with mixed attachment types', () => {
    it('should group valid documents by category and list blocked/unsupported', async () => {
      const attachments = [
        pdfAttachment('report.pdf', 5000),
        exeAttachment('setup.exe', 1000),
        unsupportedAttachment('design.pages', 4000),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await getDocSummaryTool.handler({ id: 200 });

      const text = result.content[0].text;

      // Header
      expect(text).toContain('Ticket 200 Document Summary');
      expect(text).toContain('Total attachments: 3');

      // Valid PDF grouped
      expect(text).toContain('Processable Documents');
      expect(text).toContain('PDF');
      expect(text).toContain('report.pdf');

      // Blocked
      expect(text).toContain('Blocked Files (1)');
      expect(text).toContain('setup.exe');

      // Unsupported
      expect(text).toContain('Unsupported Files (1)');
      expect(text).toContain('design.pages');
    });

    it('should group multiple valid files by their categories', async () => {
      const attachments = [
        pdfAttachment('a.pdf', 1000),
        pdfAttachment('b.pdf', 2000),
        imageAttachment('photo.png', 3000),
        textAttachment('readme.txt', 500),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await getDocSummaryTool.handler({ id: 201 });

      const text = result.content[0].text;

      expect(text).toContain('Total attachments: 4');
      // Should have PDF, IMAGE, and TEXT categories
      expect(text).toContain('PDF (2)');
      expect(text).toContain('IMAGE (1)');
      expect(text).toContain('TEXT (1)');
    });
  });

  // -------------------------------------------------------------------------
  // Total size calculation
  // -------------------------------------------------------------------------
  describe('total size calculation', () => {
    it('should report the total size of all valid files', async () => {
      const attachments = [
        pdfAttachment('a.pdf', 1024),
        pdfAttachment('b.pdf', 2048),
      ];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await getDocSummaryTool.handler({ id: 300 });

      const text = result.content[0].text;
      // totalSize should be 3072 bytes = 3 KB
      expect(text).toContain('Total size: 3 KB');
    });

    it('should show 0 Bytes when no valid files exist (only blocked)', async () => {
      const attachments = [exeAttachment('bad.exe', 5000)];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await getDocSummaryTool.handler({ id: 301 });

      const text = result.content[0].text;
      expect(text).toContain('Total size: 0 Bytes');
    });
  });

  // -------------------------------------------------------------------------
  // Files too large
  // -------------------------------------------------------------------------
  describe('too-large files', () => {
    it('should list files exceeding size limits', async () => {
      const bigPdf = pdfAttachment('huge.pdf', 100 * 1024 * 1024); // 100MB > 32MB limit
      const attachments = [bigPdf];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await getDocSummaryTool.handler({ id: 400 });

      const text = result.content[0].text;
      expect(text).toContain('Files Too Large (1)');
      expect(text).toContain('huge.pdf');
    });
  });

  // -------------------------------------------------------------------------
  // Includes inline images when requested
  // -------------------------------------------------------------------------
  describe('inline images', () => {
    it('should request inline images from the API', async () => {
      const client = createMockZendeskClient([]);
      mockGetZendeskClient.mockReturnValue(client);

      await getDocSummaryTool.handler({ id: 500 });

      expect(client.getTicketAttachments).toHaveBeenCalledWith(500, {
        includeInlineImages: true,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Top-level error
  // -------------------------------------------------------------------------
  describe('when a top-level error occurs', () => {
    it('should return createErrorResponse result', async () => {
      mockGetZendeskClient.mockImplementation(() => {
        throw new Error('Session expired');
      });

      const result = await getDocSummaryTool.handler({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Session expired');
    });
  });

  // -------------------------------------------------------------------------
  // Recommendations for unsupported files
  // -------------------------------------------------------------------------
  describe('unsupported file recommendations', () => {
    it('should include a recommendation for each unsupported file', async () => {
      const attachments = [unsupportedAttachment('presentation.pages', 2000)];
      const client = createMockZendeskClient(attachments);
      mockGetZendeskClient.mockReturnValue(client);

      const result = await getDocSummaryTool.handler({ id: 600 });

      const text = result.content[0].text;
      expect(text).toContain('Unsupported Files (1)');
      expect(text).toContain('presentation.pages');
      expect(text).toContain('Recommendation:');
    });
  });
});
