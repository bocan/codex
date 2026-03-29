import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2, StopCircle, Bot, Server, ChevronDown, X, Copy, Check, Download, Settings2, Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { api } from '../services/api';
import { AIAccount, ChatMessage, AIConfig, TokenUsage } from '../types';
import './AIChat.css';

// Code block with copy button for markdown rendering
const CodeBlock: React.FC<{ language?: string; children: string }> = ({ language, children }) => {
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const updateTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme === 'dark' || theme === 'high-contrast') {
        setIsDark(true);
      } else if (theme === 'auto' || !theme) {
        setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
      } else {
        setIsDark(false);
      }
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [children]);

  return (
    <div className={`ai-code-block ${isDark ? 'dark' : 'light'}`}>
      <div className="ai-code-header">
        <span className="ai-code-lang">{language || 'code'}</span>
        <button className="ai-code-copy" onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={language}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '13px', border: 'none' }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

interface AIChatProps {
  accounts: AIAccount[];
  documentContext?: string;
  enabled?: boolean;
  messages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onClose?: () => void;
}

export function AIChat({ accounts, documentContext, enabled = true, messages: externalMessages, onMessagesChange, onClose }: AIChatProps) {
  // Use external messages if provided, otherwise use internal state
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const messages = externalMessages ?? internalMessages;

  // Wrapper to handle both external and internal message updates
  const updateMessages = useCallback((updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    if (onMessagesChange) {
      // External state: resolve the updater and pass the result
      const newMessages = typeof updater === 'function'
        ? updater(externalMessages ?? [])
        : updater;
      onMessagesChange(newMessages);
    } else {
      // Internal state: pass directly to setState
      setInternalMessages(updater);
    }
  }, [onMessagesChange, externalMessages]);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [enableThinking, setEnableThinking] = useState(false);
  const [copiedMessageIdx, setCopiedMessageIdx] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const streamingContentRef = useRef('');
  const streamingThinkingRef = useRef('');

  // Auto-select first account if none selected
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  // Fetch available models when Ollama account is selected
  useEffect(() => {
    if (selectedAccount?.type === 'ollama') {
      setLoadingModels(true);
      setAvailableModels([]);
      setSelectedModel('');
      api.getOllamaModels(selectedAccount.host, selectedAccount.port)
        .then(models => {
          setAvailableModels(models);
          if (models.length > 0) {
            setSelectedModel(models[0]);
          }
          setLoadingModels(false);
        })
        .catch(() => {
          setAvailableModels([]);
          setLoadingModels(false);
          setError('Failed to fetch Ollama models. Is Ollama running?');
        });
    } else if (selectedAccount?.type === 'anthropic') {
      // Reset model state for Anthropic (uses default)
      setAvailableModels([]);
      setSelectedModel('');
    }
  }, [selectedAccount]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const buildConfig = useCallback((account: AIAccount): AIConfig => {
    if (account.type === 'anthropic') {
      return {
        type: 'anthropic',
        apiKey: account.apiKey,
        enableThinking,
        thinkingBudget: enableThinking ? 10000 : undefined,
      };
    } else {
      return {
        type: 'ollama',
        host: account.host,
        port: account.port,
        model: selectedModel || undefined,
      };
    }
  }, [selectedModel, enableThinking]);

  const copyMessage = useCallback(async (content: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageIdx(idx);
      setTimeout(() => setCopiedMessageIdx(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const exportChat = useCallback(() => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      account: selectedAccount?.name,
      model: selectedAccount?.type === 'ollama' ? selectedModel : 'claude-sonnet-4-20250514',
      systemPrompt: systemPrompt || undefined,
      tokenUsage,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        thinking: m.thinking,
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages, selectedAccount, selectedModel, systemPrompt, tokenUsage]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !selectedAccount || !enabled) return;

    // For Ollama, ensure a model is selected
    if (selectedAccount.type === 'ollama' && !selectedModel) {
      setError('Please select a model first');
      return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
    };

    updateMessages(prev => [...prev, userMessage]);
    setInput('');
    setError(null);
    setIsStreaming(true);
    setStreamingContent('');
    setStreamingThinking('');

    // Reset refs
    streamingContentRef.current = '';
    streamingThinkingRef.current = '';

    const allMessages = [...messages, userMessage];
    const config = buildConfig(selectedAccount);

    abortControllerRef.current = new AbortController();

    try {
      await api.streamChat(
        config,
        allMessages,
        documentContext,
        (text) => {
          streamingContentRef.current += text;
          setStreamingContent(streamingContentRef.current);
        },
        (err) => {
          setError(err);
          setIsStreaming(false);
        },
        () => {
          // Capture values BEFORE clearing
          const finalContent = streamingContentRef.current;
          const finalThinking = streamingThinkingRef.current;

          // Clear streaming state first
          setStreamingContent('');
          setStreamingThinking('');
          streamingContentRef.current = '';
          streamingThinkingRef.current = '';
          setIsStreaming(false);

          // Add the message using captured values
          if (finalContent) {
            updateMessages(msgs => [...msgs, {
              role: 'assistant',
              content: finalContent,
              thinking: finalThinking || undefined,
            }]);
          }
        },
        abortControllerRef.current.signal,
        // onThinking
        (thinking) => {
          streamingThinkingRef.current += thinking;
          setStreamingThinking(streamingThinkingRef.current);
        },
        // onThinkingDone
        () => {
          // Thinking phase complete; content continues streaming
        },
        // onUsage
        (inputTokens, outputTokens) => {
          setTokenUsage({ inputTokens, outputTokens });
        },
        // systemPrompt
        systemPrompt || undefined
      );
    } catch {
      setIsStreaming(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Capture values before clearing
    const finalContent = streamingContentRef.current;
    const finalThinking = streamingThinkingRef.current;

    setStreamingContent('');
    setStreamingThinking('');
    streamingContentRef.current = '';
    streamingThinkingRef.current = '';
    setIsStreaming(false);

    if (finalContent) {
      updateMessages(prev => [...prev, {
        role: 'assistant',
        content: finalContent,
        thinking: finalThinking || undefined,
      }]);
    }
  };

  const handleClear = () => {
    updateMessages([]);
    setStreamingContent('');
    setStreamingThinking('');
    setTokenUsage(null);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!enabled) {
    return (
      <div className="ai-chat ai-chat-disabled">
        <div className="ai-chat-disabled-message">
          <Bot size={24} />
          <span>AI features are disabled. Enable in Settings.</span>
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="ai-chat ai-chat-disabled">
        <div className="ai-chat-disabled-message">
          <Bot size={24} />
          <span>No AI accounts configured. Add one in Settings.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-chat">
      {/* Header */}
      <div className="ai-chat-header">
        <div className="ai-chat-title">
          <Bot size={16} />
          <span>AI Assistant</span>
        </div>

        <div className="ai-chat-actions">
          {/* Account Selector */}
          <div className="account-selector" ref={dropdownRef}>
            <button
              className="account-selector-button"
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              disabled={isStreaming}
            >
              {selectedAccount && (
                <>
                  {selectedAccount.type === 'anthropic' ? (
                    <Bot size={14} className="account-icon anthropic" />
                  ) : (
                    <Server size={14} className="account-icon ollama" />
                  )}
                  <span className="account-name">{selectedAccount.name}</span>
                </>
              )}
              <ChevronDown size={14} />
            </button>

            {showAccountDropdown && (
              <div className="account-dropdown">
                {accounts.map(account => (
                  <button
                    key={account.id}
                    className={`account-option ${account.id === selectedAccountId ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedAccountId(account.id);
                      setShowAccountDropdown(false);
                    }}
                  >
                    {account.type === 'anthropic' ? (
                      <Bot size={14} className="account-icon anthropic" />
                    ) : (
                      <Server size={14} className="account-icon ollama" />
                    )}
                    <span>{account.name}</span>
                    <span className="account-type-label">
                      {account.type === 'anthropic' ? 'Anthropic' : 'Ollama'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Model Selector for Ollama */}
          {selectedAccount?.type === 'ollama' && (
            <div className="model-selector" ref={modelDropdownRef}>
              <button
                className="model-selector-button"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                disabled={isStreaming || loadingModels}
              >
                {loadingModels ? (
                  <span className="model-loading">Loading...</span>
                ) : selectedModel ? (
                  <span className="model-name">{selectedModel}</span>
                ) : (
                  <span className="model-placeholder">Select model</span>
                )}
                <ChevronDown size={14} />
              </button>

              {showModelDropdown && availableModels.length > 0 && (
                <div className="model-dropdown">
                  {availableModels.map(model => (
                    <button
                      key={model}
                      className={`model-option ${model === selectedModel ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedModel(model);
                        setShowModelDropdown(false);
                      }}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Thinking Toggle for Anthropic */}
          {selectedAccount?.type === 'anthropic' && (
            <button
              className={`ai-chat-thinking-toggle ${enableThinking ? 'active' : ''}`}
              onClick={() => setEnableThinking(!enableThinking)}
              disabled={isStreaming}
              title={enableThinking ? 'Thinking enabled' : 'Enable thinking'}
            >
              <Brain size={14} />
            </button>
          )}

          {/* Settings */}
          <div className="ai-settings-container" ref={settingsRef}>
            <button
              className="ai-chat-settings"
              onClick={() => setShowSettings(!showSettings)}
              title="Chat settings"
            >
              <Settings2 size={14} />
            </button>

            {showSettings && (
              <div className="ai-settings-dropdown">
                <div className="ai-settings-section">
                  <label className="ai-settings-label">System Prompt</label>
                  <textarea
                    className="ai-settings-textarea"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Custom instructions for the AI..."
                    rows={4}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Export Chat */}
          <button
            className="ai-chat-export"
            onClick={exportChat}
            disabled={messages.length === 0}
            title="Export chat"
          >
            <Download size={14} />
          </button>

          {/* Clear Chat */}
          <button
            className="ai-chat-clear"
            onClick={handleClear}
            disabled={isStreaming || messages.length === 0}
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>

          {/* Close Button */}
          {onClose && (
            <button
              className="ai-chat-close"
              onClick={onClose}
              title="Hide AI chat"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="ai-chat-messages">
        {messages.length === 0 && !streamingContent && (
          <div className="ai-chat-empty">
            <Bot size={32} />
            <p>Ask me anything about your document</p>
            {documentContext && (
              <span className="context-indicator">Document context loaded</span>
            )}
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`ai-message ai-message-${msg.role}`}>
            {/* Thinking block (collapsible) for assistant messages */}
            {msg.role === 'assistant' && msg.thinking && (
              <details className="ai-thinking-block">
                <summary className="ai-thinking-summary">
                  <Brain size={12} />
                  <span>Thinking</span>
                </summary>
                <div className="ai-thinking-content">{msg.thinking}</div>
              </details>
            )}

            <div className="ai-message-content">
              {msg.role === 'assistant' ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code: ({ className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeString = String(children).replace(/\n$/, '');
                      // Check if it's a code block (has newlines) vs inline code
                      if (codeString.includes('\n') || match) {
                        return <CodeBlock language={match?.[1]}>{codeString}</CodeBlock>;
                      }
                      return <code className={className} {...props}>{children}</code>;
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>

            {/* Copy button */}
            <button
              className="ai-message-copy"
              onClick={() => copyMessage(msg.content, idx)}
              title={copiedMessageIdx === idx ? 'Copied!' : 'Copy message'}
            >
              {copiedMessageIdx === idx ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        ))}

        {/* Streaming thinking (live, open) */}
        {streamingThinking && (
          <div className="ai-message ai-message-assistant streaming">
            <details className="ai-thinking-block" open>
              <summary className="ai-thinking-summary">
                <Brain size={12} />
                <span>Thinking...</span>
              </summary>
              <div className="ai-thinking-content">{streamingThinking}</div>
            </details>
          </div>
        )}

        {/* Streaming content */}
        {streamingContent && (
          <div className="ai-message ai-message-assistant streaming">
            <div className="ai-message-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code: ({ className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeString = String(children).replace(/\n$/, '');
                    if (codeString.includes('\n') || match) {
                      return <CodeBlock language={match?.[1]}>{codeString}</CodeBlock>;
                    }
                    return <code className={className} {...props}>{children}</code>;
                  },
                }}
              >
                {streamingContent}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {error && (
          <div className="ai-chat-error">
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Token Usage Footer */}
      {tokenUsage && (
        <div className="ai-chat-usage">
          <span>Tokens: {tokenUsage.inputTokens} in / {tokenUsage.outputTokens} out</span>
        </div>
      )}

      {/* Input */}
      <div className="ai-chat-input-container">
        <textarea
          ref={inputRef}
          className="ai-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your document..."
          disabled={isStreaming}
          rows={1}
        />

        {isStreaming ? (
          <button className="ai-chat-stop" onClick={handleStop} title="Stop">
            <StopCircle size={18} />
          </button>
        ) : (
          <button
            className="ai-chat-send"
            onClick={handleSend}
            disabled={!input.trim()}
            title="Send (Enter)"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
