import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import VersionHistory from "./VersionHistory";
import { Attachments } from "./Attachments";
import { useEditorStore } from "../store/editorStore";
import {
  Pilcrow,
  List,
  ListTodo,
  Link,
  Image,
  Minus,
  Mic,
  Paperclip,
  History,
  AlertTriangle,
  PenLine,
  Save,
  X,
} from "lucide-react";
import "./Editor.css";

interface EditorProps {
  pagePath: string | null;
  onClose: () => void;
}

export const Editor: React.FC<EditorProps> = ({ pagePath, onClose }) => {
  const { setContent: setStoreContent, scrollEditor } = useEditorStore();
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
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const contentRef = useRef<string>(content); // Track current content for speech recognition

  // Keep contentRef in sync with content state
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Debounced store update - only update preview after typing pauses
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setStoreContent(content);
    }, 600); // 600ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [content, setStoreContent]);

  useEffect(() => {
    if (pagePath) {
      loadPage();
    } else {
      setContent("");
      setStoreContent("");
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
      // Update store with initial content
      setStoreContent(page.content);
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
    const target = e.currentTarget;
    const scrollTop = target.scrollTop;
    const maxScroll = target.scrollHeight - target.clientHeight;

    // Throttle to ~60fps for smooth updates
    if (scrollThrottleRef.current) return;

    scrollThrottleRef.current = requestAnimationFrame(() => {
      scrollThrottleRef.current = null;
      if (maxScroll > 0) {
        scrollEditor(scrollTop / maxScroll);
      }
    });
  };

  // Speech recognition functions
  const startListening = () => {
    interface WindowWithSpeech extends Window {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      SpeechRecognition?: { new(): any };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webkitSpeechRecognition?: { new(): any };
    }
    const SpeechRecognition =
      (window as unknown as WindowWithSpeech).SpeechRecognition ||
      (window as unknown as WindowWithSpeech).webkitSpeechRecognition;
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

    recognition.onresult = (event: unknown) => {
      const typedEvent = event as {
        resultIndex: number;
        results: { isFinal: boolean; [index: number]: { transcript: string } }[];
      };
      for (
        let i = typedEvent.resultIndex;
        i < typedEvent.results.length;
        i++
      ) {
        const transcript = typedEvent.results[i][0].transcript;
        if (typedEvent.results[i].isFinal) {
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
        // Store update is debounced via useEffect

        // Move cursor to end of inserted text
        const newCursorPos = start + finalTranscript.length;
        setTimeout(() => {
          textarea.selectionStart = newCursorPos;
          textarea.selectionEnd = newCursorPos;
        }, 0);

        finalTranscript = "";
      }
    };

    recognition.onerror = (event: unknown) => {
      const typedEvent = event as { error?: string };
      console.error("Speech recognition error:", typedEvent.error);
      if (typedEvent.error === "not-allowed") {
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
        } catch {
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
    const success = document.execCommand("insertText", false, text);

    if (!success) {
      // Fallback for browsers that don't support execCommand
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + text + content.substring(end);
      setContent(newContent);
      // Store update is debounced via useEffect
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
        case "1":
          // Heading 1 (Cmd/Ctrl + 1)
          e.preventDefault();
          insertLinePrefix("# ");
          break;
        case "2":
          // Heading 2 (Cmd/Ctrl + 2)
          e.preventDefault();
          insertLinePrefix("## ");
          break;
        case "3":
          // Heading 3 (Cmd/Ctrl + 3)
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
          <PenLine size={48} className="empty-icon" aria-hidden="true" />
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
          <AlertTriangle size={48} className="error-icon" aria-hidden="true" />
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
            <Pilcrow size={14} aria-hidden="true" />
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
              <AlertTriangle size={14} aria-hidden="true" /> {error}
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
            <Mic size={14} aria-hidden="true" />
            <span className="btn-label">{isListening ? "Stop" : "Dictate"}</span>
          </button>
          <button
            onClick={() => setShowAttachments(true)}
            className="attachments-btn"
            title="Manage attachments"
            aria-label="Manage attachments"
          >
            <Paperclip size={14} aria-hidden="true" />
            <span className="btn-label">Attachments</span>
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="history-btn"
            title="View version history"
            aria-label="View version history"
          >
            <History size={14} aria-hidden="true" />
            <span className="btn-label">History</span>
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            title="Save page"
            aria-label="Save page"
          >
            <Save size={14} aria-hidden="true" />
            <span className="btn-label">{isSaving ? "Saving..." : "Save"}</span>
          </button>
          <button onClick={onClose} title="Close editor" aria-label="Close editor">
            <X size={14} aria-hidden="true" />
            <span className="btn-label">Close</span>
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
              <List size={14} />
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
              <ListTodo size={14} />
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
              <Link size={14} />
            </button>
            <button
              onClick={() => insertFormatting("![", "](image-url)", "alt text")}
              title="Image"
              aria-label="Insert image"
            >
              <Image size={14} />
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
              <Minus size={14} />
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
          // Store update is debounced via useEffect
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
          folderPath={pagePath.substring(0, pagePath.lastIndexOf("/")) || ""}
          onClose={() => setShowAttachments(false)}
          onInsert={handleInsertAttachment}
        />
      )}{" "}
    </div>
  );
};
