import { Readability } from '@mozilla/readability';

const MAX_CONTENT_CHARS = 50_000;

export interface ExtractedPage {
  title: string;
  content: string;
  wordCount: number;
}

export function extractPageContent(): ExtractedPage {
  // Readability mutates the document during parsing — clone first.
  const docClone = document.cloneNode(true) as Document;
  const reader = new Readability(docClone);
  const article = reader.parse();

  if (article !== null && (article.textContent ?? '').trim().length > 100) {
    const text = normalise(article.textContent ?? '');
    return {
      title: (article.title ?? '').trim() || document.title,
      content: text.slice(0, MAX_CONTENT_CHARS),
      wordCount: countWords(text),
    };
  }

  return extractFallback();
}

function extractFallback(): ExtractedPage {
  const text = normalise(getBodyText());
  return {
    title: document.title,
    content: text.slice(0, MAX_CONTENT_CHARS),
    wordCount: countWords(text),
  };
}

// innerText is layout-aware and unavailable in test environments — textContent is sufficient.
function getBodyText(): string {
  return document.body?.textContent ?? '';
}

function normalise(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  return text.split(' ').filter((w) => w.length > 0).length;
}
