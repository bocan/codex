import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIChat } from './AIChat';
import { api } from '../services/api';
import { AIAccount, ChatMessage } from '../types';

// Mock the api module
vi.mock('../services/api', () => ({
  api: {
    streamChat: vi.fn(),
    getOllamaModels: vi.fn(),
    testOllamaConnection: vi.fn(),
  },
}));

// Mock clipboard API
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn();

const mockAnthropicAccount: AIAccount = {
  id: 'anthropic-1',
  name: 'Test Anthropic',
  type: 'anthropic',
  apiKey: 'test-key',
};

const mockOllamaAccount: AIAccount = {
  id: 'ollama-1',
  name: 'Test Ollama',
  type: 'ollama',
  host: 'localhost',
  port: 11434,
};

describe('AIChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText.mockClear();
    vi.mocked(api.getOllamaModels).mockResolvedValue(['llama3', 'codellama']);
  });

  describe('Rendering', () => {
    it('shows empty state when no accounts are configured', () => {
      render(<AIChat accounts={[]} />);
      
      expect(screen.getByText(/no ai accounts configured/i)).toBeInTheDocument();
    });

    it('shows disabled state when enabled is false', () => {
      render(<AIChat accounts={[mockAnthropicAccount]} enabled={false} />);
      
      expect(screen.getByText(/ai features are disabled/i)).toBeInTheDocument();
    });

    it('renders chat interface when accounts are configured', () => {
      render(<AIChat accounts={[mockAnthropicAccount]} />);
      
      expect(screen.getByPlaceholderText(/ask about your document/i)).toBeInTheDocument();
    });

    it('auto-selects first account when accounts are available', () => {
      render(<AIChat accounts={[mockAnthropicAccount, mockOllamaAccount]} />);
      
      expect(screen.getByText('Test Anthropic')).toBeInTheDocument();
    });

    it('displays close button when onClose is provided', () => {
      const onClose = vi.fn();
      render(<AIChat accounts={[mockAnthropicAccount]} onClose={onClose} />);
      
      // Close button should exist in header
      const closeButtons = screen.getAllByRole('button');
      expect(closeButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Account Selection', () => {
    it('shows account dropdown when clicking account selector', async () => {
      const user = userEvent.setup();
      render(<AIChat accounts={[mockAnthropicAccount, mockOllamaAccount]} />);
      
      await user.click(screen.getByText('Test Anthropic'));
      
      await waitFor(() => {
        expect(screen.getByText('Test Ollama')).toBeInTheDocument();
      });
    });

    it('fetches Ollama models when Ollama account is selected', async () => {
      const user = userEvent.setup();
      render(<AIChat accounts={[mockAnthropicAccount, mockOllamaAccount]} />);
      
      await user.click(screen.getByText('Test Anthropic'));
      await user.click(screen.getByText('Test Ollama'));
      
      await waitFor(() => {
        expect(api.getOllamaModels).toHaveBeenCalledWith('localhost', 11434);
      });
    });

    it('shows error when Ollama models fail to load', async () => {
      vi.mocked(api.getOllamaModels).mockRejectedValue(new Error('Connection failed'));
      
      render(<AIChat accounts={[mockOllamaAccount]} />);
      
      await waitFor(() => {
        expect(screen.getByText(/failed to fetch ollama models/i)).toBeInTheDocument();
      });
    });
  });

  describe('Message Input', () => {
    it('enables send button when input has text', async () => {
      const user = userEvent.setup();
      render(<AIChat accounts={[mockAnthropicAccount]} />);
      
      const input = screen.getByPlaceholderText(/ask about your document/i);
      await user.type(input, 'Hello');
      
      // Send button should be enabled (not disabled)
      const sendButton = screen.getByTitle(/send/i);
      expect(sendButton).not.toBeDisabled();
    });

    it('submits on Enter key', async () => {
      vi.mocked(api.streamChat).mockImplementation(async (
        _config, _messages, _documentContext, _onText, _onError, onDone
      ) => {
        setTimeout(() => onDone(), 10);
      });
      
      const user = userEvent.setup();
      render(<AIChat accounts={[mockAnthropicAccount]} />);
      
      const input = screen.getByPlaceholderText(/ask about your document/i);
      await user.type(input, 'Hello{enter}');
      
      await waitFor(() => {
        expect(api.streamChat).toHaveBeenCalled();
      });
    });

    it('does not submit on Shift+Enter', async () => {
      const user = userEvent.setup();
      render(<AIChat accounts={[mockAnthropicAccount]} />);
      
      const input = screen.getByPlaceholderText(/ask about your document/i);
      await user.type(input, 'Hello{Shift>}{enter}{/Shift}');
      
      expect(api.streamChat).not.toHaveBeenCalled();
    });
  });

  describe('Streaming', () => {
    it('shows streaming content during response', async () => {
      vi.mocked(api.streamChat).mockImplementation(async (
        _config, _messages, _documentContext, onText, _onError, onDone
      ) => {
        setTimeout(() => {
          onText('Hello ');
          onText('world');
        }, 10);
        setTimeout(() => onDone(), 50);
      });

      const user = userEvent.setup();
      render(<AIChat accounts={[mockAnthropicAccount]} />);
      
      const input = screen.getByPlaceholderText(/ask about your document/i);
      await user.type(input, 'Test{enter}');
      
      await waitFor(() => {
        expect(screen.getByText(/hello world/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('shows stop button during streaming', async () => {
      vi.mocked(api.streamChat).mockImplementation(async () => {
        await new Promise(() => {}); // Never resolves
      });

      const user = userEvent.setup();
      render(<AIChat accounts={[mockAnthropicAccount]} />);
      
      const input = screen.getByPlaceholderText(/ask about your document/i);
      await user.type(input, 'Test{enter}');
      
      await waitFor(() => {
        expect(screen.getByTitle(/stop/i)).toBeInTheDocument();
      });
    });

    it('displays token usage when provided', async () => {
      vi.mocked(api.streamChat).mockImplementation(async (
        _config, _messages, _documentContext, _onText, _onError, onDone,
        _signal, _onThinking, _onThinkingDone, onUsage
      ) => {
        setTimeout(() => {
          if (onUsage) onUsage(100, 50);
          onDone();
        }, 10);
      });

      const user = userEvent.setup();
      render(<AIChat accounts={[mockAnthropicAccount]} />);
      
      const input = screen.getByPlaceholderText(/ask about your document/i);
      await user.type(input, 'Test{enter}');
      
      await waitFor(() => {
        expect(screen.getByText(/100/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Message Actions', () => {
    it('clears messages when clear button is clicked', async () => {
      const onMessagesChange = vi.fn();
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      
      const user = userEvent.setup();
      render(
        <AIChat 
          accounts={[mockAnthropicAccount]} 
          messages={messages}
          onMessagesChange={onMessagesChange}
        />
      );
      
      const clearButton = screen.getByTitle(/clear chat/i);
      await user.click(clearButton);
      
      expect(onMessagesChange).toHaveBeenCalledWith([]);
    });

    it('shows copy button for assistant messages', async () => {
      const messages: ChatMessage[] = [
        { role: 'assistant', content: 'Copy this text' },
      ];
      
      render(<AIChat accounts={[mockAnthropicAccount]} messages={messages} />);
      
      // Should have a copy button for the message
      const copyButtons = screen.getAllByTitle(/copy/i);
      expect(copyButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Settings', () => {
    it('shows settings panel when settings button is clicked', async () => {
      const user = userEvent.setup();
      render(<AIChat accounts={[mockAnthropicAccount]} />);
      
      const settingsButton = screen.getByTitle(/chat settings/i);
      await user.click(settingsButton);
      
      await waitFor(() => {
        expect(screen.getByText(/system prompt/i)).toBeInTheDocument();
      });
    });

    it('allows enabling thinking mode for Anthropic', async () => {
      const user = userEvent.setup();
      render(<AIChat accounts={[mockAnthropicAccount]} />);
      
      // Thinking toggle button is visible in header
      const thinkingButton = screen.getByTitle(/thinking/i);
      expect(thinkingButton).toBeInTheDocument();
    });
  });

  describe('External State Management', () => {
    it('uses external messages when provided', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'External message' },
      ];
      
      render(<AIChat accounts={[mockAnthropicAccount]} messages={messages} />);
      
      expect(screen.getByText('External message')).toBeInTheDocument();
    });

    it('calls onMessagesChange when adding messages', async () => {
      const onMessagesChange = vi.fn();
      
      vi.mocked(api.streamChat).mockImplementation(async (
        _config, _messages, _documentContext, onText, _onError, onDone
      ) => {
        setTimeout(() => {
          onText('Response');
          onDone();
        }, 10);
      });
      
      const user = userEvent.setup();
      render(
        <AIChat 
          accounts={[mockAnthropicAccount]} 
          messages={[]}
          onMessagesChange={onMessagesChange}
        />
      );
      
      const input = screen.getByPlaceholderText(/ask about your document/i);
      await user.type(input, 'Hello{enter}');
      
      await waitFor(() => {
        expect(onMessagesChange).toHaveBeenCalled();
      });
    });
  });
});
