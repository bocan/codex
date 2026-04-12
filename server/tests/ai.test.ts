import request from 'supertest';
import app from '../src/index';

// Mock @anthropic-ai/sdk to prevent real network calls during tests
jest.mock('@anthropic-ai/sdk', () => {
  const mockStream = {
    [Symbol.asyncIterator]: async function* () {
      throw Object.assign(
        new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'),
        { status: 401 }
      );
    },
  };
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: {
      stream: jest.fn().mockResolvedValue(mockStream),
    },
  }));
  return { __esModule: true, default: MockAnthropic };
});

describe('AI Routes', () => {
  // Suppress expected error logs from the AI route's catch block during tests
  beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterAll(() => jest.restoreAllMocks());

  describe('POST /api/ai/chat', () => {
    it('returns 400 when config is missing', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'Hello' }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing AI configuration');
    });

    it('returns 400 when config.type is missing', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          config: {},
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing AI configuration');
    });

    it('returns 400 when messages array is missing', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          config: { type: 'anthropic', apiKey: 'test-key' },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Messages array is required');
    });

    it('returns 400 when messages array is empty', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          config: { type: 'anthropic', apiKey: 'test-key' },
          messages: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Messages array is required');
    });

    it('returns 400 when messages is not an array', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          config: { type: 'anthropic', apiKey: 'test-key' },
          messages: 'not an array',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Messages array is required');
    });

    it('sets correct SSE headers for valid request (anthropic)', async () => {
      // This will fail to connect to Anthropic, but we can verify the headers
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          config: { type: 'anthropic', apiKey: 'invalid-key' },
          messages: [{ role: 'user', content: 'Hello' }],
        });

      // Should at least try to set up SSE
      expect(response.headers['content-type']).toContain('text/event-stream');
    });
  });

  describe('GET /api/ai/ollama/models', () => {
    it('returns 400 when host is missing', async () => {
      const response = await request(app)
        .get('/api/ai/ollama/models')
        .query({ port: '11434' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Host and port are required');
    });

    it('returns 400 when port is missing', async () => {
      const response = await request(app)
        .get('/api/ai/ollama/models')
        .query({ host: 'localhost' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Host and port are required');
    });

    it('returns empty models when Ollama is not reachable', async () => {
      const response = await request(app)
        .get('/api/ai/ollama/models')
        .query({ host: 'localhost', port: '99999' });

      expect(response.status).toBe(200);
      expect(response.body.models).toEqual([]);
    });
  });

  describe('GET /api/ai/ollama/test', () => {
    it('returns 400 when host is missing', async () => {
      const response = await request(app)
        .get('/api/ai/ollama/test')
        .query({ port: '11434' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Host and port are required');
    });

    it('returns 400 when port is missing', async () => {
      const response = await request(app)
        .get('/api/ai/ollama/test')
        .query({ host: 'localhost' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Host and port are required');
    });

    it('returns success: false when Ollama is not reachable', async () => {
      const response = await request(app)
        .get('/api/ai/ollama/test')
        .query({ host: 'localhost', port: '99999' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
    });
  });
});
