import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ConverterClient before importing DocumentHandler
const mockConvertToPDF = vi.fn();
const mockHealthCheck = vi.fn();

vi.mock('../../src/utils/converter-client.js', () => {
  return {
    ConverterClient: class MockConverterClient {
      constructor() {}
      convertToPDF(...args) {
        return mockConvertToPDF(...args);
      }
      healthCheck(...args) {
        return mockHealthCheck(...args);
      }
    },
  };
});

import { DocumentHandler } from '../../src/utils/document-handler.js';

beforeEach(() => {
  vi.clearAllMocks();

  // Default: successful PDF conversion
  mockConvertToPDF.mockResolvedValue({
    success: true,
    data: Buffer.from('fake-pdf'),
    format: 'pdf',
    size: 8,
  });
});

// ---------------------------------------------------------------------------
// detectType()
// ---------------------------------------------------------------------------
describe('DocumentHandler.detectType()', () => {
  it('should detect PDF by MIME type', () => {
    const result = DocumentHandler.detectType({
      content_type: 'application/pdf',
      file_name: 'doc.pdf',
    });

    expect(result.supported).toBe(true);
    expect(result.category).toBe('pdf');
    expect(result.type).toBe('application/pdf');
    expect(result.processor).toBe('native-pdf');
    expect(result.apiSupport).toBe('document');
    expect(result.maxSize).toBeGreaterThan(0);
  });

  it('should detect image by MIME type', () => {
    const result = DocumentHandler.detectType({
      content_type: 'image/png',
      file_name: 'img.png',
    });

    expect(result.supported).toBe(true);
    expect(result.category).toBe('image');
    expect(result.type).toBe('image/png');
    expect(result.processor).toBe('native-image');
    expect(result.apiSupport).toBe('image');
  });

  it('should detect text by MIME type', () => {
    const result = DocumentHandler.detectType({
      content_type: 'text/plain',
      file_name: 'readme.txt',
    });

    expect(result.supported).toBe(true);
    expect(result.category).toBe('text');
    expect(result.type).toBe('text/plain');
    expect(result.processor).toBe('text-direct');
    expect(result.apiSupport).toBe('text');
  });

  it('should detect data (CSV) by MIME type', () => {
    const result = DocumentHandler.detectType({
      content_type: 'text/csv',
      file_name: 'data.csv',
    });

    expect(result.supported).toBe(true);
    expect(result.category).toBe('data');
    expect(result.type).toBe('text/csv');
    expect(result.processor).toBe('text-structured');
    expect(result.apiSupport).toBe('text');
  });

  it('should detect Office DOCX by MIME type', () => {
    const result = DocumentHandler.detectType({
      content_type:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      file_name: 'doc.docx',
    });

    expect(result.supported).toBe(true);
    expect(result.category).toBe('office');
    expect(result.processor).toBe('office-extractor');
    expect(result.apiSupport).toBe('requires-extraction');
  });

  it('should fall back to extension when MIME type is unknown', () => {
    const result = DocumentHandler.detectType({
      content_type: 'application/octet-stream',
      file_name: 'doc.pdf',
    });

    expect(result.supported).toBe(true);
    expect(result.category).toBe('pdf');
    expect(result.type).toBe('inferred/pdf');
  });

  it('should return unsupported for unknown MIME and unknown extension', () => {
    const result = DocumentHandler.detectType({
      content_type: 'application/octet-stream',
      file_name: 'file.xyz',
    });

    expect(result.supported).toBe(false);
    expect(result.category).toBe('unsupported');
    expect(result.processor).toBeNull();
  });

  it('should fall back to extension when content_type is null', () => {
    const result = DocumentHandler.detectType({
      content_type: null,
      file_name: 'doc.pdf',
    });

    expect(result.supported).toBe(true);
    expect(result.category).toBe('pdf');
    expect(result.type).toBe('inferred/pdf');
  });
});

// ---------------------------------------------------------------------------
// validateSize()
// ---------------------------------------------------------------------------
describe('DocumentHandler.validateSize()', () => {
  it('should be valid when size is under the limit', () => {
    const result = DocumentHandler.validateSize({ size: 1000 }, 2000);

    expect(result.valid).toBe(true);
    expect(result.size).toBe(1000);
    expect(result.maxSize).toBe(2000);
  });

  it('should be valid when size equals the limit', () => {
    const result = DocumentHandler.validateSize({ size: 2000 }, 2000);

    expect(result.valid).toBe(true);
    expect(result.size).toBe(2000);
  });

  it('should be invalid when size exceeds the limit', () => {
    const result = DocumentHandler.validateSize({ size: 2001 }, 2000);

    expect(result.valid).toBe(false);
    expect(result.size).toBe(2001);
  });

  it('should be valid when size is zero', () => {
    const result = DocumentHandler.validateSize({ size: 0 }, 2000);

    expect(result.valid).toBe(true);
    expect(result.size).toBe(0);
    expect(result.humanSize).toBe('0 Bytes');
  });

  it('should treat missing size (undefined) as 0 and be valid', () => {
    const result = DocumentHandler.validateSize({}, 2000);

    expect(result.valid).toBe(true);
    expect(result.size).toBe(0);
    expect(result.humanSize).toBe('0 Bytes');
  });
});

