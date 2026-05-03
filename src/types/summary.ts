export interface BulletPoint {
  text: string;
  emphasis: boolean;
}

export interface PageSummary {
  title: string;
  url: string;
  bullets: BulletPoint[];
  keyInsights: string[];
  readingTimeMinutes: number;
  generatedAt: number;
}
