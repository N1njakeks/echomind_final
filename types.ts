export interface SourceFile {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'pdf' | 'markdown' | 'json' | 'api' | 'image' | 'video';
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