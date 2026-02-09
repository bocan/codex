import React, { useState, useEffect, useMemo, useRef } from "react";
import { FileNode, FolderNode } from "../types";
import { api } from "../services/api";
import "./PageList.css";

type SortField = "name" | "createdAt" | "modifiedAt";
type SortDirection = "asc" | "desc";

const formatDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getPageTooltip = (page: FileNode): string => {
  return `Created: ${formatDate(page.createdAt)}\nModified: ${formatDate(page.modifiedAt)}`;
};

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
  const [error, setError] = useState<string | null>(null);
  const [contextMenuPage, setContextMenuPage] = useState<string | null>(null);
  const [renamingPage, setRenamingPage] = useState<string | null>(null);
  const [newPageName, setNewPageName] = useState("");
  const [movingPage, setMovingPage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Close context menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!contextMenuPage) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(event.target as Node)
      ) {
        setContextMenuPage(null);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenuPage(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscapeKey);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [contextMenuPage]);

  const sortedPages = useMemo(() => {
    return [...pages].sort((a, b) => {
      let comparison = 0;
      if (sortField === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === "createdAt") {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === "modifiedAt") {
        comparison = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [pages, sortField, sortDirection]);

  // Keyboard navigation (arrow keys and vim j/k)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if list has focus and we're not renaming
      if (!listRef.current?.contains(document.activeElement) || renamingPage) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, sortedPages.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && sortedPages[selectedIndex]) {
        e.preventDefault();
        onSelectPage(sortedPages[selectedIndex].path);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sortedPages, selectedIndex, onSelectPage, renamingPage]);

  // Reset selection when pages change
  useEffect(() => {
    setSelectedIndex(0);
  }, [selectedFolder, sortedPages.length]);

  useEffect(() => {
    loadPages();
  }, [selectedFolder]);

  const loadPages = async () => {
    setLoading(true);
    setError(null);
    try {
      // Treat null, undefined, or "/" as root folder
      const folderPath = !selectedFolder || selectedFolder === "/" ? "" : selectedFolder;
      const data = await api.getPages(folderPath);
      setPages(data);
    } catch (err) {
      console.error("Failed to load pages:", err);
      setError("Failed to load pages. Click to retry.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePage = async () => {
    // Allow creating pages in root (selectedFolder can be null or "/")
    const pageName = prompt("Enter page name (without .md extension):");
    if (pageName) {
      setIsCreating(true);
      try {
        const fileName = pageName.endsWith(".md") ? pageName : `${pageName}.md`;
        const pagePath =
          !selectedFolder || selectedFolder === "/" ? fileName : `${selectedFolder}/${fileName}`;
        await api.createPage(pagePath, `# ${pageName}\n\nStart writing...`);
        loadPages();
        onRefresh();
      } catch (err) {
        console.error("Failed to create page:", err);
        setError("Failed to create page. Please try again.");
      } finally {
        setIsCreating(false);
      }
    }
  };

  const handleDeletePage = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete page "${path}"?`)) {
      setIsDeleting(path);
      setContextMenuPage(null);
      try {
        await api.deletePage(path);
        loadPages();
        onRefresh();
        if (selectedPage === path) {
          onSelectPage("");
        }
      } catch (err) {
        console.error("Failed to delete page:", err);
        setError("Failed to delete page. Please try again.");
      } finally {
        setIsDeleting(null);
      }
    } else {
      setContextMenuPage(null);
    }
  };

  const handleRenamePage = (path: string, name: string) => {
    setRenamingPage(path);
    setNewPageName(name.replace(".md", ""));
    setContextMenuPage(null);
  };

  const handleRenameSubmit = async (oldPath: string) => {
    if (!newPageName) {
      setRenamingPage(null);
      return;
    }

    const fileName = newPageName.endsWith(".md")
      ? newPageName
      : `${newPageName}.md`;
    const folderPath = oldPath.substring(0, oldPath.lastIndexOf("/"));
    const newPath = folderPath ? `${folderPath}/${fileName}` : fileName;

    if (newPath !== oldPath) {
      try {
        await api.renamePage(oldPath, newPath);
        loadPages();
        onRefresh();
        if (selectedPage === oldPath) {
          onSelectPage(newPath);
        }
      } catch (err) {
        console.error("Failed to rename page:", err);
        setError("Failed to rename page. Please try again.");
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

    setIsMoving(true);
    try {
      const result = await api.movePage(movingPage, targetFolder);
      loadPages();
      onRefresh();
      if (selectedPage === movingPage) {
        onSelectPage(result.newPath);
      }
      setMovingPage(null);
    } catch (err: any) {
      console.error("Failed to move page:", err);
      setError(
        err.response?.data?.error || "Failed to move page. Please try again.",
      );
      setMovingPage(null);
    } finally {
      setIsMoving(false);
    }
  };

  const getAllFolders = (
    node: FolderNode,
    prefix: string = "",
  ): Array<{ path: string; display: string }> => {
    const folders: Array<{ path: string; display: string }> = [];
    const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
    const displayPath = currentPath === "" ? "/" : currentPath;

    folders.push({
      path: node.path === "/" ? "" : node.path,
      display: displayPath,
    });

    for (const child of node.children) {
      folders.push(...getAllFolders(child, currentPath));
    }

    return folders;
  };

  return (
    <nav className="page-list" aria-label="Page list">
      <div className="page-list-header">
        <h4>Pages</h4>
        <div className="page-list-controls">
          <div className="sort-controls">
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              aria-label="Sort by"
              title="Sort by"
            >
              <option value="name">Name</option>
              <option value="createdAt">Created</option>
              <option value="modifiedAt">Modified</option>
            </select>
            <button
              className="sort-direction-btn"
              onClick={() => setSortDirection(d => d === "asc" ? "desc" : "asc")}
              aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
              title={sortDirection === "asc" ? "Oldest/A first" : "Newest/Z first"}
            >
              {sortDirection === "asc" ? "↑" : "↓"}
            </button>
          </div>
          <button
            onClick={handleCreatePage}
            disabled={isCreating}
            className={`new-page-btn ${isCreating ? "loading" : ""}`}
            aria-label="Create new page"
            title="Create new page"
          >
            {isCreating ? "..." : "+"}
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          className="error-state"
          onClick={() => {
            setError(null);
            loadPages();
          }}
          role="alert"
          aria-live="polite"
        >
          <span className="error-icon" aria-hidden="true">
            ⚠️
          </span>
          <span>{error}</span>
        </div>
      )}

      {/* Loading State - only when no data */}
      {loading && !pages.length && !error ? (
        <div
          className="loading-state"
          role="status"
          aria-live="polite"
          aria-label="Loading pages"
        >
          <div className="loading-spinner" aria-hidden="true"></div>
          <span>Loading pages...</span>
        </div>
      ) : !loading && pages.length === 0 && !error ? (
        <div className="empty-state" role="status">
          <span className="empty-icon" aria-hidden="true">
            📄
          </span>
          <span>No pages yet</span>
          <button
            onClick={handleCreatePage}
            disabled={isCreating}
            aria-label="Create your first page"
          >
            Create your first page
          </button>
        </div>
      ) : (
        <ul className="page-items" role="list" ref={listRef} tabIndex={0}>
          {sortedPages.map((page, index) => (
            <li
              key={page.path}
              className={`page-item ${selectedPage === page.path ? "selected" : ""} ${index === selectedIndex ? "keyboard-selected" : ""} ${isDeleting === page.path ? "deleting" : ""}`}
              onClick={() => !isDeleting && onSelectPage(page.path)}
              onContextMenu={(e) =>
                !isDeleting && handleContextMenu(e, page.path)
              }
              onMouseEnter={() => setSelectedIndex(index)}
              role="button"
              tabIndex={-1}
              aria-label={`Page: ${page.name}${selectedPage === page.path ? " (selected)" : ""}`}
              aria-busy={isDeleting === page.path}
              title={getPageTooltip(page)}
            >
              <span className="page-icon" aria-hidden="true">
                {isDeleting === page.path ? "⏳" : "📄"}
              </span>
              {renamingPage === page.path ? (
                <input
                  type="text"
                  className="page-rename-input"
                  value={newPageName}
                  onChange={(e) => setNewPageName(e.target.value)}
                  onBlur={() => handleRenameSubmit(page.path)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit(page.path);
                    if (e.key === "Escape") setRenamingPage(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  aria-label="Rename page"
                />
              ) : (
                <span className="page-name">{page.name}</span>
              )}
              {contextMenuPage === page.path && (
                <div
                  ref={contextMenuRef}
                  className="page-context-menu"
                  onClick={(e) => e.stopPropagation()}
                  role="menu"
                  aria-label="Page actions"
                >
                  <button
                    onClick={() => handleRenamePage(page.path, page.name)}
                    role="menuitem"
                    aria-label={`Rename ${page.name}`}
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleMovePage(page.path)}
                    role="menuitem"
                    aria-label={`Move ${page.name} to another folder`}
                  >
                    Move to...
                  </button>
                  <button
                    onClick={(e) => handleDeletePage(page.path, e)}
                    role="menuitem"
                    aria-label={`Delete ${page.name}`}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Move Page Modal */}
      {movingPage && folderTree && (
        <div
          className="modal-overlay"
          onClick={() => !isMoving && setMovingPage(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-modal-title"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="move-modal-title">Move Page</h3>
            <p>
              Select destination folder for{" "}
              <strong>{movingPage.split("/").pop()}</strong>:
            </p>
            {isMoving ? (
              <div className="modal-loading" role="status" aria-live="polite">
                <div className="loading-spinner" aria-hidden="true"></div>
                <span>Moving page...</span>
              </div>
            ) : (
              <div className="folder-list" role="list">
                {getAllFolders(folderTree).map((folder) => (
                  <button
                    key={folder.path}
                    className="folder-option"
                    onClick={() => handleMoveSubmit(folder.path)}
                    disabled={isMoving}
                    role="listitem"
                    aria-label={`Move to ${folder.display}`}
                  >
                    <span aria-hidden="true">📁</span> {folder.display}
                  </button>
                ))}
              </div>
            )}
            <button
              className="cancel-btn"
              onClick={() => setMovingPage(null)}
              disabled={isMoving}
              aria-label="Cancel moving page"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};
