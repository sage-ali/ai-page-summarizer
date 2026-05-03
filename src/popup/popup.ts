import type {
  ExtensionMessage,
  ExtractContentMessage,
  ExtractedContentMessage,
  RequestSummaryMessage,
  SummaryResultMessage,
  SummaryErrorMessage,
} from '@/types/messages';
import type { PageSummary } from '@/types/summary';
import { setTextContent, createTextElement, clearElement } from '@/utils/sanitizer';
import { getCachedSummary, cacheSummary } from '@/utils/storage';

// ---------------------------------------------------------------------------
// Element helper — throws at startup if markup is missing, so all later
// access is guaranteed non-null without repetitive null checks.
// ---------------------------------------------------------------------------

function getElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Required element #${id} not found in popup.html`);
  return el;
}

// ---------------------------------------------------------------------------
// View management
// ---------------------------------------------------------------------------

const VIEWS = ['view-idle', 'view-loading', 'view-result', 'view-error'] as const;
type ViewId = (typeof VIEWS)[number];

function showView(active: ViewId): void {
  for (const id of VIEWS) {
    getElement(id).hidden = id !== active;
  }
}

// ---------------------------------------------------------------------------
// Module-level state (reset on each summarise call)
// ---------------------------------------------------------------------------

let currentSummary: PageSummary | null = null;
let currentTabId: number | null = null;
let currentTabUrl: string = '';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', (): void => {
  void init();

  getElement('btn-summarize').addEventListener('click', (): void => {
    void summarizePage();
  });

  getElement('btn-reset').addEventListener('click', (): void => {
    currentSummary = null;
    showView('view-idle');
  });

  getElement('btn-retry').addEventListener('click', (): void => {
    void summarizePage();
  });

  getElement('btn-copy').addEventListener('click', (): void => {
    if (currentSummary !== null) {
      void copyToClipboard(currentSummary);
    }
  });
});

async function init(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab === undefined || tab.id === undefined) {
      showError('Could not access the active tab.');
      return;
    }

    currentTabId = tab.id;
    currentTabUrl = tab.url ?? tab.pendingUrl ?? '';

    setTextContent(getElement('page-title'), tab.title ?? 'Untitled page');
    showView('view-idle');
  } catch (err: unknown) {
    showError(err instanceof Error ? err.message : 'Failed to initialise.');
  }
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function summarizePage(): Promise<void> {
  if (currentTabId === null) {
    showError('No active tab found.');
    return;
  }

  showView('view-loading');

  try {
    const cached = await getCachedSummary(currentTabUrl);
    if (cached !== null) {
      currentSummary = cached;
      renderSummary(cached);
      return;
    }

    const extracted = await extractFromTab(currentTabId);
    const result = await requestSummary(extracted, currentTabUrl);

    if (result.type === 'SUMMARY_ERROR') {
      showError(result.error);
    } else {
      currentSummary = result.summary;
      await cacheSummary(currentTabUrl, result.summary);
      renderSummary(result.summary);
    }
  } catch (err: unknown) {
    showError(err instanceof Error ? err.message : 'Something went wrong.');
  }
}

async function extractFromTab(tabId: number): Promise<ExtractedContentMessage> {
  const msg: ExtractContentMessage = { type: 'EXTRACT_CONTENT' };
  let raw: unknown;

  try {
    raw = await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    throw new Error("This page can't be summarized. Try on a regular article or webpage.");
  }

  if (!isExtractedContentMessage(raw)) {
    throw new Error('Unexpected response from content script.');
  }

  return raw;
}

async function requestSummary(
  extracted: ExtractedContentMessage,
  url: string,
): Promise<SummaryResultMessage | SummaryErrorMessage> {
  const msg: RequestSummaryMessage = {
    type: 'REQUEST_SUMMARY',
    url,
    title: extracted.title,
    content: extracted.content,
    wordCount: extracted.wordCount,
  };

  const raw: unknown = await chrome.runtime.sendMessage(msg);

  if (isSummaryResultMessage(raw)) return raw;
  if (isSummaryErrorMessage(raw)) return raw;

  throw new Error('Unexpected response from service worker.');
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderSummary(summary: PageSummary): void {
  setTextContent(getElement('result-title'), summary.title);
  setTextContent(getElement('reading-time'), `~${summary.readingTimeMinutes} min read`);

  const bulletsList = getElement('bullets-list');
  clearElement(bulletsList);
  for (const bullet of summary.bullets) {
    const li = createTextElement('li', bullet.text);
    li.className = bullet.emphasis ? 'bullet-item emphasis' : 'bullet-item';
    bulletsList.appendChild(li);
  }

  const insightsList = getElement('insights-list');
  clearElement(insightsList);
  for (const insight of summary.keyInsights) {
    insightsList.appendChild(createTextElement('li', insight));
  }

  showView('view-result');
}

function showError(message: string): void {
  setTextContent(getElement('error-message'), message);
  showView('view-error');
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

async function copyToClipboard(summary: PageSummary): Promise<void> {
  const lines = [
    summary.title,
    '',
    ...summary.bullets.map((b) => `• ${b.text}`),
    '',
    'Key insights:',
    ...summary.keyInsights.map((i) => `• ${i}`),
    '',
    `Reading time: ~${summary.readingTimeMinutes} min`,
  ];

  const btn = getElement('btn-copy');

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    setTextContent(btn, 'Copied!');
  } catch {
    setTextContent(btn, 'Copy failed');
  } finally {
    setTimeout((): void => {
      setTextContent(btn, 'Copy summary');
    }, 2000);
  }
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}

function isExtractedContentMessage(value: unknown): value is ExtractedContentMessage {
  return isExtensionMessage(value) && value.type === 'EXTRACTED_CONTENT';
}

function isSummaryResultMessage(value: unknown): value is SummaryResultMessage {
  return isExtensionMessage(value) && value.type === 'SUMMARY_RESULT';
}

function isSummaryErrorMessage(value: unknown): value is SummaryErrorMessage {
  return isExtensionMessage(value) && value.type === 'SUMMARY_ERROR';
}
