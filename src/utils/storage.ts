import type { PageSummary, BulletPoint } from '@/types/summary';

const STORAGE_KEY_PREFIX = 'summary:';
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000 * 5; // 5 days

function storageKey(url: string): string {
  return `${STORAGE_KEY_PREFIX}${url}`;
}

export async function getCachedSummary(url: string): Promise<PageSummary | null> {
  const key = storageKey(url);
  const result: Record<string, unknown> = await chrome.storage.local.get(key);
  const raw: unknown = result[key];

  if (!isPageSummary(raw)) return null;

  const ageMs = Date.now() - raw.generatedAt;
  if (ageMs > MAX_CACHE_AGE_MS) {
    void chrome.storage.local.remove(key);
    return null;
  }

  return raw;
}

export async function cacheSummary(url: string, summary: PageSummary): Promise<void> {
  await chrome.storage.local.set({ [storageKey(url)]: summary });
}

// Type guard — validates the full PageSummary shape read back from storage

function isPageSummary(value: unknown): value is PageSummary {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('title' in value) ||
    !('url' in value) ||
    !('bullets' in value) ||
    !('keyInsights' in value) ||
    !('readingTimeMinutes' in value) ||
    !('generatedAt' in value)
  ) {
    return false;
  }

  return (
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
    typeof value.readingTimeMinutes === 'number' &&
    typeof value.generatedAt === 'number' &&
    Array.isArray(value.bullets) &&
    value.bullets.every(isBulletPoint) &&
    Array.isArray(value.keyInsights) &&
    value.keyInsights.every((i: unknown): i is string => typeof i === 'string')
  );
}

function isBulletPoint(value: unknown): value is BulletPoint {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    'emphasis' in value &&
    typeof value.text === 'string' &&
    typeof value.emphasis === 'boolean'
  );
}
