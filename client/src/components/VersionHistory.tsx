import { useEffect, useState } from 'react';
import * as Diff from 'diff';
import { api } from '../services/api';
import { CommitInfo, VersionContent } from '../types';
import './VersionHistory.css';

interface VersionHistoryProps {
  pagePath: string;
  onClose: () => void;
  onRestore: () => void;
}

export default function VersionHistory({ pagePath, onClose, onRestore }: VersionHistoryProps) {
  const [history, setHistory] = useState<CommitInfo[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionContent | null>(null);
  const [compareVersion, setCompareVersion] = useState<VersionContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadHistory();
  }, [pagePath]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await api.getPageHistory(pagePath);
      setHistory(data);
      setError('');
    } catch (err) {
      setError('Failed to load version history');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewVersion = async (hash: string) => {
    try {
      const version = await api.getPageVersion(pagePath, hash);
      setSelectedVersion(version);
      setCompareVersion(null);
    } catch (err) {
      setError('Failed to load version');
      console.error(err);
    }
  };

  const handleCompare = async (hash: string) => {
    if (!selectedVersion) {
      setError('Select a version first');
      return;
    }
    try {
      const version = await api.getPageVersion(pagePath, hash);
      setCompareVersion(version);
    } catch (err) {
      setError('Failed to load comparison version');
      console.error(err);
    }
  };

  const handleRestore = async (hash: string) => {
    if (!confirm('Are you sure you want to restore this version? This will create a new commit.')) {
      return;
    }
    try {
      await api.restorePageVersion(pagePath, hash);
      onRestore();
      onClose();
    } catch (err) {
      setError('Failed to restore version');
      console.error(err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderDiff = () => {
    if (!selectedVersion || !compareVersion) return null;

    const diff = Diff.diffLines(compareVersion.content, selectedVersion.content);

    return (
      <div className="diff-view">
        <div className="diff-header-info">
          <span className="diff-old-label">← {compareVersion.message}</span>
          <span className="diff-arrow">→</span>
          <span className="diff-new-label">{selectedVersion.message} →</span>
        </div>
        <div className="diff-content">
          {diff.map((part, index) => {
            const lines = part.value.split('\n');
            // Remove empty last line if exists
            if (lines[lines.length - 1] === '') {
              lines.pop();
            }

            return lines.map((line, lineIndex) => {
              const className = part.added ? 'diff-line-added' :
                              part.removed ? 'diff-line-removed' :
                              'diff-line-unchanged';
              const marker = part.added ? '+' : part.removed ? '-' : ' ';

              return (
                <div key={`${index}-${lineIndex}`} className={className}>
                  <span className="diff-marker">{marker}</span>
                  <span className="diff-text">{line || ' '}</span>
                </div>
              );
            });
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="version-history-overlay" onClick={onClose}>
      <div className="version-history-modal" onClick={e => e.stopPropagation()}>
        <div className="version-history-header">
          <h2>📜 Version History</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="version-history-content">
          {/* Timeline sidebar */}
          <div className="version-timeline">
            <h3>Commits</h3>
            {loading ? (
              <p className="loading">Loading history...</p>
            ) : history.length === 0 ? (
              <p className="no-history">No version history yet</p>
            ) : (
              <div className="commit-list">
                {history.map((commit, index) => (
                  <div
                    key={commit.hash}
                    className={`commit-item ${selectedVersion?.hash === commit.hash ? 'selected' : ''}`}
                  >
                    <div className="commit-header">
                      <span className="commit-badge">{index === 0 ? 'Latest' : `v${history.length - index}`}</span>
                      <span className="commit-date">{formatDate(commit.date)}</span>
                    </div>
                    <div className="commit-message">{commit.message}</div>
                    <div className="commit-author">by {commit.author}</div>
                    <div className="commit-actions">
                      <button onClick={() => handleViewVersion(commit.hash)} className="btn-small">
                        View
                      </button>
                      {selectedVersion && selectedVersion.hash !== commit.hash && (
                        <button onClick={() => handleCompare(commit.hash)} className="btn-small">
                          Compare
                        </button>
                      )}
                      {index > 0 && (
                        <button onClick={() => handleRestore(commit.hash)} className="btn-small btn-restore">
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Content viewer */}
          <div className="version-viewer">
            {!selectedVersion && !compareVersion ? (
              <div className="empty-state">
                <p>← Select a version to view its content</p>
              </div>
            ) : (
              <>
                {/* Single version view */}
                {selectedVersion && !compareVersion && (
                  <div className="version-content">
                    <div className="version-info">
                      <h3>{selectedVersion.message}</h3>
                      <p className="version-meta">
                        {formatDate(selectedVersion.date)} by {selectedVersion.author}
                      </p>
                    </div>
                    <pre className="version-text">{selectedVersion.content}</pre>
                  </div>
                )}

                {/* Compare view */}
                {selectedVersion && compareVersion && (
                  <div className="compare-view">
                    <div className="compare-header">
                      <button onClick={() => setCompareVersion(null)} className="btn-small">
                        ← Back to single view
                      </button>
                    </div>
                    {renderDiff()}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
