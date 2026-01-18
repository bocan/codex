import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import './Editor.css';

interface EditorProps {
  pagePath: string | null;
  onClose: () => void;
}

export const Editor: React.FC<EditorProps> = ({ pagePath, onClose }) => {
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    if (pagePath) {
      loadPage();
    } else {
      setContent('');
    }
  }, [pagePath]);

  const loadPage = async () => {
    if (!pagePath) return;

    try {
      const page = await api.getPage(pagePath);
      setContent(page.content);
    } catch (error) {
      console.error('Failed to load page:', error);
      alert('Failed to load page');
    }
  };

  const handleSave = async () => {
    if (!pagePath) return;

    setIsSaving(true);
    try {
      await api.updatePage(pagePath, content);
      setLastSaved(new Date());
    } catch (error) {
      alert('Failed to save page');
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save after 2 seconds of inactivity
  useEffect(() => {
    if (!pagePath) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => clearTimeout(timer);
  }, [content, pagePath]);

  if (!pagePath) {
    return (
      <div className="editor empty">
        <div className="empty-state">
          <p>Select a page to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="editor-header">
        <h3>{pagePath.split('/').pop()}</h3>
        <div className="editor-actions">
          {lastSaved && (
            <span className="save-status">
              Saved at {lastSaved.toLocaleTimeString()}
            </span>
          )}
          {isSaving && <span className="save-status">Saving...</span>}
          <button onClick={handleSave} disabled={isSaving}>
            Save
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
      />
    </div>
  );
};
