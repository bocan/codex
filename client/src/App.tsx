import React, { useState, useEffect, useRef } from 'react';
import { FolderTree } from './components/FolderTree';
import { PageList } from './components/PageList';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { api } from './services/api';
import { FolderNode } from './types';
import './App.css';

const DEFAULT_LEFT_WIDTH = 300;
const DEFAULT_RIGHT_WIDTH = 400;
const DEFAULT_FOLDER_HEIGHT = 400;
const MIN_PANE_WIDTH = 200;
const MAX_PANE_WIDTH = 800;
const MIN_FOLDER_HEIGHT = 150;
const MAX_FOLDER_HEIGHT = 800;

function App() {
  const [folderTree, setFolderTree] = useState<FolderNode | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(false);

  // Dark mode state
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(() => {
    const saved = localStorage.getItem('disnotion-theme');
    return (saved as 'light' | 'dark' | 'auto') || 'auto';
  });

  // Resizable pane widths
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => {
    const saved = localStorage.getItem('disnotion-left-pane-width');
    return saved ? parseInt(saved, 10) : DEFAULT_LEFT_WIDTH;
  });
  const [rightPaneWidth, setRightPaneWidth] = useState(() => {
    const saved = localStorage.getItem('disnotion-right-pane-width');
    return saved ? parseInt(saved, 10) : DEFAULT_RIGHT_WIDTH;
  });
  const [folderTreeHeight, setFolderTreeHeight] = useState(() => {
    const saved = localStorage.getItem('disnotion-folder-tree-height');
    return saved ? parseInt(saved, 10) : DEFAULT_FOLDER_HEIGHT;
  });

  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const isResizingFolderTree = useRef(false);
  const leftPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadFolderTree();
  }, []);

  // Save pane widths to localStorage
  useEffect(() => {
    localStorage.setItem('disnotion-left-pane-width', leftPaneWidth.toString());
  }, [leftPaneWidth]);

  useEffect(() => {
    localStorage.setItem('disnotion-right-pane-width', rightPaneWidth.toString());
  }, [rightPaneWidth]);

  useEffect(() => {
    localStorage.setItem('disnotion-folder-tree-height', folderTreeHeight.toString());
  }, [folderTreeHeight]);

  // Apply theme to document
  useEffect(() => {
    const applyTheme = () => {
      let effectiveTheme = theme;

      if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        effectiveTheme = prefersDark ? 'dark' : 'light';
      }

      document.documentElement.setAttribute('data-theme', effectiveTheme);
    };

    applyTheme();
    localStorage.setItem('disnotion-theme', theme);

    // Listen for system theme changes when in auto mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'auto') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft.current) {
        const newWidth = e.clientX;
        if (newWidth >= MIN_PANE_WIDTH && newWidth <= MAX_PANE_WIDTH) {
          setLeftPaneWidth(newWidth);
        }
      }
      if (isResizingRight.current) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= MIN_PANE_WIDTH && newWidth <= MAX_PANE_WIDTH) {
          setRightPaneWidth(newWidth);
        }
      }
      if (isResizingFolderTree.current && leftPaneRef.current) {
        const rect = leftPaneRef.current.getBoundingClientRect();
        const newHeight = e.clientY - rect.top;
        if (newHeight >= MIN_FOLDER_HEIGHT && newHeight <= MAX_FOLDER_HEIGHT) {
          setFolderTreeHeight(newHeight);
        }
      }
    };

    const handleMouseUp = () => {
      isResizingLeft.current = false;
      isResizingRight.current = false;
      isResizingFolderTree.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleLeftResizeStart = () => {
    isResizingLeft.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleRightResizeStart = () => {
    isResizingRight.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleFolderTreeResizeStart = () => {
    isResizingFolderTree.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const loadFolderTree = async () => {
    try {
      const tree = await api.getFolderTree();
      setFolderTree(tree);

      // Auto-select root if no folder is selected
      if (!selectedFolder) {
        setSelectedFolder(tree.path);
      }
    } catch (error) {
      console.error('Failed to load folder tree:', error);
    }
  };

  const handleSelectFolder = (path: string) => {
    setSelectedFolder(path);
    setSelectedPage(null);
  };

  const handleSelectPage = (path: string) => {
    setSelectedPage(path);
  };

  const handleCloseEditor = () => {
    setSelectedPage(null);
  };

  const cycleTheme = () => {
    setTheme((current) => {
      if (current === 'auto') return 'light';
      if (current === 'light') return 'dark';
      return 'auto';
    });
  };

  const getThemeIcon = () => {
    if (theme === 'auto') return '🌓';
    if (theme === 'light') return '☀️';
    return '🌙';
  };

  const getBreadcrumbs = () => {
    if (!selectedFolder) return [];

    if (selectedFolder === '/') {
      return [{ name: 'Root', path: '/' }];
    }

    const parts = selectedFolder.split('/').filter(Boolean);
    const breadcrumbs = [{ name: 'Root', path: '/' }];

    let currentPath = '';
    for (const part of parts) {
      currentPath += (currentPath ? '/' : '') + part;
      breadcrumbs.push({ name: part, path: currentPath });
    }

    return breadcrumbs;
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1>📝 Disnotion</h1>
            <p className="tagline">Your personal wiki & document store</p>
          </div>
          <div className="breadcrumbs">
            {getBreadcrumbs().map((crumb, index, arr) => (
              <span key={crumb.path} className="breadcrumb-item">
                <button
                  className="breadcrumb-link"
                  onClick={() => setSelectedFolder(crumb.path)}
                  disabled={index === arr.length - 1}
                >
                  {crumb.name}
                </button>
                {index < arr.length - 1 && <span className="breadcrumb-separator">/</span>}
              </span>
            ))}
          </div>
          <button
            className="theme-toggle"
            onClick={cycleTheme}
            title={`Theme: ${theme} (click to cycle)`}
          >
            {getThemeIcon()}
          </button>
        </div>
      </header>

      <div className="app-container">
        {/* Left Pane: Folder Tree */}
        <div
          ref={leftPaneRef}
          className={`left-pane ${leftPaneCollapsed ? 'collapsed' : ''}`}
          style={{ width: leftPaneCollapsed ? '30px' : `${leftPaneWidth}px` }}
        >
          <button
            className="collapse-btn"
            onClick={() => setLeftPaneCollapsed(!leftPaneCollapsed)}
          >
            {leftPaneCollapsed ? '▶' : '◀'}
          </button>
          {!leftPaneCollapsed && folderTree && (
            <>
              <div className="pane-content">
                <div
                  className="folder-tree-section"
                  style={{ height: `${folderTreeHeight}px` }}
                >
                  <FolderTree
                    root={folderTree}
                    onSelectFolder={handleSelectFolder}
                    selectedFolder={selectedFolder}
                    onRefresh={loadFolderTree}
                  />
                </div>
                <div
                  className="resize-handle resize-handle-horizontal"
                  onMouseDown={handleFolderTreeResizeStart}
                />
                <div className="page-list-section">
                  <PageList
                    selectedFolder={selectedFolder}
                    onSelectPage={handleSelectPage}
                    selectedPage={selectedPage}
                    onRefresh={loadFolderTree}
                    folderTree={folderTree}
                  />
                </div>
              </div>
              <div
                className="resize-handle resize-handle-right"
                onMouseDown={handleLeftResizeStart}
              />
            </>
          )}
        </div>

        {/* Center Pane: Editor */}
        <div className="center-pane">
          <Editor
            pagePath={selectedPage}
            onClose={handleCloseEditor}
          />
        </div>

        {/* Right Pane: Preview */}
        <div
          className={`right-pane ${rightPaneCollapsed ? 'collapsed' : ''}`}
          style={{ width: rightPaneCollapsed ? '30px' : `${rightPaneWidth}px` }}
        >
          <button
            className="collapse-btn"
            onClick={() => setRightPaneCollapsed(!rightPaneCollapsed)}
          >
            {rightPaneCollapsed ? '◀' : '▶'}
          </button>
          {!rightPaneCollapsed && (
            <>
              <div
                className="resize-handle resize-handle-left"
                onMouseDown={handleRightResizeStart}
              />
              <div className="pane-content">
                <Preview pagePath={selectedPage} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
