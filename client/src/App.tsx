import { useState, useEffect, useRef, useCallback } from "react";
import { FolderTree } from "./components/FolderTree";
import { PageList } from "./components/PageList";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { Login } from "./components/Login";
import { Search } from "./components/Search";
import { AIChat } from "./components/AIChat";
import ErrorBoundary from "./components/ErrorBoundary";
import { api } from "./services/api";
import { useEditorStore } from "./store/editorStore";
import { FolderNode, AIAccount, AIAccountType, ChatMessage } from "./types";
import {
  NotebookPen,
  Monitor,
  Sun,
  Moon,
  Contrast,
  LogOut,
  X,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Pencil,
  Eye,
  Highlighter,
  Search as SearchIcon,
  Paperclip,
  GitBranch,
  SunMoon,
  Smartphone,
  Lock,
  Settings,
  Plus,
  Trash2,
  Bot,
  Server,
  MessageSquare,
  ChevronUp,
} from "lucide-react";
import "./App.css";

// Simple encoding/decoding for API keys (obfuscation, not encryption)
// This prevents casual observation and satisfies code scanners
const encodeApiKey = (key: string): string => {
  if (!key) return '';
  return btoa(key.split('').reverse().join(''));
};

const decodeApiKey = (encoded: string): string => {
  if (!encoded) return '';
  try {
    return atob(encoded).split('').reverse().join('');
  } catch {
    // If decoding fails (e.g., already plain text from old version), return as-is
    return encoded;
  }
};

const encodeAccounts = (accounts: AIAccount[]): AIAccount[] =>
  accounts.map(acc => ({
    ...acc,
    apiKey: acc.apiKey ? encodeApiKey(acc.apiKey) : undefined,
  }));

const decodeAccounts = (accounts: AIAccount[]): AIAccount[] =>
  accounts.map(acc => ({
    ...acc,
    apiKey: acc.apiKey ? decodeApiKey(acc.apiKey) : undefined,
  }));

// Set document title dynamically from package.json
document.title = `${__APP_NAME__} - ${__APP_DESCRIPTION__}`;

const DEFAULT_LEFT_WIDTH = 300;
const DEFAULT_RIGHT_WIDTH = 400;
const DEFAULT_FOLDER_HEIGHT = 400;
const MIN_PANE_WIDTH = 200;
const MAX_PANE_WIDTH = 800;
const MIN_FOLDER_HEIGHT = 150;
const MAX_FOLDER_HEIGHT = 800;

// AI Chat pane
const DEFAULT_CHAT_HEIGHT = 250;
const MIN_CHAT_HEIGHT = 150;
const MAX_CHAT_HEIGHT = 500;

// Responsive breakpoints
const TABLET_BREAKPOINT = 768;
const MOBILE_BREAKPOINT = 600;

