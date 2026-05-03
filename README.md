# AI Page Summarizer — Chrome Extension

A Manifest V3 Chrome extension that extracts the main content from any webpage and uses the Gemini 1.5 Flash API to generate a structured, readable summary — complete with bullet points, key insights, estimated reading time, and word count.

---

## Features

- One-click summary of any article or webpage
- Bullet-point summary with emphasis on the most important points
- Key insights section (2–3 takeaways)
- Estimated reading time and word count
- 5-day summary cache per URL — no duplicate API calls
- Dark/light mode toggle, persisted across sessions
- Copy summary to clipboard
- Full error handling: unsummarisable pages, API errors, rate limits

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- A [Gemini API key](https://aistudio.google.com/app/apikey) (free tier is sufficient)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd ai-page-summarizer
pnpm install
```

### 2. Add your API key

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder:

```
VITE_GEMINI_API_KEY=your_actual_key_here
```

The key is embedded into the service worker bundle **at build time only** — it is never accessible from the popup or content script.

### 3. Build

```bash
pnpm build
```

This compiles everything to `dist/`.

For development with hot reload:

```bash
pnpm dev
```

---

## Installing in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder inside this project

The extension icon (blue document) will appear in your toolbar. Pin it for easy access.

### After code changes (dev mode)

When using `pnpm dev`, Vite watches for changes and rebuilds automatically. After a rebuild:

1. Go to `chrome://extensions`
2. Click the **refresh** icon on the AI Page Summarizer card

For service worker changes, you may also need to click **"Service Worker"** → **"Stop"** then reload.

---

## Testing the Extension

### On a real article

1. Navigate to any news article or blog post (e.g. a BBC, Wikipedia, or Medium page)
2. Click the AI Page Summarizer icon in your toolbar
3. Click **Summarize this page**
4. The extension will:
   - Show "Extracting content…" while reading the page
   - Show "Generating AI summary…" while calling Gemini
   - Display the structured summary

### Testing the cache

1. Summarize a page
2. Close and reopen the popup on the same page
3. Click **Summarize this page** again — it resolves instantly and shows a **"Cached · Xm ago"** badge

### Testing error states

| Scenario            | How to reproduce                           | Expected result                   |
| ------------------- | ------------------------------------------ | --------------------------------- |
| Unsummarisable page | Open `chrome://extensions`, click the icon | "This page can't be summarized."  |
| No API key          | Build without `.env`, reload extension     | "API key not configured."         |
| Rate limited        | Summarize many pages quickly               | "Too many requests. Please wait…" |

### Running unit tests

```bash
pnpm test
```

Tests cover the type definitions and content extraction logic using Vitest + jsdom.

---

## Architecture

The extension uses three isolated execution contexts that communicate only through typed message passing:

```
┌─────────────────┐   chrome.tabs.sendMessage   ┌──────────────────────────┐
│     Popup       │ ──────────────────────────► │    Content Script        │
│  (popup.ts)     │ ◄────────────────────────── │  (content-script.ts)     │
│                 │                              │  Runs inside the page    │
│  Orchestrates   │                              │  Reads the DOM           │
│  all user flow  │                              │  No API access           │
└────────┬────────┘                              └──────────────────────────┘
         │
         │ chrome.runtime.sendMessage
         ▼
┌──────────────────────────┐
│    Service Worker        │
│  (service-worker.ts)     │
│  Runs in the background  │
│  Holds the API key       │
│  Makes all AI calls      │
└──────────────────────────┘
```

### File structure

```
src/
├── types/
│   ├── messages.ts       # All Chrome message types (discriminated unions)
│   ├── summary.ts        # PageSummary and BulletPoint interfaces
│   └── api.ts            # Gemini request/response types
│
├── background/
│   └── service-worker.ts # Receives REQUEST_SUMMARY, calls Gemini, returns result
│
├── content/
│   └── content-script.ts # Receives EXTRACT_CONTENT, returns EXTRACTED_CONTENT
│
├── popup/
│   ├── popup.html        # Four views: idle, loading, result, error
│   ├── popup.ts          # View management, theme, rendering, clipboard
│   └── popup.css         # CSS custom properties, dark mode, responsive layout
│
└── utils/
    ├── extractor.ts      # Mozilla Readability extraction with plain-text fallback
    ├── sanitizer.ts      # All DOM writes via textContent — no innerHTML
    └── storage.ts        # chrome.storage.local wrapper with shape validation
```

### Message flow for a summary request

```
Popup                     Content Script             Service Worker
  │                             │                          │
  │── EXTRACT_CONTENT ─────────►│                          │
  │◄─ EXTRACTED_CONTENT ────────│                          │
  │                             │                          │
  │── REQUEST_SUMMARY ──────────────────────────────────►  │
  │                             │                    calls Gemini API
  │◄─ SUMMARY_RESULT / SUMMARY_ERROR ────────────────────  │
```

---

## AI Integration

**Provider:** Google Gemini 1.5 Flash  
**Endpoint:** `generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`

The service worker sends the extracted page text to Gemini with a structured prompt that requests a specific JSON shape:

```json
{
  "bullets": [{ "text": "...", "emphasis": true }],
  "keyInsights": ["...", "..."]
}
```

The response is validated with a runtime type guard before being used — the extension never trusts the raw AI output.

**Retry policy:** One automatic retry after 1 second on any network or server error. If both attempts fail, a human-readable error message is shown.

**Key is build-time only:** Vite replaces `import.meta.env.VITE_GEMINI_API_KEY` at compile time. The key exists only in the service worker bundle, not in the popup or content script. It is never sent to any server other than Google's API endpoint.

---

## Security Decisions

| Decision                                        | Reason                                                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API key in service worker only                  | Content scripts run in the page context — a malicious page could theoretically read variables accessible there. The service worker has no DOM and cannot be inspected by web pages. |
| `sender.id` validation on all incoming messages | Prevents other browser extensions from sending crafted messages to our service worker and consuming Gemini quota.                                                                   |
| All DOM writes via `sanitizer.ts`               | No `innerHTML` anywhere in production code. All text from the AI goes through `element.textContent`, which is always safe.                                                          |
| `chrome.storage` values re-validated on read    | Stored data could be from an older schema. The `isPageSummary` type guard re-checks every field before trusting it.                                                                 |
| Minimal permissions                             | Only `activeTab` (needed for `chrome.tabs.sendMessage`) and `storage` (needed for caching). No `tabs`, `history`, `cookies`, or `scripting`.                                        |
| No `externally_connectable`                     | The extension does not declare any external origins, so web pages cannot send messages into the service worker at all.                                                              |

---

## Trade-offs

**Gemini 1.5 Flash vs a larger model**  
Flash is fast (under 3 seconds on most pages) and free within generous rate limits. A larger model like Gemini 1.5 Pro would produce better summaries on complex technical content but at higher latency and cost. Flash is the right default for a general-purpose summariser.

**Client-side extraction vs server-side**  
All content extraction runs in the content script — no page content ever leaves the browser except for what is sent to Gemini. This improves privacy and removes the need for a proxy server, at the cost of being unable to summarise pages that block or throttle JavaScript.

**Build-time API key vs runtime fetch from a proxy**  
Embedding the key at build time is simpler and works without a backend, but it means each user needs their own key. A production version would proxy requests through a server so the key is never in the extension bundle at all.

**Readability + fallback extraction**  
Mozilla's Readability library (which powers Firefox Reader Mode) handles most articles cleanly. For pages it cannot parse, the extension falls back to `document.body.textContent`. This means pages with minimal semantic HTML (dashboards, SPAs, login pages) will produce lower-quality summaries rather than hard failures.

**5-day cache TTL**  
Long enough to avoid redundant API calls for frequently visited pages, short enough that summaries for news articles stay reasonably current. This is configurable in `storage.ts`.

---

## Development Scripts

| Command             | What it does                             |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | Build and watch for changes (hot reload) |
| `pnpm build`        | Production build to `dist/`              |
| `pnpm type-check`   | TypeScript strict check (no emit)        |
| `pnpm lint`         | ESLint with type-aware rules             |
| `pnpm lint:fix`     | Auto-fix lint errors                     |
| `pnpm format`       | Prettier format all files                |
| `pnpm format:check` | Check formatting without writing         |
| `pnpm test`         | Run Vitest unit tests                    |
| `pnpm test:watch`   | Run tests in watch mode                  |
