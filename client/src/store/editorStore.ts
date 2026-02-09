import { create } from 'zustand';

interface EditorState {
  // Content state
  content: string;
  setContent: (content: string) => void;

  // Scroll sync state
  scrollSource: 'editor' | 'preview' | null;
  editorScrollPercent: number;
  previewScrollPercent: number;

  scrollEditor: (percent: number) => void;
  scrollPreview: (percent: number) => void;
  clearScrollSource: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  // Content
  content: '',
  setContent: (content) => set({ content }),

  // Scroll sync
  scrollSource: null,
  editorScrollPercent: 0,
  previewScrollPercent: 0,

  scrollEditor: (percent) =>
    set({
      scrollSource: 'editor',
      editorScrollPercent: percent,
    }),

  scrollPreview: (percent) =>
    set({
      scrollSource: 'preview',
      previewScrollPercent: percent,
    }),

  clearScrollSource: () => set({ scrollSource: null }),
}));
