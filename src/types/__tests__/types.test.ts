import { describe, it, expect } from 'vitest';
import type { PageSummary, BulletPoint } from '../summary';
import type { ExtensionMessage } from '../messages';

describe('PageSummary', () => {
  it('accepts a valid summary object', () => {
    const bullet: BulletPoint = { text: 'Main point', emphasis: true };
    const summary: PageSummary = {
      title: 'Test Article',
      url: 'https://example.com/article',
      bullets: [bullet],
      keyInsights: ['Key takeaway'],
      readingTimeMinutes: 3,
      generatedAt: 1000000,
    };

    expect(summary.title).toBe('Test Article');
    expect(summary.bullets).toHaveLength(1);
    expect(summary.bullets[0]?.emphasis).toBe(true);
    expect(summary.keyInsights).toHaveLength(1);
    expect(summary.readingTimeMinutes).toBeGreaterThan(0);
  });
});

describe('ExtensionMessage discriminated union', () => {
  it('EXTRACT_CONTENT message has correct type literal', () => {
    const msg: ExtensionMessage = { type: 'EXTRACT_CONTENT' };
    expect(msg.type).toBe('EXTRACT_CONTENT');
  });

  it('SUMMARY_ERROR message carries an error string', () => {
    const msg: ExtensionMessage = { type: 'SUMMARY_ERROR', error: 'Network failure' };
    expect(msg.type).toBe('SUMMARY_ERROR');
    if (msg.type === 'SUMMARY_ERROR') {
      expect(msg.error).toBe('Network failure');
    }
  });

  it('EXTRACTED_CONTENT message carries wordCount', () => {
    const msg: ExtensionMessage = {
      type: 'EXTRACTED_CONTENT',
      content: 'Some page text',
      title: 'Test Page',
      wordCount: 3,
    };
    expect(msg.type).toBe('EXTRACTED_CONTENT');
    if (msg.type === 'EXTRACTED_CONTENT') {
      expect(msg.wordCount).toBe(3);
    }
  });
});
