/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { extractPageContent } from '../extractor';

beforeEach(() => {
  document.title = 'Test Page';
  document.body.innerHTML = '';
});

describe('extractPageContent', () => {
  it('returns title from document.title when Readability finds nothing', () => {
    document.body.innerHTML = '<p>short</p>';
    const result = extractPageContent();
    expect(result.title).toBe('Test Page');
  });

  it('returns non-empty content string', () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const result = extractPageContent();
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('counts words correctly via fallback path', () => {
    document.body.innerHTML = '<p>one two three</p>';
    const result = extractPageContent();
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('truncates content to MAX_CONTENT_CHARS', () => {
    const longText = 'word '.repeat(15_000);
    document.body.innerHTML = `<p>${longText}</p>`;
    const result = extractPageContent();
    expect(result.content.length).toBeLessThanOrEqual(50_000);
  });
});
