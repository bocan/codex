import React, { useState, useEffect, useRef, useMemo } from "react";
import { FolderNode } from "../types";
import { api } from "../services/api";
import "./FolderTree.css";

interface FolderTreeProps {
  node: FolderNode;
  onSelectFolder: (path: string) => void;
  selectedFolder: string | null;
  onRefresh: () => void;
  expandedFolders?: Set<string>;
  keyboardSelectedPath?: string | null;
  onFolderHover?: (path: string) => void;
}

const FolderTreeItem: React.FC<FolderTreeProps> = ({
  node,
  onSelectFolder,
  selectedFolder,
  onRefresh,
  expandedFolders,
  keyboardSelectedPath,
  onFolderHover,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const isSelected = selectedFolder === node.path;
  const isKeyboardSelected = keyboardSelectedPath === node.path;
  const hasChildren = node.children.length > 0;
  const isBusy = isCreating || isDeleting;

  // Sync with parent's expanded state if provided
  useEffect(() => {
    if (expandedFolders) {
      setIsExpanded(expandedFolders.has(node.path));
    }
  }, [expandedFolders, node.path]);

  // Close context menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!showContextMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(event.target as Node)
      ) {
        setShowContextMenu(false);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowContextMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscapeKey);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [showContextMenu]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleSelect = () => {
    onSelectFolder(node.path);
  };

  const handleCreateFolder = async () => {
    const folderName = prompt("Enter folder name:");
    if (folderName) {
      setIsCreating(true);
      setShowContextMenu(false);
      try {
        const newPath =
          node.path === "/" ? folderName : `${node.path}/${folderName}`;
        await api.createFolder(newPath);
        onRefresh();
      } catch (err) {
        console.error("Failed to create folder:", err);
        // Show inline error feedback
      } finally {
        setIsCreating(false);
      }
    } else {
      setShowContextMenu(false);
    }
  };

  const handleRename = () => {
    setIsRenaming(true);
    setShowContextMenu(false);
  };

  const handleRenameSubmit = async () => {
    if (newName && newName !== node.name) {
      try {
        const parentPath = node.path.split("/").slice(0, -1).join("/");
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;
        await api.renameFolder(node.path, newPath);
        onRefresh();
      } catch (err) {
        console.error("Failed to rename folder:", err);
        setNewName(node.name); // Reset to original
      }
    }
    setIsRenaming(false);
  };

  const handleDelete = async () => {
    if (confirm(`Delete folder "${node.name}" and all its contents?`)) {
      setIsDeleting(true);
      setShowContextMenu(false);
      try {
        await api.deleteFolder(node.path);
        onRefresh();
      } catch (err) {
        console.error("Failed to delete folder:", err);
      } finally {
        setIsDeleting(false);
      }
    } else {
      setShowContextMenu(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu(!showContextMenu);
  };

  return (
    <div
      className="folder-tree-item"
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
    >
      <div
        className={`folder-item ${isSelected ? "selected" : ""} ${isKeyboardSelected ? "keyboard-selected" : ""} ${isBusy ? "busy" : ""}`}
        onClick={handleSelect}
        onContextMenu={(e) => !isBusy && handleContextMenu(e)}
        onMouseEnter={() => onFolderHover?.(node.path)}
        role="button"
        tabIndex={-1}
        aria-label={`Folder: ${node.name}${isSelected ? " (selected)" : ""}`}
        aria-busy={isBusy}
      >
        <button
          className="folder-toggle"
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          aria-label={
            hasChildren
              ? isExpanded
                ? "Collapse folder"
                : "Expand folder"
              : undefined
          }
          aria-hidden={!hasChildren}
          tabIndex={hasChildren ? 0 : -1}
        >
          <span aria-hidden="true">
            {hasChildren && (isExpanded ? "▼" : "▶")}
            {!hasChildren && (
              <span style={{ width: "12px", display: "inline-block" }}></span>
            )}
          </span>
        </button>
        {isRenaming ? (
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            aria-label="Rename folder"
          />
        ) : (
          <span className="folder-name">
            <span aria-hidden="true">{isDeleting ? "⏳" : "📁"}</span>{" "}
            {node.name}
            {isCreating && (
              <span
                className="folder-creating"
                role="status"
                aria-live="polite"
              >
                {" "}
                (creating...)
              </span>
            )}
          </span>
        )}
        {showContextMenu && !isBusy && (
          <div
            className="context-menu"
            ref={contextMenuRef}
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Folder actions"
          >
            <button
              onClick={handleCreateFolder}
              disabled={isCreating}
              role="menuitem"
              aria-label="Create new folder"
            >
              {isCreating ? "Creating..." : "New Folder"}
            </button>
            {node.path !== "/" && (
              <>
                <button
                  onClick={handleRename}
                  role="menuitem"
                  aria-label={`Rename ${node.name}`}
                >
                  Rename
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  role="menuitem"
                  aria-label={`Delete ${node.name}`}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div className="folder-children" role="group">
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.path}
              node={child}
              onSelectFolder={onSelectFolder}
              selectedFolder={selectedFolder}
              onRefresh={onRefresh}
              expandedFolders={expandedFolders}
              keyboardSelectedPath={keyboardSelectedPath}
              onFolderHover={onFolderHover}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FolderTree: React.FC<
  Omit<FolderTreeProps, "node"> & { root: FolderNode }
> = ({ root, onSelectFolder, selectedFolder, onRefresh }) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([root.path]));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [keyboardSelectedPath, setKeyboardSelectedPath] = useState<string | null>(root.path);
  const treeRef = useRef<HTMLElement>(null);

  // Flatten visible folders for keyboard navigation
  const visibleFolders = useMemo(() => {
    const folders: string[] = [];
    const traverse = (node: FolderNode) => {
      folders.push(node.path);
      if (expandedFolders.has(node.path)) {
        node.children.forEach(traverse);
      }
    };
    traverse(root);
    return folders;
  }, [root, expandedFolders]);

  // Track expanded folders
  useEffect(() => {
    const getAllFolderPaths = (node: FolderNode): string[] => {
      return [node.path, ...node.children.flatMap(getAllFolderPaths)];
    };
    // Auto-expand all folders by default
    setExpandedFolders(new Set(getAllFolderPaths(root)));
  }, [root]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!treeRef.current?.contains(document.activeElement)) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const newIndex = Math.min(selectedIndex + 1, visibleFolders.length - 1);
        setSelectedIndex(newIndex);
        setKeyboardSelectedPath(visibleFolders[newIndex]);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const newIndex = Math.max(selectedIndex - 1, 0);
        setSelectedIndex(newIndex);
        setKeyboardSelectedPath(visibleFolders[newIndex]);
      } else if (e.key === "Enter" && keyboardSelectedPath) {
        e.preventDefault();
        onSelectFolder(keyboardSelectedPath);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, visibleFolders, keyboardSelectedPath, onSelectFolder]);

  const handleFolderHover = (path: string) => {
    const index = visibleFolders.indexOf(path);
    if (index !== -1) {
      setSelectedIndex(index);
      setKeyboardSelectedPath(path);
    }
  };

  return (
    <nav
      ref={treeRef}
      className="folder-tree"
      aria-label="Folder navigation tree"
      role="tree"
      tabIndex={0}
    >
      <div className="folder-tree-header">
        <h3>Folders</h3>
        <button
          onClick={onRefresh}
          className="refresh-btn"
          aria-label="Refresh folders"
          title="Refresh folders"
        >
          <span aria-hidden="true">↻</span>
        </button>
      </div>
      <FolderTreeItem
        node={root}
        onSelectFolder={onSelectFolder}
        selectedFolder={selectedFolder}
        onRefresh={onRefresh}
        expandedFolders={expandedFolders}
        keyboardSelectedPath={keyboardSelectedPath}
        onFolderHover={handleFolderHover}
      />
    </nav>
  );
};
