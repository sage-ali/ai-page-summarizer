// Gemini generateContent request shape
export interface GeminiPart {
  text: string;
}

export interface GeminiContent {
  parts: GeminiPart[];
  role?: string;
}

export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiContent;
  generationConfig?: {
    responseMimeType?: string;
    temperature?: number;
    maxOutputTokens?: number;
  };
}

// Gemini generateContent response shape
export interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
}

export interface GeminiResponse {
  candidates: GeminiCandidate[];
}

// The structured JSON we ask Gemini to produce — maps directly to PageSummary fields
export interface AISummaryOutput {
  bullets: Array<{ text: string; emphasis: boolean }>;
  keyInsights: string[];
}
