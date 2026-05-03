import type { ExtensionMessage, SummaryResultMessage, SummaryErrorMessage } from '@/types/messages';
import type { GeminiRequest, GeminiResponse, AISummaryOutput } from '@/types/api';
import type { PageSummary } from '@/types/summary';

const GEMINI_API_KEY: string = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Message listener

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse): boolean => {
  if (!isExtensionMessage(message) || message.type !== 'REQUEST_SUMMARY') {
    return false;
  }

  // Return true before the async work starts to keep the message port open.
  void handleSummaryRequest(message.url, message.title, message.content, message.wordCount)
    .then(sendResponse)
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : 'Unexpected error.';
      const response: SummaryErrorMessage = { type: 'SUMMARY_ERROR', error };
      sendResponse(response);
    });

  return true;
});

// Core handler

async function handleSummaryRequest(
  url: string,
  title: string,
  content: string,
  wordCount: number,
): Promise<SummaryResultMessage | SummaryErrorMessage> {
  if (GEMINI_API_KEY.length === 0) {
    return {
      type: 'SUMMARY_ERROR',
      error: 'API key not configured. Add VITE_GEMINI_API_KEY to your .env file.',
    };
  }

  try {
    const output = await callGemini(content);

    const summary: PageSummary = {
      title,
      url,
      bullets: output.bullets,
      keyInsights: output.keyInsights,
      readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 238)),
      generatedAt: Date.now(),
    };

    return { type: 'SUMMARY_RESULT', summary };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Failed to generate summary.';
    return { type: 'SUMMARY_ERROR', error };
  }
}

// Gemini API call

async function callGemini(content: string): Promise<AISummaryOutput> {
  try {
    return await callGeminiOnce(content);
  } catch {
    await sleep(1000);
    return callGeminiOnce(content);
  }
}

async function callGeminiOnce(content: string): Promise<AISummaryOutput> {
  const request: GeminiRequest = {
    systemInstruction: {
      parts: [
        {
          text: 'You summarize web articles. Always respond with valid JSON only — no markdown, no code fences.',
        },
      ],
    },
    contents: [{ parts: [{ text: buildPrompt(content) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  };

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new Error(geminiHttpError(res.status));
  }

  const data: unknown = await res.json();

  if (!isGeminiResponse(data)) {
    throw new Error('Unexpected response structure from Gemini API.');
  }

  const rawText = data.candidates[0]?.content.parts[0]?.text;
  if (rawText === undefined || rawText.length === 0) {
    throw new Error('Gemini returned an empty response.');
  }

  const parsed: unknown = JSON.parse(rawText);

  if (!isAISummaryOutput(parsed)) {
    throw new Error('AI response did not match the expected summary structure.');
  }

  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiHttpError(status: number): string {
  if (status === 401 || status === 403)
    return 'API key is invalid or unauthorized. Check your .env file.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'Gemini API is temporarily unavailable. Please try again later.';
  return `Failed to reach Gemini API (status ${status.toString()}). Please try again.`;
}

function buildPrompt(content: string): string {
  return `Analyze the following webpage content and return a JSON object with this exact shape:
{
  "bullets": [{ "text": "...", "emphasis": true | false }],
  "keyInsights": ["...", "..."]
}
Rules:
- bullets: 5–7 concise bullet points. Set emphasis: true on the 1–2 most important ones only.
- keyInsights: exactly 2–3 key takeaways worth remembering.
- No extra fields. No markdown. No explanation. Valid JSON only.

Content:
${content}`;
}

// Type guards

function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}

function isGeminiResponse(value: unknown): value is GeminiResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'candidates' in value &&
    Array.isArray(value.candidates)
  );
}

function isAISummaryOutput(value: unknown): value is AISummaryOutput {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('bullets' in value) ||
    !('keyInsights' in value)
  ) {
    return false;
  }

  return (
    Array.isArray(value.bullets) &&
    value.bullets.every(isBulletPoint) &&
    Array.isArray(value.keyInsights) &&
    value.keyInsights.every((i: unknown): i is string => typeof i === 'string')
  );
}

function isBulletPoint(value: unknown): value is { text: string; emphasis: boolean } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    'emphasis' in value &&
    typeof value.text === 'string' &&
    typeof value.emphasis === 'boolean'
  );
}
