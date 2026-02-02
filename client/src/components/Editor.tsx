import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import VersionHistory from "./VersionHistory";
import { Attachments } from "./Attachments";
import "./Editor.css";

interface EditorProps {
  pagePath: string | null;
  onClose: () => void;
  onContentChange?: (content: string) => void;
  onScroll?: (percent: number) => void;
}

export const Editor: React.FC<EditorProps> = ({
  pagePath,
  onClose,
  onContentChange,
  onScroll,
}) => {
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showFormatToolbar, setShowFormatToolbar] = useState(false);
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
      setContent("");
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
      console.error("Failed to load page:", err);
      setError("Failed to load page. Click to retry.");
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
      console.error("Failed to save page:", err);
      setError("Failed to save. Click to retry.");
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save with throttling: wait 5 seconds after typing stops, but at most once every 10 seconds
  // Skip autosave if user has text selected (they're likely about to modify it)
  useEffect(() => {
    if (!pagePath || isLoading || error) return;

    // Don't autosave if user has text selected
    const hasSelection =
      textareaRef.current &&
      textareaRef.current.selectionStart !== textareaRef.current.selectionEnd;
    if (hasSelection) return;

    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTime;
    const minSaveInterval = 10000; // 10 seconds minimum between saves
    const typingPauseDelay = 5000; // 5 seconds after typing stops

    // If enough time has passed since last save, use typing pause delay
    // Otherwise, wait until the minimum interval has passed
    const delay =
      timeSinceLastSave >= minSaveInterval
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
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(
        "Speech recognition is not supported in this browser. Try Chrome or Edge.",
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";

    let finalTranscript = "";

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        }
      }

      // Get cursor position and insert text
      if (textareaRef.current && finalTranscript) {
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        // Use contentRef.current to get the latest content value
        const currentContent = contentRef.current;
        const newContent =
          currentContent.slice(0, start) +
          finalTranscript +
          currentContent.slice(end);

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

        finalTranscript = "";
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        alert(
          "Microphone access denied. Please allow microphone access and try again.",
        );
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

  // Insert text at cursor position while preserving undo stack
  // Uses execCommand which maintains native browser undo/redo
  const insertTextPreservingUndo = (text: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    textarea.focus();

    // execCommand preserves native undo stack
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const success = document.execCommand("insertText", false, text);

    if (!success) {
      // Fallback for browsers that don't support execCommand
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + text + content.substring(end);
      setContent(newContent);
      if (onContentChange) {
        onContentChange(newContent);
      }
    }
  };

  // Formatting helper: wraps selection or inserts at cursor
  const insertFormatting = (
    prefix: string,
    suffix: string = "",
    placeholder: string = ""
  ) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    textarea.focus();

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const textToWrap = selectedText || placeholder;
    const insertText = prefix + textToWrap + suffix;

    insertTextPreservingUndo(insertText);

    // Position cursor appropriately after insertion
    setTimeout(() => {
      if (selectedText) {
        // Select the wrapped text
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length + textToWrap.length
        );
      } else {
        // Position cursor at placeholder for typing
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length + placeholder.length
        );
      }
    }, 0);
  };

  // Insert block formatting (headings, lists) at line start
  const insertLinePrefix = (prefix: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    textarea.focus();

    const start = textarea.selectionStart;

    // Find the start of the current line
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;

    // Select from line start to current position, then insert prefix + selected text
    textarea.setSelectionRange(lineStart, lineStart);
    insertTextPreservingUndo(prefix);

    setTimeout(() => {
      textarea.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  };

  // Handle keyboard shortcuts in editor
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    if (cmdOrCtrl) {
      switch (e.key.toLowerCase()) {
        case "s":
          // Save (Cmd/Ctrl + S)
          e.preventDefault();
          handleSave();
          break;
        case "b":
          // Bold (Cmd/Ctrl + B)
          e.preventDefault();
          insertFormatting("**", "**", "bold");
          break;
        case "i":
          // Italic (Cmd/Ctrl + I)
          e.preventDefault();
          insertFormatting("_", "_", "italic");
          break;
        case "k":
          // Link (Cmd/Ctrl + K)
          e.preventDefault();
          insertFormatting("[", "](url)", "link text");
          break;
        case "`":
          // Inline code (Cmd/Ctrl + `)
          e.preventDefault();
          insertFormatting("`", "`", "code");
          break;
      }
    }

    // Alt/Option + number for headings
    if (e.altKey) {
      switch (e.key) {
        case "1":
          e.preventDefault();
          insertLinePrefix("# ");
          break;
        case "2":
          e.preventDefault();
          insertLinePrefix("## ");
          break;
        case "3":
          e.preventDefault();
          insertLinePrefix("### ");
          break;
      }
    }
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
          <span className="empty-icon" aria-hidden="true">
            ✏️
          </span>
          <p>Select a page to start editing</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="editor loading"
        role="status"
        aria-live="polite"
        aria-label="Loading page"
      >
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
          <span className="error-icon" aria-hidden="true">
            ⚠️
          </span>
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

    // Determine if it's an image
    const ext = filename.split(".").pop()?.toLowerCase();
    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(
      ext || "",
    );

    const link = isImage
      ? `![${filename}](.attachments/${filename})`
      : `[${filename}](.attachments/${filename})`;

    // Close modal and focus back on textarea, then insert
    setShowAttachments(false);
    setTimeout(() => {
      textarea.focus();
      insertTextPreservingUndo(link);
    }, 0);
  };

  return (
    <div className="editor" data-1p-ignore>
      <div className="editor-header">
        <div className="editor-title-row">
          <h3>{pagePath.split("/").pop()}</h3>
          <button
            onClick={() => setShowFormatToolbar(!showFormatToolbar)}
            className={`format-toggle-btn ${showFormatToolbar ? "active" : ""}`}
            title={showFormatToolbar ? "Hide formatting toolbar" : "Show formatting toolbar"}
            aria-label={showFormatToolbar ? "Hide formatting toolbar" : "Show formatting toolbar"}
            aria-pressed={showFormatToolbar}
          >
            <span aria-hidden="true">¶</span>
          </button>
        </div>
        <div className="editor-actions">
          {error && (
            <span
              className="save-error"
              onClick={handleSave}
              role="alert"
              aria-live="assertive"
            >
              <span aria-hidden="true">⚠️</span> {error}
            </span>
          )}
          {lastSaved && !error && (
            <span className="save-status" role="status" aria-live="polite">
              Saved at {lastSaved.toLocaleTimeString()}
            </span>
          )}
          {isSaving && (
            <span
              className="save-status saving"
              role="status"
              aria-live="polite"
            >
              Saving...
            </span>
          )}
          <button
            onClick={toggleListening}
            className={`dictate-btn ${isListening ? "listening" : ""}`}
            title={isListening ? "Stop dictation" : "Start dictation"}
            aria-label={
              isListening ? "Stop voice dictation" : "Start voice dictation"
            }
            aria-pressed={isListening}
          >
            <span aria-hidden="true">🎤</span>{" "}
            {isListening ? "Stop" : "Dictate"}
          </button>
          <button
            onClick={() => setShowAttachments(true)}
            className="attachments-btn"
            title="Manage attachments"
            aria-label="Manage attachments"
          >
            <span aria-hidden="true">📎</span> Attachments
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="history-btn"
            title="View version history"
            aria-label="View version history"
          >
            <span aria-hidden="true">📜</span> History
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            title="Save page"
            aria-label="Save page"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button onClick={onClose} title="Close editor" aria-label="Close editor">
            Close
          </button>
        </div>
      </div>
      {showFormatToolbar && (
        <div className="format-toolbar" role="toolbar" aria-label="Text formatting">
          <div className="format-group">
            <button
              onClick={() => insertLinePrefix("# ")}
              title="Heading 1 (Alt+1)"
              aria-label="Heading 1"
              data-shortcut="⌥1"
            >
              H1
            </button>
            <button
              onClick={() => insertLinePrefix("## ")}
              title="Heading 2 (Alt+2)"
              aria-label="Heading 2"
              data-shortcut="⌥2"
            >
              H2
            </button>
            <button
              onClick={() => insertLinePrefix("### ")}
              title="Heading 3 (Alt+3)"
              aria-label="Heading 3"
              data-shortcut="⌥3"
            >
              H3
            </button>
          </div>
          <div className="format-separator" aria-hidden="true"></div>
          <div className="format-group">
            <button
              onClick={() => insertFormatting("**", "**", "bold")}
              title="Bold (⌘B)"
              aria-label="Bold"
              data-shortcut="⌘B"
            >
              <strong>B</strong>
            </button>
            <button
              onClick={() => insertFormatting("*", "*", "italic")}
              title="Italic (⌘I)"
              aria-label="Italic"
              data-shortcut="⌘I"
            >
              <em>I</em>
            </button>
            <button
              onClick={() => insertFormatting("~~", "~~", "strikethrough")}
              title="Strikethrough"
              aria-label="Strikethrough"
            >
              <s>S</s>
            </button>
            <button
              onClick={() => insertFormatting("`", "`", "code")}
              title="Inline code (⌘`)"
              aria-label="Inline code"
              data-shortcut="⌘`"
            >
              <code>&lt;/&gt;</code>
            </button>
          </div>
          <div className="format-separator" aria-hidden="true"></div>
          <div className="format-group">
            <button
              onClick={() => insertLinePrefix("- ")}
              title="Bullet list"
              aria-label="Bullet list"
            >
              •
            </button>
            <button
              onClick={() => insertLinePrefix("1. ")}
              title="Numbered list"
              aria-label="Numbered list"
            >
              1.
            </button>
            <button
              onClick={() => insertLinePrefix("> ")}
              title="Blockquote"
              aria-label="Blockquote"
            >
              &quot;
            </button>
            <button
              onClick={() => insertLinePrefix("- [ ] ")}
              title="Task list"
              aria-label="Task list"
            >
              ☐
            </button>
          </div>
          <div className="format-separator" aria-hidden="true"></div>
          <div className="format-group">
            <button
              onClick={() => insertFormatting("[", "](url)", "link text")}
              title="Link (⌘K)"
              aria-label="Insert link"
              data-shortcut="⌘K"
            >
              🔗
            </button>
            <button
              onClick={() => insertFormatting("![", "](image-url)", "alt text")}
              title="Image"
              aria-label="Insert image"
            >
              🖼️
            </button>
            <button
              onClick={() => insertFormatting("\n```\n", "\n```\n", "code block")}
              title="Code block"
              aria-label="Insert code block"
            >
              ```
            </button>
            <button
              onClick={() => insertFormatting("\n---\n", "", "")}
              title="Horizontal rule"
              aria-label="Insert horizontal rule"
            >
              ―
            </button>
          </div>
        </div>
      )}
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
        onKeyDown={handleKeyDown}
        placeholder="Start writing your markdown here..."
        spellCheck={false}
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
          folderPath={
            pagePath
              ? pagePath.substring(0, pagePath.lastIndexOf("/")) || ""
              : ""
          }
          onClose={() => setShowAttachments(false)}
          onInsert={handleInsertAttachment}
        />
      )}{" "}
    </div>
  );
};