// ---------------------------------------------------------------------------
// formatBytes()
// ---------------------------------------------------------------------------
describe('DocumentHandler.formatBytes()', () => {
  it('should format 0 as "0 Bytes"', () => {
    expect(DocumentHandler.formatBytes(0)).toBe('0 Bytes');
  });

  it('should format 500 as "500 Bytes"', () => {
    expect(DocumentHandler.formatBytes(500)).toBe('500 Bytes');
  });

  it('should format 1024 as "1 KB"', () => {
    expect(DocumentHandler.formatBytes(1024)).toBe('1 KB');
  });

  it('should format 1536 as "1.5 KB"', () => {
    expect(DocumentHandler.formatBytes(1536)).toBe('1.5 KB');
  });

  it('should format 1048576 as "1 MB"', () => {
    expect(DocumentHandler.formatBytes(1048576)).toBe('1 MB');
  });

  it('should format 1073741824 as "1 GB"', () => {
    expect(DocumentHandler.formatBytes(1073741824)).toBe('1 GB');
  });
});

// ---------------------------------------------------------------------------
// route()
// ---------------------------------------------------------------------------
describe('DocumentHandler.route()', () => {
  it('should return success for a supported file with valid size', async () => {
    const attachment = {
      content_type: 'application/pdf',
      file_name: 'report.pdf',
      size: 1000,
      comment_id: 42,
    };
    const data = Buffer.from('pdf-content');

    const result = await DocumentHandler.route(attachment, data);

    expect(result.success).toBe(true);
    expect(result.processor).toBe('native-pdf');
    expect(result.category).toBe('pdf');
    expect(result.apiSupport).toBe('document');
    expect(result.data).toBe(data);
    expect(result.metadata).toEqual({
      fileName: 'report.pdf',
      size: 1000,
      mimeType: 'application/pdf',
      commentId: 42,
    });
  });

  it('should return failure for an unsupported file type', async () => {
    const attachment = {
      content_type: 'application/octet-stream',
      file_name: 'file.xyz',
      size: 100,
    };

    const result = await DocumentHandler.route(attachment, Buffer.alloc(0));

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported file type');
    expect(result.suggestion).toBe(
      'Convert to PDF, TXT, or another supported format'
    );
  });

  it('should suggest "Split PDF or extract text" for oversized PDFs', async () => {
    const attachment = {
      content_type: 'application/pdf',
      file_name: 'huge.pdf',
      size: 100 * 1024 * 1024, // 100 MB, well over 32 MB limit
    };

    const result = await DocumentHandler.route(attachment, Buffer.alloc(0));

    expect(result.success).toBe(false);
    expect(result.error).toContain('File too large');
    expect(result.suggestion).toBe('Split PDF or extract text');
  });

  it('should suggest "Reduce file size" for oversized non-PDF files', async () => {
    const attachment = {
      content_type: 'image/png',
      file_name: 'huge.png',
      size: 100 * 1024 * 1024, // 100 MB, well over 20 MB limit
    };

    const result = await DocumentHandler.route(attachment, Buffer.alloc(0));

    expect(result.success).toBe(false);
    expect(result.error).toContain('File too large');
    expect(result.suggestion).toBe('Reduce file size');
  });
});

