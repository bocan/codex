export interface FolderNode {
  name: string;
  path: string;
  type: "folder";
  children: FolderNode[];
}

export interface FileNode {
  name: string;
  path: string;
  type: "file";
  createdAt: string;
  modifiedAt: string;
}

export interface Page {
  path: string;
  content: string;
}

export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export interface VersionContent {
  hash: string;
  content: string;
  date: string;
  message: string;
  author: string;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  matches: number;
}

export interface TemplateDefinition {
  path: string;
  template: string;
  autoname: boolean;
  content: string;
}
