import { describe, it, expect, beforeEach } from 'vitest';
import { useDocumentStore } from '../document';

describe('DocumentStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useDocumentStore.getState().reset();
  });

  describe('initDocument', () => {
    it('should initialize document with given dimensions', () => {
      useDocumentStore.getState().initDocument({ width: 1920, height: 1080, dpi: 72 });

      const state = useDocumentStore.getState();
      expect(state.width).toBe(1920);
      expect(state.height).toBe(1080);
      expect(state.dpi).toBe(72);
    });

    it('should create a default background layer', () => {
      useDocumentStore.getState().initDocument({ width: 800, height: 600, dpi: 72 });

      const state = useDocumentStore.getState();
      expect(state.layers).toHaveLength(1);
      expect(state.layers[0].name).toBe('Background');
      expect(state.layers[0].type).toBe('raster');
    });

    it('should set the background layer as active', () => {
      useDocumentStore.getState().initDocument({ width: 800, height: 600, dpi: 72 });

      const state = useDocumentStore.getState();
      expect(state.activeLayerId).toBe(state.layers[0].id);
    });
  });

  describe('addLayer', () => {
    beforeEach(() => {
      useDocumentStore.getState().initDocument({ width: 800, height: 600, dpi: 72 });
    });

    it('should add a new layer', () => {
      const initialCount = useDocumentStore.getState().layers.length;

      useDocumentStore.getState().addLayer({ name: 'New Layer', type: 'raster' });

      expect(useDocumentStore.getState().layers.length).toBe(initialCount + 1);
    });

    it('should set new layer as active', () => {
      useDocumentStore.getState().addLayer({ name: 'New Layer', type: 'raster' });

      const state = useDocumentStore.getState();
      const newLayer = state.layers[state.layers.length - 1];
      expect(state.activeLayerId).toBe(newLayer.id);
    });

    it('should create layer with correct properties', () => {
      useDocumentStore.getState().addLayer({ name: 'Test Layer', type: 'raster' });

      const state = useDocumentStore.getState();
      const newLayer = state.layers[state.layers.length - 1];
      expect(newLayer.name).toBe('Test Layer');
      expect(newLayer.type).toBe('raster');
      expect(newLayer.visible).toBe(true);
      expect(newLayer.opacity).toBe(100);
      expect(newLayer.blendMode).toBe('normal');
    });
  });

  describe('removeLayer', () => {
    beforeEach(() => {
      useDocumentStore.getState().initDocument({ width: 800, height: 600, dpi: 72 });
      useDocumentStore.getState().addLayer({ name: 'Layer 1', type: 'raster' });
      useDocumentStore.getState().addLayer({ name: 'Layer 2', type: 'raster' });
    });

    it('should remove the specified layer', () => {
      const layerToRemove = useDocumentStore.getState().layers[1];
      const initialCount = useDocumentStore.getState().layers.length;

      useDocumentStore.getState().removeLayer(layerToRemove.id);

      const state = useDocumentStore.getState();
      expect(state.layers.length).toBe(initialCount - 1);
      expect(state.layers.find((l) => l.id === layerToRemove.id)).toBeUndefined();
    });

    it('should update active layer when removing active layer', () => {
      const activeId = useDocumentStore.getState().activeLayerId!;

      useDocumentStore.getState().removeLayer(activeId);

      const state = useDocumentStore.getState();
      expect(state.activeLayerId).not.toBe(activeId);
      expect(state.activeLayerId).toBeDefined();
    });
  });

  describe('toggleLayerVisibility', () => {
    beforeEach(() => {
      useDocumentStore.getState().initDocument({ width: 800, height: 600, dpi: 72 });
    });

    it('should toggle layer visibility', () => {
      const layer = useDocumentStore.getState().layers[0];

      expect(layer.visible).toBe(true);

      useDocumentStore.getState().toggleLayerVisibility(layer.id);
      expect(useDocumentStore.getState().layers[0].visible).toBe(false);

      useDocumentStore.getState().toggleLayerVisibility(layer.id);
      expect(useDocumentStore.getState().layers[0].visible).toBe(true);
    });
  });

  describe('setLayerOpacity', () => {
    beforeEach(() => {
      useDocumentStore.getState().initDocument({ width: 800, height: 600, dpi: 72 });
    });

    it('should set layer opacity', () => {
      const layer = useDocumentStore.getState().layers[0];

      useDocumentStore.getState().setLayerOpacity(layer.id, 50);

      expect(useDocumentStore.getState().layers[0].opacity).toBe(50);
    });

    it('should clamp opacity to valid range', () => {
      const layer = useDocumentStore.getState().layers[0];

      useDocumentStore.getState().setLayerOpacity(layer.id, 150);
      expect(useDocumentStore.getState().layers[0].opacity).toBe(100);

      useDocumentStore.getState().setLayerOpacity(layer.id, -10);
      expect(useDocumentStore.getState().layers[0].opacity).toBe(0);
    });
  });

  describe('moveLayer', () => {
    beforeEach(() => {
      useDocumentStore.getState().initDocument({ width: 800, height: 600, dpi: 72 });
      useDocumentStore.getState().addLayer({ name: 'Layer 1', type: 'raster' });
      useDocumentStore.getState().addLayer({ name: 'Layer 2', type: 'raster' });
    });

    it('should move layer to new position', () => {
      const layerToMove = useDocumentStore.getState().layers[2]; // Last layer

      useDocumentStore.getState().moveLayer(layerToMove.id, 0);

      expect(useDocumentStore.getState().layers[0].id).toBe(layerToMove.id);
    });
  });
});
