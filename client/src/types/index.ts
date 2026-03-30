export interface FolderNode {
  name: string;
  path: string;
  type: "folder";
  children: FolderNode[];
}

export interface FileNode {
  name: string;
  path: string;
  type: "file";
  createdAt: string;
  modifiedAt: string;
}

export interface Page {
  path: string;
  content: string;
}

export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export interface VersionContent {
  hash: string;
  content: string;
  date: string;
  message: string;
  author: string;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  matches: number;
}

export interface TemplateDefinition {
  path: string;
  template: string;
  autoname: boolean;
  content: string;
}

// AI Account types for contextual AI searching
export type AIAccountType = 'anthropic' | 'ollama';

export interface AnthropicAccount {
  id: string;
  type: 'anthropic';
  name: string;
  apiKey: string;
}

export interface OllamaAccount {
  id: string;
  type: 'ollama';
  name: string;
  host: string;
  port: number;
}

export type AIAccount = AnthropicAccount | OllamaAccount;

// Chat types for AI interaction
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;  // Extended thinking content (collapsible)
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIConfig {
  type: 'anthropic' | 'ollama';
  apiKey?: string;
  host?: string;
  port?: number;
  model?: string;
  enableThinking?: boolean;
  thinkingBudget?: number;
  systemPrompt?: string;
}

// Stream event types from server
export type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'thinking_done' }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'done' }
  | { type: 'error'; error: string };
