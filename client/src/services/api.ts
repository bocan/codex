import axios from "axios";
import {
  FolderNode,
  FileNode,
  Page,
  CommitInfo,
  VersionContent,
  SearchResult,
  TemplateDefinition,
  ChatMessage,
  AIConfig,
} from "../types";

const API_BASE = "/api";

// Enable cookies for session authentication
axios.defaults.withCredentials = true;

// Add response interceptor to handle 401 unauthorized
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // If we get a 401 (unauthorized), the session has expired
    if (error.response?.status === 401) {
      // Reload the page to trigger login flow
      window.location.reload();
    }
    return Promise.reject(error);
  },
);

export const api = {
  // Auth operations
  checkAuthStatus: async (): Promise<{
    authEnabled: boolean;
    authenticated: boolean;
  }> => {
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

  moveFolder: async (sourcePath: string, destinationParentPath: string): Promise<string> => {
    const response = await axios.put(`${API_BASE}/folders/move`, { sourcePath, destinationParentPath });
    return response.data.newPath;
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

  createPage: async (path: string, content: string = ""): Promise<void> => {
    await axios.post(`${API_BASE}/pages`, { path, content });
  },

  // Template operations
  getTemplates: async (): Promise<TemplateDefinition[]> => {
    const response = await axios.get(`${API_BASE}/templates`);
    return response.data;
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

  movePage: async (
    oldPath: string,
    newFolderPath: string,
  ): Promise<{ newPath: string }> => {
    const response = await axios.put(`${API_BASE}/pages/move`, {
      oldPath,
      newFolderPath,
    });
    return response.data;
  },

  // Version history operations
  getPageHistory: async (path: string): Promise<CommitInfo[]> => {
    const response = await axios.get(`${API_BASE}/pages/${path}/history`);
    return response.data;
  },

  getPageVersion: async (
    path: string,
    hash: string,
  ): Promise<VersionContent> => {
    const response = await axios.get(
      `${API_BASE}/pages/${path}/versions/${hash}`,
    );
    return response.data;
  },

  restorePageVersion: async (path: string, hash: string): Promise<void> => {
    await axios.post(`${API_BASE}/pages/${path}/restore/${hash}`);
  },

  // Search operations
  search: async (query: string): Promise<SearchResult[]> => {
    const response = await axios.get(`${API_BASE}/search`, {
      params: { q: query },
    });
    return response.data;
  },

  // Attachment operations
  uploadAttachment: async (folderPath: string, file: File): Promise<void> => {
    const formData = new FormData();
    formData.append("file", file);
    await axios.post(`${API_BASE}/attachments`, formData, {
      params: { folder: folderPath },
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  getAttachments: async (folderPath: string): Promise<unknown[]> => {
    const response = await axios.get(`${API_BASE}/attachments`, {
      params: { folder: folderPath },
    });
    return response.data;
  },

  deleteAttachment: async (
    folderPath: string,
    filename: string,
  ): Promise<void> => {
    await axios.delete(`${API_BASE}/attachments/${filename}`, {
      params: { folder: folderPath },
    });
  },

  getAttachmentUrl: (folderPath: string, filename: string): string => {
    const params = new URLSearchParams({ folder: folderPath });
    return `${API_BASE}/attachments/${encodeURIComponent(filename)}?${params}`;
  },

  // AI Chat operations
  streamChat: async (
    config: AIConfig,
    messages: ChatMessage[],
    documentContext: string | undefined,
    onText: (text: string) => void,
    onError: (error: string) => void,
    onDone: () => void,
    signal?: AbortSignal,
    onThinking?: (text: string) => void,
    onThinkingDone?: () => void,
    onUsage?: (inputTokens: number, outputTokens: number) => void,
    systemPrompt?: string
  ): Promise<void> => {
    let doneHandled = false;
    
    const handleDone = () => {
      if (!doneHandled) {
        doneHandled = true;
        onDone();
      }
    };
    
    try {
      const response = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config, messages, documentContext, systemPrompt }),
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        onError(errorText || 'Failed to connect to AI');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError('No response body');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (data.type) {
                case 'text':
                  onText(data.content);
                  break;
                case 'thinking':
                  onThinking?.(data.content);
                  break;
                case 'thinking_done':
                  onThinkingDone?.();
                  break;
                case 'usage':
                  onUsage?.(data.inputTokens, data.outputTokens);
                  break;
                case 'done':
                  handleDone();
                  return;
                case 'error':
                  onError(data.error);
                  return;
                default:
                  // Legacy format support
                  if (data.error) {
                    onError(data.error);
                    return;
                  }
                  if (data.done) {
                    handleDone();
                    return;
                  }
                  if (data.text) {
                    onText(data.text);
                  }
              }
            } catch {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      }

      handleDone();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        handleDone();
      } else {
        onError(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  },

  getOllamaModels: async (host: string, port: number): Promise<string[]> => {
    const response = await axios.get(`${API_BASE}/ai/ollama/models`, {
      params: { host, port },
    });
    return response.data.models || [];
  },

  testOllamaConnection: async (host: string, port: number): Promise<boolean> => {
    const response = await axios.get(`${API_BASE}/ai/ollama/test`, {
      params: { host, port },
    });
    return response.data.success;
  },
};
