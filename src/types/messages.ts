import type { PageSummary } from '@/types/summary';

// Outbound — popup sends these to the service worker

export interface RequestSummaryMessage {
  type: 'REQUEST_SUMMARY';
  url: string;
  title: string;
  content: string;
  wordCount: number;
}

// Inbound — service worker sends these back to the popup

export interface SummaryResultMessage {
  type: 'SUMMARY_RESULT';
  summary: PageSummary;
}

export interface SummaryErrorMessage {
  type: 'SUMMARY_ERROR';
  error: string;
}

// Outbound — popup sends this to the content script

export interface ExtractContentMessage {
  type: 'EXTRACT_CONTENT';
}

// Inbound — content script sends this back to the popup

export interface ExtractedContentMessage {
  type: 'EXTRACTED_CONTENT';
  content: string;
  title: string;
  wordCount: number;
}

// Union — every message in the extension must be one of these

export type ExtensionMessage =
  | RequestSummaryMessage
  | SummaryResultMessage
  | SummaryErrorMessage
  | ExtractContentMessage
  | ExtractedContentMessage;
