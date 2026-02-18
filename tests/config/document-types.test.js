import { describe, it, expect } from 'vitest';
import {
  isBlocked,
  validateBatch,
  getRecommendation,
  SUPPORTED_DOCUMENT_TYPES,
  BLOCKED_TYPES
} from '../../src/config/document-types.js';

const MB = 1024 * 1024;

describe('isBlocked()', () => {
  describe('blocked extensions', () => {
    it('blocks .exe as executables', () => {
      const result = isBlocked(null, 'malware.exe');
      expect(result).toEqual({
        blocked: true,
        category: 'executables',
        reason: 'Executable files are blocked for security'
      });
    });

    it('blocks .bat as executables', () => {
      const result = isBlocked(null, 'script.bat');
      expect(result).toEqual({
        blocked: true,
        category: 'executables',
        reason: 'Executable files are blocked for security'
      });
    });

    it('blocks .js as scripts', () => {
      const result = isBlocked(null, 'code.js');
      expect(result).toEqual({
        blocked: true,
        category: 'scripts',
        reason: 'Script files are blocked for security'
      });
    });

    it('blocks .zip as archives', () => {
      const result = isBlocked(null, 'archive.zip');
      expect(result).toEqual({
        blocked: true,
        category: 'archives',
        reason: 'Archive files must be extracted before analysis'
      });
    });

    it('blocks .xlsm as macros', () => {
      const result = isBlocked(null, 'spreadsheet.xlsm');
      expect(result).toEqual({
        blocked: true,
        category: 'macros',
        reason: 'Macro-enabled documents are blocked for security'
      });
    });
  });

  describe('blocked MIME types', () => {
    it('blocks application/x-msdownload', () => {
      const result = isBlocked('application/x-msdownload', 'file.bin');
      expect(result).toEqual({
        blocked: true,
        category: 'executables',
        reason: 'Executable files are blocked for security'
      });
    });

    it('blocks application/x-javascript', () => {
      const result = isBlocked('application/x-javascript', 'file.txt');
      expect(result).toEqual({
        blocked: true,
        category: 'scripts',
        reason: 'Script files are blocked for security'
      });
    });

    it('blocks application/zip', () => {
      const result = isBlocked('application/zip', 'file.dat');
      expect(result).toEqual({
        blocked: true,
        category: 'archives',
        reason: 'Archive files must be extracted before analysis'
      });
    });
  });

  describe('allowed files', () => {
    it('allows .pdf files', () => {
      const result = isBlocked('application/pdf', 'document.pdf');
      expect(result).toBeNull();
    });

    it('allows .docx files', () => {
      const result = isBlocked(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'report.docx'
      );
      expect(result).toBeNull();
    });

    it('allows .txt files', () => {
      const result = isBlocked('text/plain', 'notes.txt');
      expect(result).toBeNull();
    });
  });

  describe('null/undefined handling', () => {
    it('blocks when mimeType is null but extension is blocked', () => {
      const result = isBlocked(null, 'virus.exe');
      expect(result).not.toBeNull();
      expect(result.blocked).toBe(true);
      expect(result.category).toBe('executables');
    });

    it('blocks when mimeType is undefined but extension is blocked', () => {
      const result = isBlocked(undefined, 'script.py');
      expect(result).not.toBeNull();
      expect(result.blocked).toBe(true);
      expect(result.category).toBe('scripts');
    });

    it('blocks when fileName is null but MIME type is blocked', () => {
      const result = isBlocked('application/x-msdownload', null);
      expect(result).not.toBeNull();
      expect(result.blocked).toBe(true);
      expect(result.category).toBe('executables');
    });

    it('blocks when fileName is undefined but MIME type is blocked', () => {
      const result = isBlocked('application/zip', undefined);
      expect(result).not.toBeNull();
      expect(result.blocked).toBe(true);
      expect(result.category).toBe('archives');
    });

    it('returns null when both mimeType and fileName are null', () => {
      const result = isBlocked(null, null);
      expect(result).toBeNull();
    });

    it('returns null when both mimeType and fileName are undefined', () => {
      const result = isBlocked(undefined, undefined);
      expect(result).toBeNull();
    });
  });
});