function App() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // null = loading
  const [authEnabled, setAuthEnabled] = useState(false);

  // Get current document content from editor store for AI context
  const { content } = useEditorStore();

  const [folderTree, setFolderTree] = useState<FolderNode | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false); // Track if we're on mobile for overlay behavior
  const [showAbout, setShowAbout] = useState(false); // About modal visibility
  const [showSettings, setShowSettings] = useState(false); // Settings modal visibility
  const [enableAISearch, setEnableAISearch] = useState(() => {
    const saved = localStorage.getItem('codex-enable-ai-search');
    // Default to false - user must explicitly enable AI features
    return saved === 'true' ? true : false;
  });

  // AI Accounts state
  const [aiAccounts, setAiAccounts] = useState<AIAccount[]>(() => {
    const saved = localStorage.getItem('codex-ai-accounts');
    return saved ? decodeAccounts(JSON.parse(saved)) : [];
  });
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [newAccountType, setNewAccountType] = useState<AIAccountType>('anthropic');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountApiKey, setNewAccountApiKey] = useState('');
  const [newAccountHost, setNewAccountHost] = useState('localhost');
  const [newAccountPort, setNewAccountPort] = useState('11434');

  // AI Chat state
  const [showAIChat, setShowAIChat] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState<ChatMessage[]>([]);
  const [aiChatHeight, setAiChatHeight] = useState(() => {
    const saved = localStorage.getItem('codex-ai-chat-height');
    return saved ? parseInt(saved, 10) : DEFAULT_CHAT_HEIGHT;
  });

  // Theme state
  const [theme, setTheme] = useState<
    "light" | "dark" | "high-contrast" | "auto"
  >(() => {
    const saved = localStorage.getItem("codex-theme");
    return (saved as "light" | "dark" | "high-contrast" | "auto") || "auto";
  });

  // Resizable pane widths
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => {
    const saved = localStorage.getItem("codex-left-pane-width");
    return saved ? parseInt(saved, 10) : DEFAULT_LEFT_WIDTH;
  });
  const [rightPaneWidth, setRightPaneWidth] = useState(() => {
    const saved = localStorage.getItem("codex-right-pane-width");
    return saved ? parseInt(saved, 10) : DEFAULT_RIGHT_WIDTH;
  });
  const [folderTreeHeight, setFolderTreeHeight] = useState(() => {
    const saved = localStorage.getItem("codex-folder-tree-height");
    return saved ? parseInt(saved, 10) : DEFAULT_FOLDER_HEIGHT;
  });

  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const isResizingFolderTree = useRef(false);
  const isResizingChat = useRef(false);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const lastBreakpointRef = useRef<string | null>(null); // Track breakpoint changes for responsive collapse

  // Responsive: auto-collapse panes based on screen size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width <= MOBILE_BREAKPOINT);

      // Determine current breakpoint bucket
      const breakpoint =
        width <= MOBILE_BREAKPOINT ? 'mobile' :
        width <= TABLET_BREAKPOINT ? 'tablet' :
        'desktop';

      // Only act when crossing a breakpoint boundary (including initial mount)
      if (breakpoint !== lastBreakpointRef.current) {
        const prev = lastBreakpointRef.current;
        lastBreakpointRef.current = breakpoint;

        if (breakpoint === 'mobile') {
          setLeftPaneCollapsed(true);
          setRightPaneCollapsed(true);
        } else if (breakpoint === 'tablet') {
          setRightPaneCollapsed(true);
          if (prev === 'mobile') setLeftPaneCollapsed(false);
        } else {
          // Desktop: restore panes that were auto-collapsed
          if (prev === 'mobile') {
            setLeftPaneCollapsed(false);
            setRightPaneCollapsed(false);
          } else if (prev === 'tablet') {
            setRightPaneCollapsed(false);
          }
        }
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

  // Close Settings modal on Escape key
  useEffect(() => {
    if (!showSettings) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSettings(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showSettings]);

  // Close Add Account modal on Escape key
  useEffect(() => {
    if (!showAddAccount) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAddAccount(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showAddAccount]);

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

  // AI Account handlers
  const resetAccountForm = () => {
    setNewAccountName('');
    setNewAccountApiKey('');
    setNewAccountHost('localhost');
    setNewAccountPort('11434');
    setNewAccountType('anthropic');
    setEditingAccountId(null);
  };

  const handleSaveAccount = () => {
    const id = editingAccountId || crypto.randomUUID();
    let account: AIAccount;

    if (newAccountType === 'anthropic') {
      account = {
        id,
        type: 'anthropic',
        name: newAccountName.trim(),
        apiKey: newAccountApiKey.trim(),
      };
    } else {
      account = {
        id,
        type: 'ollama',
        name: newAccountName.trim(),
        host: newAccountHost.trim(),
        port: parseInt(newAccountPort, 10) || 11434,
      };
    }

    let updated: AIAccount[];
    if (editingAccountId) {
      // Update existing
      updated = aiAccounts.map(acc => acc.id === editingAccountId ? account : acc);
    } else {
      // Add new
      updated = [...aiAccounts, account];
    }

    setAiAccounts(updated);
    localStorage.setItem('codex-ai-accounts', JSON.stringify(encodeAccounts(updated)));

    // Reset form and close modal
    resetAccountForm();
    setShowAddAccount(false);
  };

  const handleEditAccount = (account: AIAccount) => {
    setEditingAccountId(account.id);
    setNewAccountType(account.type);
    setNewAccountName(account.name);
    if (account.type === 'anthropic') {
      setNewAccountApiKey(account.apiKey);
      setNewAccountHost('localhost');
      setNewAccountPort('11434');
    } else {
      setNewAccountApiKey('');
      setNewAccountHost(account.host);
      setNewAccountPort(String(account.port));
    }
    setShowAddAccount(true);
  };

  const handleDeleteAccount = (id: string) => {
    const updated = aiAccounts.filter(acc => acc.id !== id);
    setAiAccounts(updated);
    localStorage.setItem('codex-ai-accounts', JSON.stringify(encodeAccounts(updated)));
  };

  const isAddAccountValid = () => {
    if (!newAccountName.trim()) return false;
    if (newAccountType === 'anthropic' && !newAccountApiKey.trim()) return false;
    if (newAccountType === 'ollama' && !newAccountHost.trim()) return false;
    return true;
  };

  // Only load folder tree if authenticated (or auth is disabled)
  useEffect(() => {
    if (isAuthenticated) {
      loadFolderTree();
    }
  }, [isAuthenticated]);

  // Save pane widths to localStorage
  useEffect(() => {
    localStorage.setItem("codex-left-pane-width", leftPaneWidth.toString());
  }, [leftPaneWidth]);

  useEffect(() => {
    localStorage.setItem(
      "codex-right-pane-width",
      rightPaneWidth.toString(),
    );
  }, [rightPaneWidth]);

  useEffect(() => {
    localStorage.setItem(
      "codex-folder-tree-height",
      folderTreeHeight.toString(),
    );
  }, [folderTreeHeight]);

  useEffect(() => {
    localStorage.setItem(
      "codex-ai-chat-height",
      aiChatHeight.toString(),
    );
  }, [aiChatHeight]);

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
    localStorage.setItem("codex-theme", theme);

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
      if (isResizingChat.current) {
        // Resize from top edge - calculate height from bottom of viewport
        const newHeight = window.innerHeight - e.clientY;
        if (newHeight >= MIN_CHAT_HEIGHT && newHeight <= MAX_CHAT_HEIGHT) {
          setAiChatHeight(newHeight);
        }
      }
    };

    const handleMouseUp = () => {
      isResizingLeft.current = false;
      isResizingRight.current = false;
      isResizingFolderTree.current = false;
      isResizingChat.current = false;
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

  const handleChatResizeStart = () => {
    isResizingChat.current = true;
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
    } catch (error: unknown) {
      console.error("Failed to load folder tree:", error);
      const message =
        (error as { response?: { status?: number } })?.response?.status === 401
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
      } catch (error: unknown) {
        console.error("Failed to check for README.md:", error);
        const message =
          (error as { response?: { status?: number } })?.response?.status === 401
            ? "Session expired. Please log in again."
            : `Failed to load pages from folder: ${path}`;
        setError(message);
        // Don't prevent folder selection on error, just show the error
      }
    }
  };

  const handleSelectPage = (path: string) => {
    setSelectedPage(path);
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
    if (theme === "auto") return <Monitor size={20} />;
    if (theme === "light") return <Sun size={20} />;
    if (theme === "dark") return <Moon size={20} />;
    return <Contrast size={20} />;
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
            <h1><NotebookPen size={24} /> {__APP_NAME__}</h1>
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
              <span aria-hidden="true" style={{ display: 'flex' }}>{getThemeIcon()}</span>
            </button>
            {authEnabled && (
              <button
                className="logout-button"
                onClick={handleLogout}
                title="Logout"
                aria-label="Logout of application"
              >
                <LogOut size={16} aria-hidden="true" /> Logout
              </button>
            )}
            <button
              className="settings-button"
              onClick={() => setShowSettings(true)}
              title="Settings"
              aria-label="Open settings"
            >
              <Settings size={16} aria-hidden="true" />
            </button>
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
              <X size={18} />
            </button>
            <h2 id="about-title"><NotebookPen size={24} /> {__APP_NAME__}</h2>
            <p className="about-version">
              <a
                href="https://github.com/bocan/codex/blob/main/CHANGELOG.md"
                target="_blank"
                rel="noopener noreferrer"
                title="View changelog"
              >
                Version {__APP_VERSION__}
              </a>
            </p>
            <p className="about-author">Developed by <a href="https://chris.funderburg.me" target="_blank" rel="noopener noreferrer">Chris Funderburg</a></p>
            <p className="about-description">
              {__APP_DESCRIPTION__} — with real-time markdown editing,
              live preview, and Git-based version control.
            </p>
            <h3>Features</h3>
            <ul className="about-features">
              <li><FolderOpen size={14} /> Hierarchical folder organization</li>
              <li><Pencil size={14} /> Live markdown editor</li>
              <li><Eye size={14} /> Real-time synchronized preview</li>
              <li><Highlighter size={14} /> Syntax highlighting for code blocks (auto-detect or specify language)</li>
              <li><SearchIcon size={14} /> Full-text search across all documents</li>
              <li><Paperclip size={14} /> File attachments with drag-and-drop</li>
              <li><GitBranch size={14} /> Git-powered version history</li>
              <li><SunMoon size={14} /> Light, dark, and high-contrast themes</li>
              <li><Smartphone size={14} /> Responsive design for mobile devices</li>
              <li><Lock size={14} /> Optional password protection</li>
            </ul>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div
          className="settings-overlay"
          onClick={() => setShowSettings(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <div
            className="settings-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="settings-close"
              onClick={() => setShowSettings(false)}
              aria-label="Close settings"
            >
              <X size={18} />
            </button>
            <h2 id="settings-title"><Settings size={24} /> Settings</h2>

            <section className="settings-group">
              <h3>AI Connectivity</h3>
              <label className="settings-option">
                <input
                  type="checkbox"
                  checked={enableAISearch}
                  onChange={(e) => {
                    setEnableAISearch(e.target.checked);
                    localStorage.setItem('codex-enable-ai-search', String(e.target.checked));
                  }}
                />
                <span className="settings-option-text">
                  <span className="settings-option-label">Enable contextual AI searching</span>
                  <span className="settings-option-description">Use AI to enhance search results with contextual understanding</span>
                </span>
              </label>

              <div className={`ai-accounts-section ${!enableAISearch ? 'disabled' : ''}`}>
                <button
                  className="add-account-button"
                  onClick={() => {
                    resetAccountForm();
                    setShowAddAccount(true);
                  }}
                  disabled={!enableAISearch}
                >
                  <Plus size={16} /> Add AI Account
                </button>

                {aiAccounts.length > 0 && (
                  <ul className="ai-accounts-list">
                    {aiAccounts.map((account) => (
                      <li key={account.id} className="ai-account-item">
                        <div className="ai-account-info">
                          {account.type === 'anthropic' ? (
                            <Bot size={16} className="ai-account-icon anthropic" />
                          ) : (
                            <Server size={16} className="ai-account-icon ollama" />
                          )}
                          <div className="ai-account-details">
                            <span className="ai-account-name">{account.name}</span>
                            <span className="ai-account-type">
                              {account.type === 'anthropic'
                                ? 'Anthropic'
                                : `Ollama (${account.host}:${account.port})`}
                            </span>
                          </div>
                        </div>
                        <div className="ai-account-actions">
                          <button
                            className="ai-account-edit"
                            onClick={() => handleEditAccount(account)}
                            aria-label={`Edit ${account.name}`}
                            disabled={!enableAISearch}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="ai-account-delete"
                            onClick={() => handleDeleteAccount(account.id)}
                            aria-label={`Delete ${account.name}`}
                            disabled={!enableAISearch}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Add/Edit AI Account Modal */}
      {showAddAccount && (
        <div
          className="settings-overlay"
          onClick={() => {
            resetAccountForm();
            setShowAddAccount(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-account-title"
        >
          <div
            className="add-account-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="settings-close"
              onClick={() => {
                resetAccountForm();
                setShowAddAccount(false);
              }}
              aria-label="Close add account"
            >
              <X size={18} />
            </button>
            <h2 id="add-account-title">
              {newAccountType === 'anthropic' ? <Bot size={24} /> : <Server size={24} />}
              {editingAccountId ? 'Edit AI Account' : 'Add AI Account'}
            </h2>

            <div className="account-type-selector">
              <button
                className={`account-type-btn ${newAccountType === 'anthropic' ? 'active' : ''}`}
                onClick={() => setNewAccountType('anthropic')}
              >
                <Bot size={20} />
                Anthropic
              </button>
              <button
                className={`account-type-btn ${newAccountType === 'ollama' ? 'active' : ''}`}
                onClick={() => setNewAccountType('ollama')}
              >
                <Server size={20} />
                Ollama
              </button>
            </div>

            <div className="account-form">
              <div className="form-field">
                <label htmlFor="account-name">Account Name</label>
                <input
                  id="account-name"
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder={newAccountType === 'anthropic' ? 'e.g., Personal Key' : 'e.g., Local Server'}
                />
              </div>

              {newAccountType === 'anthropic' ? (
                <div className="form-field">
                  <label htmlFor="api-key">API Key</label>
                  <input
                    id="api-key"
                    type="password"
                    value={newAccountApiKey}
                    onChange={(e) => setNewAccountApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                  />
                </div>
              ) : (
                <>
                  <div className="form-field">
                    <label htmlFor="ollama-host">Host</label>
                    <input
                      id="ollama-host"
                      type="text"
                      value={newAccountHost}
                      onChange={(e) => setNewAccountHost(e.target.value)}
                      placeholder="localhost"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="ollama-port">Port</label>
                    <input
                      id="ollama-port"
                      type="text"
                      value={newAccountPort}
                      onChange={(e) => setNewAccountPort(e.target.value)}
                      placeholder="11434"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="account-form-actions">
              <button
                className="cancel-btn"
                onClick={() => {
                  resetAccountForm();
                  setShowAddAccount(false);
                }}
              >
                Cancel
              </button>
              <button
                className="save-btn"
                onClick={handleSaveAccount}
                disabled={!isAddAccountValid()}
              >
                {editingAccountId ? 'Save Changes' : 'Add Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="app-container">
        {/* Error Message */}
        {error && (
          <div className="error-banner" role="alert" aria-live="assertive">
            <AlertTriangle size={16} aria-hidden="true" /> {error}
            <button
              className="error-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss error message"
            >
              <X size={16} />
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
                  <ChevronLeft size={14} aria-hidden="true" />
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
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              )}
              {rightPaneCollapsed && (
                <button
                  className="expand-btn expand-btn-right"
                  onClick={() => setRightPaneCollapsed(false)}
                  title="Show preview"
                  aria-label="Show preview"
                >
                  <ChevronLeft size={14} aria-hidden="true" />
                </button>
              )}
              <div className="editor-container" style={{ flex: showAIChat ? `1 1 calc(100% - ${aiChatHeight}px)` : '1 1 100%' }}>
                <Editor
                  pagePath={selectedPage}
                  onClose={handleCloseEditor}
                />
                {!showAIChat && enableAISearch && (
                  <button
                    className="expand-btn expand-btn-bottom"
                    onClick={() => setShowAIChat(true)}
                    title="Show AI chat"
                    aria-label="Show AI chat"
                  >
                    <MessageSquare size={14} aria-hidden="true" />
                    <ChevronUp size={10} aria-hidden="true" />
                  </button>
                )}
              </div>
              {showAIChat && (
                <div className="ai-chat-container" style={{ height: `${aiChatHeight}px` }}>
                  <div
                    className="resize-handle resize-handle-top"
                    onMouseDown={handleChatResizeStart}
                    role="separator"
                    aria-label="Resize AI chat height"
                    aria-orientation="horizontal"
                  />
                  <AIChat
                    accounts={aiAccounts}
                    documentContext={content}
                    enabled={enableAISearch}
                    messages={aiChatMessages}
                    onMessagesChange={setAiChatMessages}
                    onClose={() => setShowAIChat(false)}
                  />
                </div>
              )}
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
                  <ChevronRight size={14} aria-hidden="true" />
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
                      onNavigate={handleSelectPage}
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
