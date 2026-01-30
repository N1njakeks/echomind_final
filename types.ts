export interface SourceFile {
  id: string;
  title: string;
  content?: string; // Changed to optional for lazy loading
  summary?: string; // New field for pre-computed summaries
  type: 'text' | 'pdf' | 'markdown' | 'json' | 'api' | 'image' | 'video';
  geminiUri?: string; // URI from Gemini File API
  geminiMimeType?: string; // MimeType used for Gemini
  isRead: boolean;
  isSelected: boolean;
  createdAt: number;
  pageCount?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isThinking?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  sourceIds?: string[];
  mode?: 'standard' | 'reflective';
}