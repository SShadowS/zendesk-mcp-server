import { describe, it, expect, vi } from 'vitest';

// Mock dependencies that TicketsMixin imports at module level
vi.mock('../../src/utils/errors.js', () => ({
  classifyError: vi.fn(e => e)
}));
vi.mock('../../src/utils/retry.js', () => ({
  withRetry: vi.fn((fn) => fn()),
  RetryProfiles: { conservative: {} }
}));
vi.mock('axios', () => ({ default: vi.fn() }));

import { TicketsMixin } from '../../src/zendesk-client/tickets.js';

// Create a minimal base class and apply the mixin
class MockBase {}
const TestClass = TicketsMixin(MockBase);
const instance = new TestClass();

describe('extractInlineImages', () => {
  const commentId = 12345;
  const authorId = 67890;

  describe('standard img tags', () => {
    it('extracts URL, fileName, and content_type from a standard img with double quotes', () => {
      const html = '<img src="https://example.com/image.png">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result).toHaveLength(1);
      expect(result[0].content_url).toBe('https://example.com/image.png');
      expect(result[0].file_name).toBe('image.png');
      expect(result[0].content_type).toBe('image/png');
    });

    it('extracts URL from a standard img with single quotes', () => {
      const html = "<img src='https://example.com/photo.jpg'>";
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result).toHaveLength(1);
      expect(result[0].content_url).toBe('https://example.com/photo.jpg');
      expect(result[0].file_name).toBe('photo.jpg');
      expect(result[0].content_type).toBe('image/jpeg');
    });

    it('handles img tags with additional attributes', () => {
      const html = '<img alt="A photo" src="https://example.com/pic.gif" width="100">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result).toHaveLength(1);
      expect(result[0].content_url).toBe('https://example.com/pic.gif');
      expect(result[0].file_name).toBe('pic.gif');
      expect(result[0].content_type).toBe('image/gif');
    });
  });

  describe('protocol-relative URLs', () => {
    it('normalizes protocol-relative URLs to https', () => {
      const html = '<img src="//cdn.example.com/img.png">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result).toHaveLength(1);
      expect(result[0].content_url).toBe('https://cdn.example.com/img.png');
      expect(result[0].file_name).toBe('img.png');
      expect(result[0].content_type).toBe('image/png');
    });
  });

  describe('data URIs (should be skipped)', () => {
    it('skips data: URIs and returns empty array', () => {
      const html = '<img src="data:image/png;base64,abc123">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result).toEqual([]);
    });
  });

  describe('relative URLs (should be skipped)', () => {
    it('skips absolute-path relative URLs like /images/photo.jpg', () => {
      const html = '<img src="/images/photo.jpg">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result).toEqual([]);
    });

    it('skips bare relative URLs like photo.jpg', () => {
      const html = '<img src="photo.jpg">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result).toEqual([]);
    });
  });

  describe('multiple images in one body', () => {
    it('returns array with correct count and sequential indexes', () => {
      const html = `
        <p>Here are some images:</p>
        <img src="https://example.com/first.png">
        <img src="https://example.com/second.jpg">
        <img src="https://example.com/third.gif">
      `;
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result).toHaveLength(3);

      expect(result[0].id).toBe(`inline_${commentId}_0`);
      expect(result[0].content_url).toBe('https://example.com/first.png');
      expect(result[0].file_name).toBe('first.png');

      expect(result[1].id).toBe(`inline_${commentId}_1`);
      expect(result[1].content_url).toBe('https://example.com/second.jpg');
      expect(result[1].file_name).toBe('second.jpg');

      expect(result[2].id).toBe(`inline_${commentId}_2`);
      expect(result[2].content_url).toBe('https://example.com/third.gif');
      expect(result[2].file_name).toBe('third.gif');
    });

    it('only increments index for valid images, skipping data URIs', () => {
      const html = `
        <img src="https://example.com/valid1.png">
        <img src="data:image/png;base64,abc123">
        <img src="https://example.com/valid2.jpg">
      `;
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(`inline_${commentId}_0`);
      expect(result[0].file_name).toBe('valid1.png');
      expect(result[1].id).toBe(`inline_${commentId}_1`);
      expect(result[1].file_name).toBe('valid2.jpg');
    });
  });

  describe('no images in body', () => {
    it('returns empty array for HTML without img tags', () => {
      const html = '<p>Hello world</p>';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      const result = instance.extractInlineImages('', commentId, authorId);

      expect(result).toEqual([]);
    });
  });

  describe('extension-to-MIME mapping', () => {
    it('maps .png to image/png', () => {
      const html = '<img src="https://example.com/file.png">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].content_type).toBe('image/png');
    });

    it('maps .jpg to image/jpeg', () => {
      const html = '<img src="https://example.com/file.jpg">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].content_type).toBe('image/jpeg');
    });

    it('maps .jpeg to image/jpeg', () => {
      const html = '<img src="https://example.com/file.jpeg">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].content_type).toBe('image/jpeg');
    });

    it('maps .gif to image/gif', () => {
      const html = '<img src="https://example.com/file.gif">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].content_type).toBe('image/gif');
    });

    it('maps .webp to image/webp', () => {
      const html = '<img src="https://example.com/file.webp">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].content_type).toBe('image/webp');
    });

    it('maps .svg to image/svg+xml', () => {
      const html = '<img src="https://example.com/file.svg">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].content_type).toBe('image/svg+xml');
    });

    it('maps .bmp to image/bmp', () => {
      const html = '<img src="https://example.com/file.bmp">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].content_type).toBe('image/bmp');
    });

    it('defaults to image/png for URLs without an extension', () => {
      const html = '<img src="https://example.com/image">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].content_type).toBe('image/png');
      expect(result[0].file_name).toBe('inline_image_1');
    });

    it('defaults to image/png for unknown extensions', () => {
      const html = '<img src="https://example.com/file.xyz">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].content_type).toBe('image/png');
    });
  });

  describe('result structure and common fields', () => {
    it('always sets is_inline to true', () => {
      const html = '<img src="https://example.com/photo.png">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].is_inline).toBe(true);
    });

    it('always sets size to null', () => {
      const html = '<img src="https://example.com/photo.png">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].size).toBeNull();
    });

    it('sets the correct comment_id', () => {
      const html = '<img src="https://example.com/photo.png">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].comment_id).toBe(commentId);
    });

    it('sets the correct comment_author', () => {
      const html = '<img src="https://example.com/photo.png">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].comment_author).toBe(authorId);
    });

    it('constructs id as inline_${commentId}_${index}', () => {
      const html = '<img src="https://example.com/photo.png">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].id).toBe(`inline_${commentId}_0`);
    });

    it('returns all expected fields on each result object', () => {
      const html = '<img src="https://example.com/photo.png">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0]).toEqual({
        id: `inline_${commentId}_0`,
        file_name: 'photo.png',
        content_type: 'image/png',
        content_url: 'https://example.com/photo.png',
        comment_id: commentId,
        comment_author: authorId,
        is_inline: true,
        size: null
      });
    });
  });

  describe('URL parsing edge cases', () => {
    it('extracts filename from a URL with query parameters', () => {
      const html = '<img src="https://example.com/path/image.jpg?width=100&height=200">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].file_name).toBe('image.jpg');
      expect(result[0].content_type).toBe('image/jpeg');
    });

    it('extracts filename from a URL with a fragment', () => {
      const html = '<img src="https://example.com/path/image.webp#section">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].file_name).toBe('image.webp');
      expect(result[0].content_type).toBe('image/webp');
    });

    it('extracts filename from a deeply nested path', () => {
      const html = '<img src="https://cdn.example.com/assets/2024/01/uploads/banner.png">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].file_name).toBe('banner.png');
      expect(result[0].content_type).toBe('image/png');
    });

    it('handles HTTPS URLs correctly', () => {
      const html = '<img src="https://secure.example.com/logo.svg">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].content_url).toBe('https://secure.example.com/logo.svg');
      expect(result[0].content_type).toBe('image/svg+xml');
    });

    it('handles HTTP URLs correctly', () => {
      const html = '<img src="http://example.com/logo.png">';
      const result = instance.extractInlineImages(html, commentId, authorId);

      expect(result[0].content_url).toBe('http://example.com/logo.png');
      expect(result[0].content_type).toBe('image/png');
    });
  });
});
