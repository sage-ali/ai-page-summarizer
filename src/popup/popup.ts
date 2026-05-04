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

function setLoadingText(text: string): void {
  setTextContent(getElement('loading-text'), text);
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme === 'dark' ? 'dark' : '';
  setTextContent(getElement('btn-theme'), theme === 'dark' ? '◐' : '◑');
}

async function loadTheme(): Promise<void> {
  try {
    const result: Record<string, unknown> = await chrome.storage.local.get('theme');
    const stored = result['theme'];
    applyTheme(stored === 'dark' ? 'dark' : 'light');
  } catch {
    applyTheme('light');
  }
}

async function toggleTheme(): Promise<void> {
  const next: Theme = document.documentElement.dataset['theme'] === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    await chrome.storage.local.set({ theme: next });
  } catch {
    // Theme preference not persisted — not critical
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

  getElement('btn-theme').addEventListener('click', (): void => {
    void toggleTheme();
  });
});

async function init(): Promise<void> {
  try {
    await loadTheme();

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

  setLoadingText('Extracting content…');
  showView('view-loading');

  try {
    const cached = await getCachedSummary(currentTabUrl);
    if (cached !== null) {
      currentSummary = cached;
      renderSummary(cached, true);
      return;
    }

    const extracted = await extractFromTab(currentTabId);

    setLoadingText('Generating AI summary…');

    const result = await requestSummary(extracted, currentTabUrl);

    if (result.type === 'SUMMARY_ERROR') {
      showError(result.error);
    } else {
      currentSummary = result.summary;
      void cacheSummary(currentTabUrl, result.summary);
      renderSummary(result.summary, false);
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

function renderSummary(summary: PageSummary, fromCache: boolean): void {
  setTextContent(getElement('result-title'), summary.title);
  setTextContent(getElement('reading-time'), `~${summary.readingTimeMinutes} min read`);
  setTextContent(getElement('word-count'), `${summary.wordCount.toLocaleString()} words`);

  const cacheBadge = getElement('cache-badge');
  if (fromCache) {
    setTextContent(cacheBadge, `Cached · ${formatAge(summary.generatedAt)}`);
    cacheBadge.hidden = false;
  } else {
    cacheBadge.hidden = true;
  }

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

function formatAge(generatedAt: number): string {
  const minutes = Math.floor((Date.now() - generatedAt) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
    `Reading time: ~${summary.readingTimeMinutes} min · ${summary.wordCount.toLocaleString()} words`,
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
