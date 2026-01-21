import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import VersionHistory from './VersionHistory';
import { Attachments } from './Attachments';
import './Editor.css';

interface EditorProps {
  pagePath: string | null;
  onClose: () => void;
  onContentChange?: (content: string) => void;
  onScroll?: (percent: number) => void;
}

export const Editor: React.FC<EditorProps> = ({ pagePath, onClose, onContentChange, onScroll }) => {
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<number>(0);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollThrottleRef = useRef<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const contentRef = useRef<string>(content); // Track current content for speech recognition

  // Keep contentRef in sync with content state
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (pagePath) {
      loadPage();
    } else {
      setContent('');
      setError(null);
    }
  }, [pagePath]);

  const loadPage = async () => {
    if (!pagePath) return;

    setIsLoading(true);
    setError(null);
    try {
      const page = await api.getPage(pagePath);
      setContent(page.content);
      // Notify parent of initial content
      if (onContentChange) {
        onContentChange(page.content);
      }
    } catch (err) {
      console.error('Failed to load page:', err);
      setError('Failed to load page. Click to retry.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!pagePath || isSaving) return;

    setIsSaving(true);
    setError(null);
    try {
      await api.updatePage(pagePath, content);
      const now = Date.now();
      setLastSaved(new Date());
      setLastSaveTime(now);
    } catch (err) {
      console.error('Failed to save page:', err);
      setError('Failed to save. Click to retry.');
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save with throttling: wait 5 seconds after typing stops, but at most once every 10 seconds
  useEffect(() => {
    if (!pagePath || isLoading || error) return;

    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTime;
    const minSaveInterval = 10000; // 10 seconds minimum between saves
    const typingPauseDelay = 5000; // 5 seconds after typing stops

    // If enough time has passed since last save, use typing pause delay
    // Otherwise, wait until the minimum interval has passed
    const delay = timeSinceLastSave >= minSaveInterval
      ? typingPauseDelay
      : Math.max(typingPauseDelay, minSaveInterval - timeSinceLastSave);

    const timer = setTimeout(() => {
      handleSave();
    }, delay);

    return () => clearTimeout(timer);
  }, [content, pagePath, isLoading, error]);

  // Handle editor scroll - sends scroll position to preview (throttled)
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (!onScroll) return;

    const target = e.currentTarget;
    const scrollTop = target.scrollTop;
    const maxScroll = target.scrollHeight - target.clientHeight;

    // Throttle to ~60fps for smooth updates
    if (scrollThrottleRef.current) return;

    scrollThrottleRef.current = requestAnimationFrame(() => {
      scrollThrottleRef.current = null;
      if (maxScroll > 0) {
        onScroll(scrollTop / maxScroll);
      }
    });
  };

  // Speech recognition functions
  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        }
      }

      // Get cursor position and insert text
      if (textareaRef.current && finalTranscript) {
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        // Use contentRef.current to get the latest content value
        const currentContent = contentRef.current;
        const newContent = currentContent.slice(0, start) + finalTranscript + currentContent.slice(end);

        setContent(newContent);
        if (onContentChange) {
          onContentChange(newContent);
        }

        // Move cursor to end of inserted text
        const newCursorPos = start + finalTranscript.length;
        setTimeout(() => {
          textarea.selectionStart = newCursorPos;
          textarea.selectionEnd = newCursorPos;
        }, 0);

        finalTranscript = '';
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access and try again.');
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      // Restart if still supposed to be listening (handles auto-stop)
      if (isListening && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (_e) {
          // Already started, ignore
        }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  if (!pagePath) {
    return (
      <div className="editor empty" role="status">
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">✏️</span>
          <p>Select a page to start editing</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="editor loading" role="status" aria-live="polite" aria-label="Loading page">
        <div className="loading-state">
          <div className="loading-spinner" aria-hidden="true"></div>
          <p>Loading page...</p>
        </div>
      </div>
    );
  }

  if (error && !content) {
    return (
      <div className="editor error" role="alert">
        <div className="error-state" onClick={loadPage}>
          <span className="error-icon" aria-hidden="true">⚠️</span>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const handleRestored = () => {
    loadPage();
  };

  const handleInsertAttachment = (filename: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    // Determine if it's an image
    const ext = filename.split('.').pop()?.toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '');

    const link = isImage
      ? `![${filename}](.attachments/${filename})`
      : `[${filename}](.attachments/${filename})`;

    const newContent = content.substring(0, start) + link + content.substring(end);
    setContent(newContent);
    if (onContentChange) {
      onContentChange(newContent);
    }

    // Close modal and focus back on textarea
    setShowAttachments(false);
    setTimeout(() => {
      textarea.focus();
      const newPos = start + link.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  return (
    <div className="editor" data-1p-ignore>
      <div className="editor-header">
        <h3>{pagePath.split('/').pop()}</h3>
        <div className="editor-actions">
          {error && (
            <span className="save-error" onClick={handleSave} role="alert" aria-live="assertive"><span aria-hidden="true">⚠️</span> {error}</span>
          )}
          {lastSaved && !error && (
            <span className="save-status" role="status" aria-live="polite">
              Saved at {lastSaved.toLocaleTimeString()}
            </span>
          )}
          {isSaving && <span className="save-status saving" role="status" aria-live="polite">Saving...</span>}
          <button
            onClick={toggleListening}
            className={`dictate-btn ${isListening ? 'listening' : ''}`}
            title={isListening ? 'Stop dictation' : 'Start dictation'}
            aria-label={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
            aria-pressed={isListening}
          >
            <span aria-hidden="true">🎤</span> {isListening ? 'Stop' : 'Dictate'}
          </button>
          <button
            onClick={() => setShowAttachments(true)}
            className="attachments-btn"
            title="Manage attachments"
            aria-label="Manage attachments"
          >
            <span aria-hidden="true">📎</span> Attachments
          </button>
          <button onClick={() => setShowHistory(true)} className="history-btn" aria-label="View version history">
            <span aria-hidden="true">📜</span> History
          </button>
          <button onClick={handleSave} disabled={isSaving} aria-label="Save page">
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={onClose} aria-label="Close editor">Close</button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          // Notify parent of content change immediately for live preview
          if (onContentChange) {
            onContentChange(e.target.value);
          }
        }}
        onScroll={handleScroll}
        placeholder="Start writing your markdown here..."
        spellCheck={false}
        disabled={isSaving}
        aria-label="Markdown editor"
      />

      {showHistory && (
        <VersionHistory
          pagePath={pagePath}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestored}
        />
      )}
      {showAttachments && (
        <Attachments
          folderPath={pagePath ? pagePath.substring(0, pagePath.lastIndexOf('/')) || '' : ''}
          onClose={() => setShowAttachments(false)}
          onInsert={handleInsertAttachment}
        />
      )}    </div>
  );
};
