import React, { useState } from 'react';
import { FolderNode } from '../types';
import { api } from '../services/api';
import './FolderTree.css';

interface FolderTreeProps {
  node: FolderNode;
  onSelectFolder: (path: string) => void;
  selectedFolder: string | null;
  onRefresh: () => void;
}

const FolderTreeItem: React.FC<FolderTreeProps> = ({ node, onSelectFolder, selectedFolder, onRefresh }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isSelected = selectedFolder === node.path;
  const hasChildren = node.children.length > 0;
  const isBusy = isCreating || isDeleting;

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleSelect = () => {
    onSelectFolder(node.path);
  };

  const handleCreateFolder = async () => {
    const folderName = prompt('Enter folder name:');
    if (folderName) {
      setIsCreating(true);
      setShowContextMenu(false);
      try {
        const newPath = node.path === '/' ? folderName : `${node.path}/${folderName}`;
        await api.createFolder(newPath);
        onRefresh();
      } catch (err) {
        console.error('Failed to create folder:', err);
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
        const parentPath = node.path.split('/').slice(0, -1).join('/');
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;
        await api.renameFolder(node.path, newPath);
        onRefresh();
      } catch (err) {
        console.error('Failed to rename folder:', err);
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
        console.error('Failed to delete folder:', err);
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
    <div className="folder-tree-item">
      <div
        className={`folder-item ${isSelected ? 'selected' : ''} ${isBusy ? 'busy' : ''}`}
        onClick={handleSelect}
        onContextMenu={(e) => !isBusy && handleContextMenu(e)}
      >
        <span className="folder-toggle" onClick={(e) => { e.stopPropagation(); handleToggle(); }}>
          {hasChildren && (isExpanded ? '▼' : '▶')}
          {!hasChildren && <span style={{ width: '12px', display: 'inline-block' }}></span>}
        </span>
        {isRenaming ? (
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span className="folder-name">
            {isDeleting ? '⏳' : '📁'} {node.name}
            {isCreating && <span className="folder-creating"> (creating...)</span>}
          </span>
        )}
        {showContextMenu && !isBusy && (
          <div className="context-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleCreateFolder} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'New Folder'}
            </button>
            {node.path !== '/' && (
              <>
                <button onClick={handleRename}>Rename</button>
                <button onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div className="folder-children">
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.path}
              node={child}
              onSelectFolder={onSelectFolder}
              selectedFolder={selectedFolder}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FolderTree: React.FC<Omit<FolderTreeProps, 'node'> & { root: FolderNode }> = ({
  root,
  onSelectFolder,
  selectedFolder,
  onRefresh,
}) => {
  return (
    <div className="folder-tree">
      <div className="folder-tree-header">
        <h3>Folders</h3>
        <button onClick={onRefresh} className="refresh-btn">↻</button>
      </div>
      <FolderTreeItem
        node={root}
        onSelectFolder={onSelectFolder}
        selectedFolder={selectedFolder}
        onRefresh={onRefresh}
      />
    </div>
  );
};
