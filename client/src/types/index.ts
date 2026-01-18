export interface FolderNode {
  name: string;
  path: string;
  type: 'folder';
  children: FolderNode[];
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file';
}

export interface Page {
  path: string;
  content: string;
}