describe('validateBatch()', () => {
  describe('mixed batch classification', () => {
    it('sorts attachments into correct buckets', () => {
      const attachments = [
        {
          file_name: 'report.pdf',
          content_type: 'application/pdf',
          size: 5 * MB
        },
        {
          file_name: 'malware.exe',
          content_type: 'application/x-msdownload',
          size: 1 * MB
        },
        {
          file_name: 'design.psd',
          content_type: 'application/photoshop',
          size: 2 * MB
        },
        {
          file_name: 'huge.pdf',
          content_type: 'application/pdf',
          size: 33 * MB
        }
      ];

      const results = validateBatch(attachments);

      expect(results.valid).toHaveLength(1);
      expect(results.valid[0].file_name).toBe('report.pdf');

      expect(results.blocked).toHaveLength(1);
      expect(results.blocked[0].file_name).toBe('malware.exe');

      expect(results.unsupported).toHaveLength(1);
      expect(results.unsupported[0].file_name).toBe('design.psd');

      expect(results.tooLarge).toHaveLength(1);
      expect(results.tooLarge[0].file_name).toBe('huge.pdf');
    });
  });

  describe('empty batch', () => {
    it('returns empty arrays and totalSize 0', () => {
      const results = validateBatch([]);

      expect(results.valid).toEqual([]);
      expect(results.blocked).toEqual([]);
      expect(results.unsupported).toEqual([]);
      expect(results.tooLarge).toEqual([]);
      expect(results.totalSize).toBe(0);
    });
  });

  describe('inline images with null size', () => {
    it('passes validation when size is null', () => {
      const attachments = [
        {
          file_name: 'inline.png',
          content_type: 'image/png',
          size: null
        }
      ];

      const results = validateBatch(attachments);

      // null <= maxSize evaluates to true, so it should be valid
      expect(results.valid).toHaveLength(1);
      expect(results.tooLarge).toHaveLength(0);
    });
  });

  describe('totalSize accumulation', () => {
    it('accumulates totalSize correctly for multiple valid files', () => {
      const attachments = [
        {
          file_name: 'doc1.pdf',
          content_type: 'application/pdf',
          size: 3 * MB
        },
        {
          file_name: 'doc2.pdf',
          content_type: 'application/pdf',
          size: 7 * MB
        },
        {
          file_name: 'photo.png',
          content_type: 'image/png',
          size: 2 * MB
        }
      ];

      const results = validateBatch(attachments);

      expect(results.valid).toHaveLength(3);
      expect(results.totalSize).toBe(12 * MB);
    });
  });

  describe('blocked files include reason', () => {
    it('includes the block reason on blocked attachments', () => {
      const attachments = [
        {
          file_name: 'payload.exe',
          content_type: 'application/x-msdownload',
          size: 1 * MB
        },
        {
          file_name: 'data.zip',
          content_type: 'application/zip',
          size: 5 * MB
        }
      ];

      const results = validateBatch(attachments);

      expect(results.blocked).toHaveLength(2);
      expect(results.blocked[0].reason).toBe('Executable files are blocked for security');
      expect(results.blocked[1].reason).toBe('Archive files must be extracted before analysis');
    });
  });

  describe('unsupported files include recommendation', () => {
    it('includes a recommendation on unsupported attachments', () => {
      const attachments = [
        {
          file_name: 'presentation.pages',
          content_type: 'application/vnd.apple.pages',
          size: 2 * MB
        },
        {
          file_name: 'unknown.xyz',
          content_type: 'application/octet-stream',
          size: 1 * MB
        }
      ];

      const results = validateBatch(attachments);

      expect(results.unsupported).toHaveLength(2);
      expect(results.unsupported[0].recommendation).toBe(
        'Export Pages document to PDF or DOCX'
      );
      expect(results.unsupported[1].recommendation).toBe(
        'Convert to PDF, TXT, DOCX, or another supported format'
      );
    });
  });

  describe('tooLarge files include human-readable sizes', () => {
    it('includes humanSize and humanMaxSize on too-large attachments', () => {
      const attachments = [
        {
          file_name: 'massive.pdf',
          content_type: 'application/pdf',
          size: 35 * MB
        }
      ];

      const results = validateBatch(attachments);

      expect(results.tooLarge).toHaveLength(1);
      expect(results.tooLarge[0].maxSize).toBe(32 * MB);
      expect(results.tooLarge[0].humanSize).toBe('35.00MB');
      expect(results.tooLarge[0].humanMaxSize).toBe('32.00MB');
    });
  });
});

describe('getRecommendation()', () => {
  describe('known types', () => {
    it('returns Pages recommendation for application/vnd.apple.pages', () => {
      const result = getRecommendation('application/vnd.apple.pages', 'doc.pages');
      expect(result).toBe('Export Pages document to PDF or DOCX');
    });

    it('returns video recommendation for video/mp4 (partial match on "video/")', () => {
      const result = getRecommendation('video/mp4', 'clip.mp4');
      expect(result).toBe('Extract audio transcript or key frames as images');
    });

    it('returns audio recommendation for audio/mpeg (partial match on "audio/")', () => {
      const result = getRecommendation('audio/mpeg', 'track.mp3');
      expect(result).toBe('Provide transcript or convert to text');
    });
  });

  describe('unknown and null types', () => {
    it('returns generic recommendation for unknown MIME type', () => {
      const result = getRecommendation('application/octet-stream', 'file.bin');
      expect(result).toBe('Convert to PDF, TXT, DOCX, or another supported format');
    });

    it('returns generic recommendation when mimeType is null', () => {
      const result = getRecommendation(null, 'file.xyz');
      expect(result).toBe('Convert to PDF, TXT, DOCX, or another supported format');
    });

    it('returns generic recommendation when mimeType is undefined', () => {
      const result = getRecommendation(undefined, 'file.xyz');
      expect(result).toBe('Convert to PDF, TXT, DOCX, or another supported format');
    });
  });
});
