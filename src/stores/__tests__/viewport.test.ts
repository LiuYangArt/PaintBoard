import { describe, it, expect, beforeEach } from 'vitest';
import { useViewportStore } from '../viewport';

describe('ViewportStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useViewportStore.setState({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      isPanning: false,
    });
  });

  describe('setScale', () => {
    it('should set scale within valid range', () => {
      const store = useViewportStore.getState();

      store.setScale(2);
      expect(useViewportStore.getState().scale).toBe(2);

      store.setScale(0.5);
      expect(useViewportStore.getState().scale).toBe(0.5);
    });

    it('should clamp scale to min/max', () => {
      const store = useViewportStore.getState();

      store.setScale(0.01); // Below min (0.1)
      expect(useViewportStore.getState().scale).toBe(0.1);

      store.setScale(100); // Above max (32)
      expect(useViewportStore.getState().scale).toBe(32);
    });

    it('should zoom around center point when provided', () => {
      const store = useViewportStore.getState();
      store.setScale(1);
      store.setOffset(0, 0);

      // Zoom in 2x around point (100, 100)
      store.setScale(2, 100, 100);

      const state = useViewportStore.getState();
      expect(state.scale).toBe(2);
      // The offset should adjust to keep (100, 100) stationary
      expect(state.offsetX).toBe(-100);
      expect(state.offsetY).toBe(-100);
    });

    it('should not update if scale is unchanged', () => {
      const store = useViewportStore.getState();
      store.setScale(1);
      store.setOffset(50, 50);

      store.setScale(1, 100, 100);

      // Offset should remain unchanged
      expect(useViewportStore.getState().offsetX).toBe(50);
      expect(useViewportStore.getState().offsetY).toBe(50);
    });
  });

  describe('zoomIn', () => {
    it('should increase scale by zoom step', () => {
      const store = useViewportStore.getState();

      store.zoomIn();

      expect(useViewportStore.getState().scale).toBeGreaterThan(1);
    });

    it('should not exceed max scale', () => {
      const store = useViewportStore.getState();
      store.setScale(32);

      store.zoomIn();

      expect(useViewportStore.getState().scale).toBe(32);
    });
  });

  describe('zoomOut', () => {
    it('should decrease scale by zoom step', () => {
      const store = useViewportStore.getState();

      store.zoomOut();

      expect(useViewportStore.getState().scale).toBeLessThan(1);
    });

    it('should not go below min scale', () => {
      const store = useViewportStore.getState();
      store.setScale(0.1);

      store.zoomOut();

      expect(useViewportStore.getState().scale).toBe(0.1);
    });
  });

  describe('zoomToFit', () => {
    it('should fit canvas within viewport', () => {
      const store = useViewportStore.getState();

      // Canvas 1000x1000, viewport 500x500 (needs to scale down)
      store.zoomToFit(1000, 1000, 500, 500);

      const state = useViewportStore.getState();
      // Scale should be less than 1 to fit large canvas in small viewport
      expect(state.scale).toBeLessThan(1);
      expect(state.scale).toBeGreaterThan(0);
    });

    it('should not zoom beyond 100% for small canvas', () => {
      const store = useViewportStore.getState();

      // Small canvas 100x100, large viewport 1000x1000
      store.zoomToFit(100, 100, 1000, 1000);

      const state = useViewportStore.getState();
      // Should not zoom in beyond 100%
      expect(state.scale).toBeLessThanOrEqual(1);
    });

    it('should center the canvas', () => {
      const store = useViewportStore.getState();

      store.zoomToFit(100, 100, 500, 500);

      const state = useViewportStore.getState();
      // Offsets should center the canvas
      expect(state.offsetX).toBeGreaterThan(0);
      expect(state.offsetY).toBeGreaterThan(0);
    });
  });

  describe('resetZoom', () => {
    it('should reset to default state', () => {
      const store = useViewportStore.getState();
      store.setScale(2);
      store.setOffset(100, 200);

      store.resetZoom();

      const state = useViewportStore.getState();
      expect(state.scale).toBe(1);
      expect(state.offsetX).toBe(0);
      expect(state.offsetY).toBe(0);
    });
  });

  describe('pan', () => {
    it('should update offset by delta', () => {
      const store = useViewportStore.getState();
      store.setOffset(0, 0);

      store.pan(50, 100);

      const state = useViewportStore.getState();
      expect(state.offsetX).toBe(50);
      expect(state.offsetY).toBe(100);
    });

    it('should accumulate pan movements', () => {
      const store = useViewportStore.getState();
      store.setOffset(0, 0);

      store.pan(50, 50);
      store.pan(25, 25);

      const state = useViewportStore.getState();
      expect(state.offsetX).toBe(75);
      expect(state.offsetY).toBe(75);
    });
  });

  describe('setIsPanning', () => {
    it('should set panning state', () => {
      const store = useViewportStore.getState();

      store.setIsPanning(true);
      expect(useViewportStore.getState().isPanning).toBe(true);

      store.setIsPanning(false);
      expect(useViewportStore.getState().isPanning).toBe(false);
    });
  });
});
