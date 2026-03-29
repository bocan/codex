import { Router, Request, Response } from 'express';
import { streamChat, ChatMessage, AIConfig, listOllamaModels, testOllamaConnection } from '../services/aiService';

const router = Router();

interface ChatRequestBody {
  config: AIConfig;
  messages: ChatMessage[];
  documentContext?: string;
  systemPrompt?: string;
}

/**
 * POST /api/ai/chat
 * Stream a chat response from the configured AI provider
 * Uses Server-Sent Events for streaming
 */
router.post('/chat', async (req: Request, res: Response) => {
  const { config, messages, documentContext, systemPrompt } = req.body as ChatRequestBody;

  // Validate request
  if (!config || !config.type) {
    res.status(400).json({ error: 'Missing AI configuration' });
    return;
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Messages array is required' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  try {
    const stream = streamChat({
      config,
      messages,
      documentContext,
      systemPrompt,
    });

    for await (const event of stream) {
      // Send each event type appropriately
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.end();
  } catch (error) {
    console.error('AI chat error:', error);
    
    // Send error as SSE
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/ai/ollama/models
 * List available Ollama models
 */
router.get('/ollama/models', async (req: Request, res: Response) => {
  const { host, port } = req.query;

  if (!host || !port) {
    res.status(400).json({ error: 'Host and port are required' });
    return;
  }

  try {
    const models = await listOllamaModels(
      host as string,
      parseInt(port as string, 10)
    );
    res.json({ models });
  } catch {
    res.status(500).json({ error: 'Failed to list Ollama models' });
  }
});

/**
 * GET /api/ai/ollama/test
 * Test Ollama connection
 */
router.get('/ollama/test', async (req: Request, res: Response) => {
  const { host, port } = req.query;

  if (!host || !port) {
    res.status(400).json({ error: 'Host and port are required' });
    return;
  }

  try {
    const success = await testOllamaConnection(
      host as string,
      parseInt(port as string, 10)
    );
    res.json({ success });
  } catch {
    res.json({ success: false });
  }
});

export default router;
