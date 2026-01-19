import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import VersionHistory from './VersionHistory';
import './Editor.css';

interface EditorProps {
  pagePath: string | null;
  onClose: () => void;
}

export const Editor: React.FC<EditorProps> = ({ pagePath, onClose }) => {
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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
      setLastSaved(new Date());
    } catch (err) {
      console.error('Failed to save page:', err);
      setError('Failed to save. Click to retry.');
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save after 2 seconds of inactivity
  useEffect(() => {
    if (!pagePath || isLoading || error) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => clearTimeout(timer);
  }, [content, pagePath, isLoading, error]);

  if (!pagePath) {
    return (
      <div className="editor empty">
        <div className="empty-state">
          <span className="empty-icon">✏️</span>
          <p>Select a page to start editing</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="editor loading">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading page...</p>
        </div>
      </div>
    );
  }

  if (error && !content) {
    return (
      <div className="editor error">
        <div className="error-state" onClick={loadPage}>
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const handleRestored = () => {
    loadPage();
  };

  return (
    <div className="editor">
      <div className="editor-header">
        <h3>{pagePath.split('/').pop()}</h3>
        <div className="editor-actions">
          {error && (
            <span className="save-error" onClick={handleSave}>⚠️ {error}</span>
          )}
          {lastSaved && !error && (
            <span className="save-status">
              Saved at {lastSaved.toLocaleTimeString()}
            </span>
          )}
          {isSaving && <span className="save-status saving">Saving...</span>}
          <button onClick={() => setShowHistory(true)} className="history-btn">
            📜 History
          </button>
          <button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
      <textarea
        className="editor-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Start writing your markdown here..."
        spellCheck={false}
        disabled={isSaving}
      />

      {showHistory && (
        <VersionHistory
          pagePath={pagePath}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestored}
        />
      )}
    </div>
  );
};
