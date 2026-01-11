import { create } from 'zustand';

interface ViewportState {
  // Transform state
  scale: number;
  offsetX: number;
  offsetY: number;

  // Interaction state
  isPanning: boolean;

  // Constraints
  minScale: number;
  maxScale: number;

  // Actions
  setScale: (scale: number, centerX?: number, centerY?: number) => void;
  zoomIn: (centerX?: number, centerY?: number) => void;
  zoomOut: (centerX?: number, centerY?: number) => void;
  zoomToFit: (
    canvasWidth: number,
    canvasHeight: number,
    viewportWidth: number,
    viewportHeight: number
  ) => void;
  resetZoom: () => void;
  setOffset: (x: number, y: number) => void;
  pan: (deltaX: number, deltaY: number) => void;
  setIsPanning: (isPanning: boolean) => void;
}

const ZOOM_STEP = 1.2;
const MIN_SCALE = 0.1;
const MAX_SCALE = 32;

export const useViewportStore = create<ViewportState>((set, get) => ({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  isPanning: false,
  minScale: MIN_SCALE,
  maxScale: MAX_SCALE,

  setScale: (newScale, centerX, centerY) => {
    const { scale, offsetX, offsetY, minScale, maxScale } = get();
    const clampedScale = Math.max(minScale, Math.min(maxScale, newScale));

    if (clampedScale === scale) return;

    // If center point provided, zoom around that point
    if (centerX !== undefined && centerY !== undefined) {
      const scaleRatio = clampedScale / scale;
      const newOffsetX = centerX - (centerX - offsetX) * scaleRatio;
      const newOffsetY = centerY - (centerY - offsetY) * scaleRatio;
      set({ scale: clampedScale, offsetX: newOffsetX, offsetY: newOffsetY });
    } else {
      set({ scale: clampedScale });
    }
  },

  zoomIn: (centerX, centerY) => {
    const { scale, maxScale } = get();
    const newScale = Math.min(maxScale, scale * ZOOM_STEP);
    get().setScale(newScale, centerX, centerY);
  },

  zoomOut: (centerX, centerY) => {
    const { scale, minScale } = get();
    const newScale = Math.max(minScale, scale / ZOOM_STEP);
    get().setScale(newScale, centerX, centerY);
  },

  zoomToFit: (canvasWidth, canvasHeight, viewportWidth, viewportHeight) => {
    const padding = 40;
    const availableWidth = viewportWidth - padding * 2;
    const availableHeight = viewportHeight - padding * 2;

    const scaleX = availableWidth / canvasWidth;
    const scaleY = availableHeight / canvasHeight;
    const newScale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%

    // Center the canvas
    const offsetX = (viewportWidth - canvasWidth * newScale) / 2;
    const offsetY = (viewportHeight - canvasHeight * newScale) / 2;

    set({ scale: newScale, offsetX, offsetY });
  },

  resetZoom: () => set({ scale: 1, offsetX: 0, offsetY: 0 }),

  setOffset: (x, y) => set({ offsetX: x, offsetY: y }),

  pan: (deltaX, deltaY) =>
    set((state) => ({
      offsetX: state.offsetX + deltaX,
      offsetY: state.offsetY + deltaY,
    })),

  setIsPanning: (isPanning) => set({ isPanning }),
}));
