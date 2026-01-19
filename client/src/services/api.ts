import axios from 'axios';
import { FolderNode, FileNode, Page, CommitInfo, VersionContent } from '../types';

const API_BASE = '/api';

// Enable cookies for session authentication
axios.defaults.withCredentials = true;

export const api = {
  // Auth operations
  checkAuthStatus: async (): Promise<{ authEnabled: boolean; authenticated: boolean }> => {
    const response = await axios.get(`${API_BASE}/auth/status`);
    return response.data;
  },

  login: async (password: string): Promise<void> => {
    await axios.post(`${API_BASE}/auth/login`, { password });
  },

  logout: async (): Promise<void> => {
    await axios.post(`${API_BASE}/auth/logout`);
  },

  // Folder operations
  getFolderTree: async (): Promise<FolderNode> => {
    const response = await axios.get(`${API_BASE}/folders`);
    return response.data;
  },

  createFolder: async (path: string): Promise<void> => {
    await axios.post(`${API_BASE}/folders`, { path });
  },

  deleteFolder: async (path: string): Promise<void> => {
    await axios.delete(`${API_BASE}/folders/${path}`);
  },

  renameFolder: async (oldPath: string, newPath: string): Promise<void> => {
    await axios.put(`${API_BASE}/folders/rename`, { oldPath, newPath });
  },

  // Page operations
  getPages: async (folder?: string): Promise<FileNode[]> => {
    const response = await axios.get(`${API_BASE}/pages`, {
      params: folder ? { folder } : {},
    });
    return response.data;
  },

  getPage: async (path: string): Promise<Page> => {
    const response = await axios.get(`${API_BASE}/pages/${path}`);
    return response.data;
  },

  createPage: async (path: string, content: string = ''): Promise<void> => {
    await axios.post(`${API_BASE}/pages`, { path, content });
  },

  updatePage: async (path: string, content: string): Promise<void> => {
    await axios.put(`${API_BASE}/pages/${path}`, { content });
  },

  deletePage: async (path: string): Promise<void> => {
    await axios.delete(`${API_BASE}/pages/${path}`);
  },

  renamePage: async (oldPath: string, newPath: string): Promise<void> => {
    await axios.put(`${API_BASE}/pages/rename/file`, { oldPath, newPath });
  },

  movePage: async (oldPath: string, newFolderPath: string): Promise<{ newPath: string }> => {
    const response = await axios.put(`${API_BASE}/pages/move`, { oldPath, newFolderPath });
    return response.data;
  },

  // Version history operations
  getPageHistory: async (path: string): Promise<CommitInfo[]> => {
    const response = await axios.get(`${API_BASE}/pages/${path}/history`);
    return response.data;
  },

  getPageVersion: async (path: string, hash: string): Promise<VersionContent> => {
    const response = await axios.get(`${API_BASE}/pages/${path}/versions/${hash}`);
    return response.data;
  },

  restorePageVersion: async (path: string, hash: string): Promise<void> => {
    await axios.post(`${API_BASE}/pages/${path}/restore/${hash}`);
  },
};
