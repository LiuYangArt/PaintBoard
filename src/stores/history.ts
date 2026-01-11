import { create } from 'zustand';

/**
 * History entry representing a canvas state snapshot
 */
interface HistoryEntry {
  imageData: ImageData;
  timestamp: number;
}

interface HistoryState {
  // History stack
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  maxHistorySize: number;

  // Actions
  pushState: (imageData: ImageData) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  maxHistorySize: 50,

  pushState: (imageData: ImageData) => {
    const { undoStack, maxHistorySize } = get();

    // Clone ImageData to avoid reference issues
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.putImageData(imageData, 0, 0);
    const clonedData = ctx.getImageData(0, 0, imageData.width, imageData.height);

    const newEntry: HistoryEntry = {
      imageData: clonedData,
      timestamp: Date.now(),
    };

    // Add to undo stack, clear redo stack
    const newUndoStack = [...undoStack, newEntry];

    // Limit history size
    if (newUndoStack.length > maxHistorySize) {
      newUndoStack.shift();
    }

    set({
      undoStack: newUndoStack,
      redoStack: [], // Clear redo stack on new action
    });
  },

  undo: () => {
    const { undoStack, redoStack } = get();

    if (undoStack.length < 2) {
      // Need at least 2 entries: one to restore, one to move to redo
      return null;
    }

    // Pop current state and move to redo
    const currentState = undoStack[undoStack.length - 1];
    const previousState = undoStack[undoStack.length - 2];

    if (!currentState || !previousState) return null;

    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, currentState],
    });

    return previousState;
  },

  redo: () => {
    const { undoStack, redoStack } = get();

    if (redoStack.length === 0) {
      return null;
    }

    const nextState = redoStack[redoStack.length - 1];
    if (!nextState) return null;

    set({
      undoStack: [...undoStack, nextState],
      redoStack: redoStack.slice(0, -1),
    });

    return nextState;
  },

  canUndo: () => {
    return get().undoStack.length >= 2;
  },

  canRedo: () => {
    return get().redoStack.length > 0;
  },

  clear: () => {
    set({
      undoStack: [],
      redoStack: [],
    });
  },
}));
