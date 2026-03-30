import Anthropic from '@anthropic-ai/sdk';
import { Ollama } from 'ollama';

// Types for AI chat
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicConfig {
  type: 'anthropic';
  apiKey: string;
  model?: string;
  enableThinking?: boolean;
  thinkingBudget?: number;
}

export interface OllamaConfig {
  type: 'ollama';
  host: string;
  port: number;
  model?: string;
}

export type AIConfig = AnthropicConfig | OllamaConfig;

// Stream event types
export type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'thinking_done' }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'done' };

export interface ChatRequest {
  config: AIConfig;
  messages: ChatMessage[];
  documentContext?: string;
  systemPrompt?: string;
}

// Default models
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_OLLAMA_MODEL = 'llama3.2';

// Default system prompt for documentation assistant
const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant for markdown documentation. You help users write, edit, and improve their documentation. Be concise and practical. When suggesting changes, provide markdown that can be directly used.`;

/**
 * Stream a chat response from either Anthropic or Ollama
 * Yields StreamEvent objects as they arrive
 */
export async function* streamChat(request: ChatRequest): AsyncGenerator<StreamEvent> {
  const systemPrompt = request.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  // Build context-aware system prompt
  let fullSystemPrompt = systemPrompt;
  if (request.documentContext) {
    fullSystemPrompt += `\n\nThe user is currently working on this document:\n\`\`\`markdown\n${request.documentContext}\n\`\`\``;
  }

  if (request.config.type === 'anthropic') {
    yield* streamAnthropicChat(request.config, request.messages, fullSystemPrompt);
  } else {
    yield* streamOllamaChat(request.config, request.messages, fullSystemPrompt);
  }
}

async function* streamAnthropicChat(
  config: AnthropicConfig,
  messages: ChatMessage[],
  systemPrompt: string
): AsyncGenerator<StreamEvent> {
  const client = new Anthropic({
    apiKey: config.apiKey,
  });

  const model = config.model || DEFAULT_ANTHROPIC_MODEL;
  const enableThinking = config.enableThinking ?? false;
  const thinkingBudget = config.thinkingBudget || 10000;

  // Convert messages to Anthropic format
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Build request options
  const requestOptions: Anthropic.MessageCreateParamsStreaming = {
    model,
    max_tokens: enableThinking ? 16000 : 4096,
    system: systemPrompt,
    messages: anthropicMessages,
    stream: true,
  };

  // Add thinking configuration for supported models
  if (enableThinking) {
    (requestOptions as unknown as Record<string, unknown>).thinking = {
      type: 'enabled',
      budget_tokens: thinkingBudget,
    };
  }

  const stream = await client.messages.stream(requestOptions);

  let isThinking = false;
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const event of stream) {
    if (event.type === 'content_block_start') {
      // Check if this is a thinking block
      if ('content_block' in event && event.content_block.type === 'thinking') {
        isThinking = true;
      } else {
        isThinking = false;
      }
    } else if (event.type === 'content_block_delta') {
      if (event.delta.type === 'thinking_delta') {
        // Thinking content
        yield { type: 'thinking', content: event.delta.thinking };
      } else if (event.delta.type === 'text_delta') {
        // Regular text content
        yield { type: 'text', content: event.delta.text };
      }
    } else if (event.type === 'content_block_stop' && isThinking) {
      yield { type: 'thinking_done' };
      isThinking = false;
    } else if (event.type === 'message_delta') {
      // Capture usage information
      if ('usage' in event && event.usage) {
        outputTokens = event.usage.output_tokens || 0;
      }
    } else if (event.type === 'message_start') {
      // Capture input tokens
      if ('message' in event && event.message.usage) {
        inputTokens = event.message.usage.input_tokens || 0;
      }
    }
  }

  // Send usage info at the end
  if (inputTokens > 0 || outputTokens > 0) {
    yield { type: 'usage', inputTokens, outputTokens };
  }

  yield { type: 'done' };
}

async function* streamOllamaChat(
  config: OllamaConfig,
  messages: ChatMessage[],
  systemPrompt: string
): AsyncGenerator<StreamEvent> {
  const client = new Ollama({
    host: `http://${config.host}:${config.port}`,
  });

  const model = config.model || DEFAULT_OLLAMA_MODEL;

  // Build messages array with system prompt first
  const ollamaMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
  ];

  const response = await client.chat({
    model,
    messages: ollamaMessages,
    stream: true,
  });

  let totalTokens = 0;
  let promptTokens = 0;

  for await (const chunk of response) {
    if (chunk.message?.content) {
      yield { type: 'text', content: chunk.message.content };
    }
    // Ollama provides token counts in the final chunk
    if (chunk.done && chunk.eval_count !== undefined) {
      totalTokens = chunk.eval_count || 0;
      promptTokens = chunk.prompt_eval_count || 0;
    }
  }

  // Send usage info
  if (totalTokens > 0 || promptTokens > 0) {
    yield { type: 'usage', inputTokens: promptTokens, outputTokens: totalTokens };
  }

  yield { type: 'done' };
}

/**
 * List available models for Ollama
 */
export async function listOllamaModels(host: string, port: number): Promise<string[]> {
  try {
    const client = new Ollama({
      host: `http://${host}:${port}`,
    });
    const list = await client.list();
    return list.models.map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Test connection to Ollama
 */
export async function testOllamaConnection(host: string, port: number): Promise<boolean> {
  try {
    const client = new Ollama({
      host: `http://${host}:${port}`,
    });
    await client.list();
    return true;
  } catch {
    return false;
  }
}

/**
 * Test Anthropic API key
 */
export async function testAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    const client = new Anthropic({ apiKey });
    // Make a minimal request to verify the key
    await client.messages.create({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'test' }],
    });
    return true;
  } catch {
    return false;
  }
}
