import { extractPageContent } from '@/utils/extractor';
import type { ExtensionMessage, ExtractedContentMessage } from '@/types/messages';

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse): true => {
  if (!isExtensionMessage(message) || message.type !== 'EXTRACT_CONTENT') {
    return true;
  }

  const extracted = extractPageContent();

  const response: ExtractedContentMessage = {
    type: 'EXTRACTED_CONTENT',
    title: extracted.title,
    content: extracted.content,
    wordCount: extracted.wordCount,
  };

  sendResponse(response);
  return true;
});

function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}
