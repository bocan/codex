import React, { useState, useEffect } from 'react';
import { FileNode, FolderNode } from '../types';
import { api } from '../services/api';
import './PageList.css';

interface PageListProps {
  selectedFolder: string | null;
  onSelectPage: (path: string) => void;
  selectedPage: string | null;
  onRefresh: () => void;
  folderTree: FolderNode | null;
}

export const PageList: React.FC<PageListProps> = ({
  selectedFolder,
  onSelectPage,
  selectedPage,
  onRefresh,
  folderTree,
}) => {
  const [pages, setPages] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [contextMenuPage, setContextMenuPage] = useState<string | null>(null);
  const [renamingPage, setRenamingPage] = useState<string | null>(null);
  const [newPageName, setNewPageName] = useState('');
  const [movingPage, setMovingPage] = useState<string | null>(null);

  useEffect(() => {
    loadPages();
  }, [selectedFolder]);

  const loadPages = async () => {
    if (!selectedFolder) {
      setPages([]);
      return;
    }

    setLoading(true);
    try {
      const folderPath = selectedFolder === '/' ? '' : selectedFolder;
      const data = await api.getPages(folderPath);
      setPages(data);
    } catch (error) {
      console.error('Failed to load pages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePage = async () => {
    if (!selectedFolder) {
      alert('Please select a folder first');
      return;
    }

    const pageName = prompt('Enter page name (without .md extension):');
    if (pageName) {
      try {
        const fileName = pageName.endsWith('.md') ? pageName : `${pageName}.md`;
        const pagePath = selectedFolder === '/' ? fileName : `${selectedFolder}/${fileName}`;
        await api.createPage(pagePath, `# ${pageName}\n\nStart writing...`);
        loadPages();
        onRefresh();
      } catch (error) {
        alert('Failed to create page');
      }
    }
  };

  const handleDeletePage = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete page "${path}"?`)) {
      try {
        await api.deletePage(path);
        loadPages();
        onRefresh();
        if (selectedPage === path) {
          onSelectPage('');
        }
      } catch (error) {
        alert('Failed to delete page');
      }
    }
    setContextMenuPage(null);
  };

  const handleRenamePage = (path: string, name: string) => {
    setRenamingPage(path);
    setNewPageName(name.replace('.md', ''));
    setContextMenuPage(null);
  };

  const handleRenameSubmit = async (oldPath: string) => {
    if (!newPageName) {
      setRenamingPage(null);
      return;
    }

    const fileName = newPageName.endsWith('.md') ? newPageName : `${newPageName}.md`;
    const folderPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = folderPath ? `${folderPath}/${fileName}` : fileName;

    if (newPath !== oldPath) {
      try {
        await api.renamePage(oldPath, newPath);
        loadPages();
        onRefresh();
        if (selectedPage === oldPath) {
          onSelectPage(newPath);
        }
      } catch (error) {
        alert('Failed to rename page');
      }
    }
    setRenamingPage(null);
  };

  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPage(contextMenuPage === path ? null : path);
  };

  const handleMovePage = (path: string) => {
    setMovingPage(path);
    setContextMenuPage(null);
  };

  const handleMoveSubmit = async (targetFolder: string) => {
    if (!movingPage) return;

    try {
      const result = await api.movePage(movingPage, targetFolder);
      loadPages();
      onRefresh();
      if (selectedPage === movingPage) {
        onSelectPage(result.newPath);
      }
      setMovingPage(null);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to move page');
      setMovingPage(null);
    }
  };

  const getAllFolders = (node: FolderNode, prefix: string = ''): Array<{ path: string; display: string }> => {
    const folders: Array<{ path: string; display: string }> = [];
    const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
    const displayPath = currentPath === '' ? '/' : currentPath;

    folders.push({ path: node.path === '/' ? '' : node.path, display: displayPath });

    for (const child of node.children) {
      folders.push(...getAllFolders(child, currentPath));
    }

    return folders;
  };

  return (
    <div className="page-list">
      <div className="page-list-header">
        <h4>Pages</h4>
        <button onClick={handleCreatePage} disabled={!selectedFolder}>+ New Page</button>
      </div>
      {loading ? (
        <div className="loading">Loading...</div>
      ) : pages.length === 0 ? (
        <div className="empty-state">No pages in this folder</div>
      ) : (
        <div className="page-items">
          {pages.map((page) => (
            <div
              key={page.path}
              className={`page-item ${selectedPage === page.path ? 'selected' : ''}`}
              onClick={() => onSelectPage(page.path)}
              onContextMenu={(e) => handleContextMenu(e, page.path)}
            >
              <span className="page-icon">📄</span>
              {renamingPage === page.path ? (
                <input
                  type="text"
                  className="page-rename-input"
                  value={newPageName}
                  onChange={(e) => setNewPageName(e.target.value)}
                  onBlur={() => handleRenameSubmit(page.path)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit(page.path);
                    if (e.key === 'Escape') setRenamingPage(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span className="page-name">{page.name}</span>
              )}
              {contextMenuPage === page.path && (
                <div className="page-context-menu" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleRenamePage(page.path, page.name)}>Rename</button>
                  <button onClick={() => handleMovePage(page.path)}>Move to...</button>
                  <button onClick={(e) => handleDeletePage(page.path, e)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Move Page Modal */}
      {movingPage && folderTree && (
        <div className="modal-overlay" onClick={() => setMovingPage(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Move Page</h3>
            <p>Select destination folder:</p>
            <div className="folder-list">
              {getAllFolders(folderTree).map((folder) => (
                <button
                  key={folder.path}
                  className="folder-option"
                  onClick={() => handleMoveSubmit(folder.path)}
                >
                  📁 {folder.display}
                </button>
              ))}
            </div>
            <button className="cancel-btn" onClick={() => setMovingPage(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};
