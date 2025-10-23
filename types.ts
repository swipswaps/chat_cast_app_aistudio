export enum MessageSource {
  MANUAL = 'Manual',
  UPLOADED = 'Uploaded',
  GEMINI_SUMMARY = 'Gemini',
}

export interface ChatMessage {
  id: string;
  source: MessageSource;
  author: string;
  text: string;
  timestamp: Date;
}

export interface GeminiSummaryMessage {
  id: string;
  source: MessageSource.GEMINI_SUMMARY;
  summary: string;
  timestamp: Date;
}

export type DisplayMessage = ChatMessage | GeminiSummaryMessage;
