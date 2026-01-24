import { useState, useEffect, useRef, useCallback } from "react";
import { FolderTree } from "./components/FolderTree";
import { PageList } from "./components/PageList";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { Login } from "./components/Login";
import { Search } from "./components/Search";
import ErrorBoundary from "./components/ErrorBoundary";
import { api } from "./services/api";
import { FolderNode } from "./types";
import "./App.css";

// Set document title dynamically from package.json
document.title = `${__APP_NAME__} - ${__APP_DESCRIPTION__}`;

const DEFAULT_LEFT_WIDTH = 300;
const DEFAULT_RIGHT_WIDTH = 400;
const DEFAULT_FOLDER_HEIGHT = 400;
const MIN_PANE_WIDTH = 200;
const MAX_PANE_WIDTH = 800;
const MIN_FOLDER_HEIGHT = 150;
const MAX_FOLDER_HEIGHT = 800;

// Responsive breakpoints
const TABLET_BREAKPOINT = 768;
const MOBILE_BREAKPOINT = 600;

function App() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // null = loading
  const [authEnabled, setAuthEnabled] = useState(false);

  const [folderTree, setFolderTree] = useState<FolderNode | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(false);
  const [editorContent, setEditorContent] = useState<string>(""); // Track live editor content for preview
  const [scrollPercent, setScrollPercent] = useState<number>(0); // Synchronized scroll position (editor -> preview)
  const [isMobile, setIsMobile] = useState(false); // Track if we're on mobile for overlay behavior
  const [showAbout, setShowAbout] = useState(false); // About modal visibility

  // Theme state
  const [theme, setTheme] = useState<
    "light" | "dark" | "high-contrast" | "auto"
  >(() => {
    const saved = localStorage.getItem("disnotion-theme");
    return (saved as "light" | "dark" | "high-contrast" | "auto") || "auto";
  });

  // Resizable pane widths
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => {
    const saved = localStorage.getItem("disnotion-left-pane-width");
    return saved ? parseInt(saved, 10) : DEFAULT_LEFT_WIDTH;
  });
  const [rightPaneWidth, setRightPaneWidth] = useState(() => {
    const saved = localStorage.getItem("disnotion-right-pane-width");
    return saved ? parseInt(saved, 10) : DEFAULT_RIGHT_WIDTH;
  });
  const [folderTreeHeight, setFolderTreeHeight] = useState(() => {
    const saved = localStorage.getItem("disnotion-folder-tree-height");
    return saved ? parseInt(saved, 10) : DEFAULT_FOLDER_HEIGHT;
  });

  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const isResizingFolderTree = useRef(false);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const hasAutoCollapsed = useRef(false); // Track if we've auto-collapsed to avoid repeated triggers

  // Responsive: auto-collapse panes based on screen size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width <= MOBILE_BREAKPOINT);

      // Only auto-collapse once on initial load or when crossing breakpoints
      if (!hasAutoCollapsed.current) {
        if (width <= MOBILE_BREAKPOINT) {
          setLeftPaneCollapsed(true);
          setRightPaneCollapsed(true);
        } else if (width <= TABLET_BREAKPOINT) {
          setRightPaneCollapsed(true);
        }
        hasAutoCollapsed.current = true;
      }
    };

    // Run on mount
    handleResize();

    // Listen for resize
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Close sidebar/preview when clicking overlay on mobile
  const handleOverlayClick = useCallback(() => {
    if (isMobile) {
      setLeftPaneCollapsed(true);
      setRightPaneCollapsed(true);
    }
  }, [isMobile]);

  // Close About modal on Escape key
  useEffect(() => {
    if (!showAbout) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAbout(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showAbout]);

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const status = await api.checkAuthStatus();
      setAuthEnabled(status.authEnabled);
      setIsAuthenticated(status.authenticated);
    } catch (err) {
      console.error("Failed to check auth status:", err);
      setIsAuthenticated(false);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    loadFolderTree();
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      setIsAuthenticated(false);
      setFolderTree(null);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Only load folder tree if authenticated (or auth is disabled)
  useEffect(() => {
    if (isAuthenticated) {
      loadFolderTree();
    }
  }, [isAuthenticated]);

  // Save pane widths to localStorage
  useEffect(() => {
    localStorage.setItem("disnotion-left-pane-width", leftPaneWidth.toString());
  }, [leftPaneWidth]);

  useEffect(() => {
    localStorage.setItem(
      "disnotion-right-pane-width",
      rightPaneWidth.toString(),
    );
  }, [rightPaneWidth]);

  useEffect(() => {
    localStorage.setItem(
      "disnotion-folder-tree-height",
      folderTreeHeight.toString(),
    );
  }, [folderTreeHeight]);

  // Apply theme to document
  useEffect(() => {
    const applyTheme = () => {
      let effectiveTheme = theme;

      if (theme === "auto") {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        effectiveTheme = prefersDark ? "dark" : "light";
      }

      document.documentElement.setAttribute("data-theme", effectiveTheme);
    };

    applyTheme();
    localStorage.setItem("disnotion-theme", theme);

    // Listen for system theme changes when in auto mode
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "auto") {
        applyTheme();
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
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
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleLeftResizeStart = () => {
    isResizingLeft.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleRightResizeStart = () => {
    isResizingRight.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleFolderTreeResizeStart = () => {
    isResizingFolderTree.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  const loadFolderTree = async () => {
    try {
      setError(null);
      const tree = await api.getFolderTree();
      setFolderTree(tree);

      // Auto-select root if no folder is selected
      if (!selectedFolder) {
        setSelectedFolder(tree.path);
      }
    } catch (error: any) {
      console.error("Failed to load folder tree:", error);
      const message =
        error.response?.status === 401
          ? "Session expired. Please log in again."
          : "Failed to load folders. Please try refreshing the page.";
      setError(message);
    }
  };

  const handleSelectFolder = async (path: string) => {
    const isSameFolder = selectedFolder === path;
    setSelectedFolder(path);

    // Only clear selected page if switching to a different folder
    if (!isSameFolder) {
      setSelectedPage(null);
    }

    // Auto-select README.md if it exists in the folder (or keep current page if same folder)
    if (!isSameFolder || !selectedPage) {
      try {
        setError(null);
        const folderPath = path === "/" ? "" : path;
        const pages = await api.getPages(folderPath);
        const readme = pages.find(
          (page) => page.name.toLowerCase() === "readme.md",
        );
        if (readme) {
          setSelectedPage(readme.path);
        }
      } catch (error: any) {
        console.error("Failed to check for README.md:", error);
        const message =
          error.response?.status === 401
            ? "Session expired. Please log in again."
            : `Failed to load pages from folder: ${path}`;
        setError(message);
        // Don't prevent folder selection on error, just show the error
      }
    }
  };

  const handleSelectPage = (path: string) => {
    setSelectedPage(path);
    // Reset scroll position when changing pages
    setScrollPercent(0);
  };

  // Handle scroll from editor - syncs to preview
  const handleEditorScroll = (percent: number) => {
    setScrollPercent(percent);
  };

  const handleCloseEditor = () => {
    setSelectedPage(null);
  };

  const cycleTheme = () => {
    setTheme((current) => {
      if (current === "auto") return "light";
      if (current === "light") return "dark";
      if (current === "dark") return "high-contrast";
      return "auto";
    });
  };

  const getThemeIcon = () => {
    if (theme === "auto") return "🌓";
    if (theme === "light") return "☀️";
    if (theme === "dark") return "🌙";
    return "◐";
  };

  const getBreadcrumbs = () => {
    if (!selectedFolder) return [];

    if (selectedFolder === "/") {
      return [{ name: "Root", path: "/" }];
    }

    const parts = selectedFolder.split("/").filter(Boolean);
    const breadcrumbs = [{ name: "Root", path: "/" }];

    let currentPath = "";
    for (const part of parts) {
      currentPath += (currentPath ? "/" : "") + part;
      breadcrumbs.push({ name: part, path: currentPath });
    }

    return breadcrumbs;
  };

  // Show loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="app loading">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div
      className="app"
      role="application"
      aria-label={`${__APP_NAME__} Document Editor`}
    >
      <header className="app-header" role="banner">
        <div className="header-content">
          <div className="header-left">
            <h1>📝 {__APP_NAME__}</h1>
            <p className="tagline">{__APP_DESCRIPTION__}</p>
          </div>
          <nav className="breadcrumbs" aria-label="Breadcrumb navigation">
            {getBreadcrumbs().map((crumb, index, arr) => (
              <span key={crumb.path} className="breadcrumb-item">
                <button
                  className="breadcrumb-link"
                  onClick={() => setSelectedFolder(crumb.path)}
                  disabled={index === arr.length - 1}
                >
                  {crumb.name}
                </button>
                {index < arr.length - 1 && (
                  <span className="breadcrumb-separator" aria-hidden="true">
                    /
                  </span>
                )}
              </span>
            ))}
          </nav>
          <div
            className="header-actions"
            role="toolbar"
            aria-label="Application controls"
          >
            <Search onSelectPage={handleSelectPage} />
            <button
              className="theme-toggle"
              onClick={cycleTheme}
              title={`Theme: ${theme} (click to cycle)`}
              aria-label={`Current theme: ${theme}. Click to cycle themes.`}
            >
              <span aria-hidden="true">{getThemeIcon()}</span>
            </button>
            {authEnabled && (
              <button
                className="logout-button"
                onClick={handleLogout}
                title="Logout"
                aria-label="Logout of application"
              >
                <span aria-hidden="true">🚪</span> Logout
              </button>
            )}
            <button
              className="about-button"
              onClick={() => setShowAbout(true)}
              title="About this app"
              aria-label="About this app"
            >
              <span aria-hidden="true">?</span>
            </button>
          </div>
        </div>
      </header>

      {/* About Modal */}
      {showAbout && (
        <div
          className="about-overlay"
          onClick={() => setShowAbout(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-title"
        >
          <div
            className="about-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="about-close"
              onClick={() => setShowAbout(false)}
              aria-label="Close about dialog"
            >
              ✕
            </button>
            <h2 id="about-title">📝 {__APP_NAME__}</h2>
            <p className="about-version">Version {__APP_VERSION__}</p>
            <p className="about-author">Developed by <a href="https://chris.funderburg.me" target="_blank" rel="noopener noreferrer">Chris Funderburg</a></p>
            <p className="about-description">
              {__APP_DESCRIPTION__} — with real-time markdown editing,
              live preview, and Git-based version control.
            </p>
            <h3>Features</h3>
            <ul className="about-features">
              <li>📁 Hierarchical folder organization</li>
              <li>✍️ Live markdown editor</li>
              <li>👁️ Real-time synchronized preview</li>
              <li>🎨 Syntax highlighting for code blocks (auto-detect or specify language)</li>
              <li>🔍 Full-text search across all documents</li>
              <li>📎 File attachments with drag-and-drop</li>
              <li>📜 Git-powered version history</li>
              <li>🌗 Light, dark, and high-contrast themes</li>
              <li>📱 Responsive design for mobile devices</li>
              <li>🔐 Optional password protection</li>
            </ul>
          </div>
        </div>
      )}

      <main className="app-container">
        {/* Error Message */}
        {error && (
          <div className="error-banner" role="alert" aria-live="assertive">
            <span aria-hidden="true">⚠️</span> {error}
            <button
              className="error-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss error message"
            >
              ✕
            </button>
          </div>
        )}

        <ErrorBoundary>
          <div
            className={`panes-container ${isMobile && (!leftPaneCollapsed || !rightPaneCollapsed) ? "overlay-active" : ""}`}
            onClick={(e) => {
              // Only handle overlay clicks (not clicks on panes themselves)
              if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('panes-container')) {
                handleOverlayClick();
              }
            }}
          >
            {/* Mobile overlay */}
            {isMobile && (!leftPaneCollapsed || !rightPaneCollapsed) && (
              <div
                className="mobile-overlay"
                onClick={handleOverlayClick}
                aria-hidden="true"
              />
            )}
            {/* Left Pane: Folder Tree */}
            <aside
              ref={leftPaneRef}
              className={`left-pane ${leftPaneCollapsed ? "collapsed" : ""}`}
              style={{ width: leftPaneCollapsed ? "0" : (isMobile ? undefined : `${leftPaneWidth}px`) }}
              aria-label="Folder and page navigation"
              aria-hidden={leftPaneCollapsed}
            >
              {!leftPaneCollapsed && (
                <button
                  className="collapse-btn"
                  onClick={() => setLeftPaneCollapsed(!leftPaneCollapsed)}
                  title="Hide sidebar"
                  aria-label="Hide sidebar"
                >
                  <span aria-hidden="true">◀</span>
                </button>
              )}
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
                      role="separator"
                      aria-label="Resize folder tree height"
                      aria-orientation="horizontal"
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
                    role="separator"
                    aria-label="Resize sidebar width"
                    aria-orientation="vertical"
                  />
                </>
              )}
            </aside>

            {/* Center Pane: Editor */}
            <section className="center-pane" aria-label="Markdown editor">
              {leftPaneCollapsed && (
                <button
                  className="expand-btn expand-btn-left"
                  onClick={() => setLeftPaneCollapsed(false)}
                  title="Show sidebar"
                  aria-label="Show sidebar"
                >
                  <span aria-hidden="true">▶</span>
                </button>
              )}
              {rightPaneCollapsed && (
                <button
                  className="expand-btn expand-btn-right"
                  onClick={() => setRightPaneCollapsed(false)}
                  title="Show preview"
                  aria-label="Show preview"
                >
                  <span aria-hidden="true">◀</span>
                </button>
              )}
              <Editor
                pagePath={selectedPage}
                onClose={handleCloseEditor}
                onContentChange={setEditorContent}
                onScroll={handleEditorScroll}
              />
            </section>

            {/* Right Pane: Preview */}
            <aside
              className={`right-pane ${rightPaneCollapsed ? "collapsed" : ""}`}
              style={{
                width: rightPaneCollapsed ? "0" : (isMobile ? undefined : `${rightPaneWidth}px`),
              }}
              aria-label="Markdown preview"
              aria-hidden={rightPaneCollapsed}
            >
              {!rightPaneCollapsed && (
                <button
                  className="collapse-btn"
                  onClick={() => setRightPaneCollapsed(!rightPaneCollapsed)}
                  title="Hide preview"
                  aria-label="Hide preview"
                >
                  <span aria-hidden="true">▶</span>
                </button>
              )}
              {!rightPaneCollapsed && (
                <>
                  <div
                    className="resize-handle resize-handle-left"
                    onMouseDown={handleRightResizeStart}
                    role="separator"
                    aria-label="Resize preview width"
                    aria-orientation="vertical"
                  />
                  <div className="pane-content">
                    <Preview
                      pagePath={selectedPage}
                      liveContent={editorContent}
                      onNavigate={handleSelectPage}
                      scrollPercent={scrollPercent}
                    />
                  </div>
                </>
              )}
            </aside>
          </div>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
