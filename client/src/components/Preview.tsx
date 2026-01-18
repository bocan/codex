import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../services/api';
import './Preview.css';

interface PreviewProps {
  pagePath: string | null;
}

export const Preview: React.FC<PreviewProps> = ({ pagePath }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (pagePath) {
      loadPage();

      // Poll for updates every 3 seconds
      const interval = setInterval(loadPage, 3000);
      return () => clearInterval(interval);
    } else {
      setContent('');
    }
  }, [pagePath]);

  const loadPage = async () => {
    if (!pagePath) return;

    setLoading(true);
    try {
      const page = await api.getPage(pagePath);
      setContent(page.content);
    } catch (error) {
      console.error('Failed to load page for preview:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!pagePath) {
    return (
      <div className="preview empty">
        <div className="empty-state">
          <p>Preview will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="preview">
      <div className="preview-header">
        <h3>Preview</h3>
        {loading && <span className="loading-indicator">●</span>}
      </div>
      <div className="preview-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};
