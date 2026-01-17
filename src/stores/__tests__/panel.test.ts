import { describe, it, expect, beforeEach } from 'vitest';
import { usePanelStore, type PanelConfig } from '../panel';

describe('PanelStore', () => {
  const testPanelConfig: PanelConfig = {
    id: 'test-panel',
    title: 'Test Panel',
    defaultGeometry: { x: 100, y: 100, width: 300, height: 400 },
    minWidth: 200,
    minHeight: 150,
    resizable: true,
    closable: true,
    minimizable: true,
  };

  beforeEach(() => {
    // Reset store before each test
    usePanelStore.setState({
      configs: {},
      panels: {},
      activeId: null,
      maxZIndex: 100,
    });
  });

  describe('registerPanel', () => {
    it('should register a new panel with config', () => {
      const store = usePanelStore.getState();

      store.registerPanel(testPanelConfig);

      const state = usePanelStore.getState();
      expect(state.configs['test-panel']).toBeDefined();
      expect(state.panels['test-panel']).toBeDefined();
    });

    it('should initialize panel with default geometry', () => {
      const store = usePanelStore.getState();

      store.registerPanel(testPanelConfig);

      const panel = usePanelStore.getState().panels['test-panel'];
      expect(panel?.x).toBe(100);
      expect(panel?.y).toBe(100);
      expect(panel?.width).toBe(300);
      expect(panel?.height).toBe(400);
    });

    it('should set panel as open by default', () => {
      const store = usePanelStore.getState();

      store.registerPanel(testPanelConfig);

      const panel = usePanelStore.getState().panels['test-panel'];
      expect(panel?.isOpen).toBe(true);
      expect(panel?.isCollapsed).toBe(false);
    });

    it('should assign z-index on registration', () => {
      const store = usePanelStore.getState();

      store.registerPanel(testPanelConfig);

      const panel = usePanelStore.getState().panels['test-panel'];
      expect(panel?.zIndex).toBeGreaterThan(100);
    });

    it('should preserve existing panel state on re-registration', () => {
      const store = usePanelStore.getState();

      store.registerPanel(testPanelConfig);
      store.updateGeometry('test-panel', { x: 200, y: 200 });

      // Re-register
      store.registerPanel(testPanelConfig);

      const panel = usePanelStore.getState().panels['test-panel'];
      expect(panel?.x).toBe(200);
      expect(panel?.y).toBe(200);
    });
  });

  describe('openPanel', () => {
    beforeEach(() => {
      usePanelStore.getState().registerPanel(testPanelConfig);
      usePanelStore.getState().closePanel('test-panel');
    });

    it('should open a closed panel', () => {
      const store = usePanelStore.getState();

      store.openPanel('test-panel');

      expect(usePanelStore.getState().panels['test-panel']?.isOpen).toBe(true);
    });

    it('should bring panel to front', () => {
      const store = usePanelStore.getState();
      const initialZIndex = usePanelStore.getState().panels['test-panel']?.zIndex ?? 0;

      store.openPanel('test-panel');

      expect(usePanelStore.getState().panels['test-panel']?.zIndex).toBeGreaterThan(initialZIndex);
    });

    it('should set panel as active', () => {
      const store = usePanelStore.getState();

      store.openPanel('test-panel');

      expect(usePanelStore.getState().activeId).toBe('test-panel');
    });
  });

  describe('closePanel', () => {
    beforeEach(() => {
      usePanelStore.getState().registerPanel(testPanelConfig);
    });

    it('should close an open panel', () => {
      const store = usePanelStore.getState();

      store.closePanel('test-panel');

      expect(usePanelStore.getState().panels['test-panel']?.isOpen).toBe(false);
    });
  });

  describe('togglePanel', () => {
    beforeEach(() => {
      usePanelStore.getState().registerPanel(testPanelConfig);
    });

    it('should close an open panel', () => {
      const store = usePanelStore.getState();
      expect(usePanelStore.getState().panels['test-panel']?.isOpen).toBe(true);

      store.togglePanel('test-panel');

      expect(usePanelStore.getState().panels['test-panel']?.isOpen).toBe(false);
    });

    it('should open a closed panel', () => {
      const store = usePanelStore.getState();
      store.closePanel('test-panel');

      store.togglePanel('test-panel');

      expect(usePanelStore.getState().panels['test-panel']?.isOpen).toBe(true);
    });
  });

  describe('minimizePanel', () => {
    beforeEach(() => {
      usePanelStore.getState().registerPanel(testPanelConfig);
    });

    it('should toggle collapsed state', () => {
      const store = usePanelStore.getState();

      store.minimizePanel('test-panel');
      expect(usePanelStore.getState().panels['test-panel']?.isCollapsed).toBe(true);

      store.minimizePanel('test-panel');
      expect(usePanelStore.getState().panels['test-panel']?.isCollapsed).toBe(false);
    });

    it('should set specific collapsed state when provided', () => {
      const store = usePanelStore.getState();

      store.minimizePanel('test-panel', true);
      expect(usePanelStore.getState().panels['test-panel']?.isCollapsed).toBe(true);

      store.minimizePanel('test-panel', false);
      expect(usePanelStore.getState().panels['test-panel']?.isCollapsed).toBe(false);
    });
  });

  describe('updateGeometry', () => {
    beforeEach(() => {
      usePanelStore.getState().registerPanel(testPanelConfig);
    });

    it('should update panel position', () => {
      const store = usePanelStore.getState();

      store.updateGeometry('test-panel', { x: 500, y: 600 });

      const panel = usePanelStore.getState().panels['test-panel'];
      expect(panel?.x).toBe(500);
      expect(panel?.y).toBe(600);
    });

    it('should update panel size', () => {
      const store = usePanelStore.getState();

      store.updateGeometry('test-panel', { width: 400, height: 500 });

      const panel = usePanelStore.getState().panels['test-panel'];
      expect(panel?.width).toBe(400);
      expect(panel?.height).toBe(500);
    });

    it('should support partial updates', () => {
      const store = usePanelStore.getState();

      store.updateGeometry('test-panel', { x: 200 });

      const panel = usePanelStore.getState().panels['test-panel'];
      expect(panel?.x).toBe(200);
      expect(panel?.y).toBe(100); // unchanged
    });
  });

  describe('bringToFront', () => {
    it('should increase z-index', () => {
      const store = usePanelStore.getState();
      store.registerPanel(testPanelConfig);

      const initialZIndex = usePanelStore.getState().panels['test-panel']?.zIndex ?? 0;

      store.bringToFront('test-panel');

      expect(usePanelStore.getState().panels['test-panel']?.zIndex).toBeGreaterThan(initialZIndex);
    });

    it('should set as active panel', () => {
      const store = usePanelStore.getState();
      store.registerPanel(testPanelConfig);

      store.bringToFront('test-panel');

      expect(usePanelStore.getState().activeId).toBe('test-panel');
    });

    it('should handle multiple panels correctly', () => {
      const store = usePanelStore.getState();
      store.registerPanel(testPanelConfig);
      store.registerPanel({
        ...testPanelConfig,
        id: 'second-panel',
        title: 'Second Panel',
      });

      store.bringToFront('test-panel');
      const zIndex1 = usePanelStore.getState().panels['test-panel']?.zIndex ?? 0;

      store.bringToFront('second-panel');
      const zIndex2 = usePanelStore.getState().panels['second-panel']?.zIndex ?? 0;

      expect(zIndex2).toBeGreaterThan(zIndex1);
    });
  });
});