// ---------------------------------------------------------------------------
// prepareForAPI()
// ---------------------------------------------------------------------------
describe('DocumentHandler.prepareForAPI()', () => {
  it('should return a document block with base64 for PDF category', async () => {
    const data = Buffer.from('pdf-data');
    const result = await DocumentHandler.prepareForAPI(
      data,
      'application/pdf',
      'pdf'
    );

    expect(result.type).toBe('document');
    expect(result.source.type).toBe('base64');
    expect(result.source.media_type).toBe('application/pdf');
    expect(result.source.data).toBe(data.toString('base64'));
  });

  it('should return an image block with the correct media_type for image category', async () => {
    const data = Buffer.from('png-data');
    const result = await DocumentHandler.prepareForAPI(
      data,
      'image/png',
      'image'
    );

    expect(result.type).toBe('image');
    expect(result.source.type).toBe('base64');
    expect(result.source.media_type).toBe('image/png');
    expect(result.source.data).toBe(data.toString('base64'));
  });

  it('should return a text block with utf-8 string for text category', async () => {
    const data = Buffer.from('Hello, world!');
    const result = await DocumentHandler.prepareForAPI(
      data,
      'text/plain',
      'text'
    );

    expect(result.type).toBe('text');
    expect(result.text).toBe('Hello, world!');
  });

  it('should return a text block with utf-8 string for data category', async () => {
    const csvContent = 'col1,col2\na,b';
    const data = Buffer.from(csvContent);
    const result = await DocumentHandler.prepareForAPI(
      data,
      'text/csv',
      'data'
    );

    expect(result.type).toBe('text');
    expect(result.text).toBe(csvContent);
  });

  it('should call processOfficeDocument for office category with fileName', async () => {
    const data = Buffer.from('docx-content');
    const result = await DocumentHandler.prepareForAPI(
      data,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'office',
      'report.docx'
    );

    // convertToPDF was called via the mocked ConverterClient
    expect(mockConvertToPDF).toHaveBeenCalledWith(data, 'report.docx');

    // Should produce a document block from the converted PDF
    expect(result.type).toBe('document');
    expect(result.source.type).toBe('base64');
    expect(result.source.media_type).toBe('application/pdf');
    expect(result.source.data).toBe(Buffer.from('fake-pdf').toString('base64'));
    expect(result.metadata.originalFormat).toBe('docx');
    expect(result.metadata.converted).toBe(true);
    expect(result.metadata.size).toBe(8);
  });

  it('should return an error for office category without fileName', async () => {
    const data = Buffer.from('docx-content');
    const result = await DocumentHandler.prepareForAPI(
      data,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'office'
    );

    expect(result.type).toBe('error');
    expect(result.error).toBe(
      'File name required for Office document processing'
    );
  });

  it('should return requires_processing for an unknown category', async () => {
    const data = Buffer.from('data');
    const result = await DocumentHandler.prepareForAPI(
      data,
      'application/x-custom',
      'custom'
    );

    expect(result.type).toBe('requires_processing');
    expect(result.category).toBe('custom');
    expect(result.mimeType).toBe('application/x-custom');
  });
});

// ---------------------------------------------------------------------------
// processOfficeDocument()
// ---------------------------------------------------------------------------
describe('DocumentHandler.processOfficeDocument()', () => {
  it('should return a document block on successful conversion', async () => {
    const data = Buffer.from('office-data');
    const result = await DocumentHandler.processOfficeDocument(
      data,
      'report.docx'
    );

    expect(mockConvertToPDF).toHaveBeenCalledWith(data, 'report.docx');

    expect(result.type).toBe('document');
    expect(result.source.type).toBe('base64');
    expect(result.source.media_type).toBe('application/pdf');
    expect(result.source.data).toBe(Buffer.from('fake-pdf').toString('base64'));
    expect(result.metadata.originalFormat).toBe('docx');
    expect(result.metadata.converted).toBe(true);
    expect(result.metadata.size).toBe(8);
    expect(result.metadata.info).toContain('Converted to PDF');
  });

  it('should return an error object on conversion failure', async () => {
    mockConvertToPDF.mockResolvedValueOnce({
      success: false,
      error: 'Conversion timeout. The file may be too large or complex.',
      code: 'TIMEOUT',
    });

    const result = await DocumentHandler.processOfficeDocument(
      Buffer.from('data'),
      'big.xlsx'
    );

    expect(result.type).toBe('error');
    expect(result.error).toBe(
      'Conversion timeout. The file may be too large or complex.'
    );
    // No retryAfter for timeout errors
    expect(result.retryAfter).toBeUndefined();
  });

  it('should include retryAfter when rate-limited', async () => {
    mockConvertToPDF.mockResolvedValueOnce({
      success: false,
      error:
        'Rate limit exceeded (20 conversions per 5 minutes). Please wait before trying again.',
      retryAfter: 300,
      code: 'RATE_LIMIT',
    });

    const result = await DocumentHandler.processOfficeDocument(
      Buffer.from('data'),
      'doc.docx'
    );

    expect(result.type).toBe('error');
    expect(result.retryAfter).toBe(300);
    expect(result.code).toBe('RATE_LIMIT');
    expect(result.error).toContain('Rate limit exceeded');
  });
});
