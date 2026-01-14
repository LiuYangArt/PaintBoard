/**
 * useBrushRenderer - Hook for Flow/Opacity three-level brush rendering pipeline
 *
 * This hook manages the stroke buffer and dab stamping to achieve
 * Photoshop-like brush behavior with proper Flow/Opacity separation.
 */

import { useRef, useCallback } from 'react';
import { StrokeAccumulator, BrushStamper, DabParams, MaskType } from '@/utils/strokeBuffer';
import { applyPressureCurve, PressureCurve } from '@/stores/tool';
import { HARD_BRUSH_THRESHOLD } from '@/constants';

export interface BrushRenderConfig {
  size: number;
  flow: number;
  opacity: number;
  hardness: number;
  maskType: MaskType; // Mask type: 'gaussian' or 'default'
  spacing: number;
  roundness: number; // 0-1 (1 = circle, <1 = ellipse)
  angle: number; // 0-360 degrees
  color: string;
  pressureSizeEnabled: boolean;
  pressureFlowEnabled: boolean;
  pressureOpacityEnabled: boolean;
  pressureCurve: PressureCurve;
}

export interface UseBrushRendererProps {
  width: number;
  height: number;
}

// Pressure fade-in is now handled in Rust backend (PressureSmoother)
// Frontend no longer needs its own fade-in logic

export function useBrushRenderer({ width, height }: UseBrushRendererProps) {
  const strokeBufferRef = useRef<StrokeAccumulator | null>(null);
  const stamperRef = useRef<BrushStamper>(new BrushStamper());

  // Track stroke rendering mode for endStroke and preview
  // - 'ceiling': opacity applied at dab level (hard brush OR opacity pressure enabled)
  // - 'postMultiply': opacity applied at endStroke (soft brush without opacity pressure)
  const renderModeRef = useRef<'ceiling' | 'postMultiply'>('ceiling');
  // Store the base opacity for Post-Multiply mode
  const baseOpacityRef = useRef<number>(1.0);

  // Initialize or resize stroke buffer
  const ensureStrokeBuffer = useCallback(() => {
    if (!strokeBufferRef.current) {
      strokeBufferRef.current = new StrokeAccumulator(width, height);
    } else {
      const dims = strokeBufferRef.current.getDimensions();
      if (dims.width !== width || dims.height !== height) {
        strokeBufferRef.current.resize(width, height);
      }
    }
    return strokeBufferRef.current;
  }, [width, height]);

  /**
   * Begin a new brush stroke
   */
  const beginStroke = useCallback(() => {
    const buffer = ensureStrokeBuffer();
    buffer.beginStroke();
    stamperRef.current.beginStroke();
    renderModeRef.current = 'ceiling'; // Default, will be set in processPoint
    baseOpacityRef.current = 1.0;
  }, [ensureStrokeBuffer]);

  /**
   * Process a point during stroke and render dabs to stroke buffer
   *
   * Key principle: Opacity must be applied at DAB level when pressure-sensitive.
   * This ensures each dab's transparency is determined by the pressure at that moment,
   * and earlier dabs are not affected by later pressure changes.
   */
  const processPoint = useCallback(
    (x: number, y: number, pressure: number, config: BrushRenderConfig): void => {
      const buffer = strokeBufferRef.current;
      if (!buffer || !buffer.isActive()) return;

      const stamper = stamperRef.current;

      // Apply pressure curve (fade-in already applied by backend)
      const adjustedPressure = applyPressureCurve(pressure, config.pressureCurve);

      // Calculate dynamic size for stamper spacing calculation
      const size = config.pressureSizeEnabled ? config.size * adjustedPressure : config.size;

      // Get dab positions from stamper
      const dabs = stamper.processPoint(x, y, pressure, size, config.spacing);

      // Stamp each dab to the stroke buffer
      for (const dab of dabs) {
        const dabPressure = applyPressureCurve(dab.pressure, config.pressureCurve);
        const dabSize = config.pressureSizeEnabled ? config.size * dabPressure : config.size;
        const dabFlow = config.pressureFlowEnabled ? config.flow * dabPressure : config.flow;

        const isHardBrush = config.hardness >= HARD_BRUSH_THRESHOLD;

        // Determine rendering strategy (Krita-style):
        // 1. Hard brush: use opacityCeiling (clamp max alpha, preserves solid edges)
        // 2. Soft brush + opacity pressure: use dabOpacity (multiplier, preserves gradient)
        // 3. Soft brush without opacity pressure: Post-Multiply mode
        //
        // Key insight from Krita: opacity should be a MULTIPLIER for soft brushes,
        // not a CEILING. Ceiling clips the gradient causing "flat-top" artifacts.

        const finalFlow = dabFlow;
        let ceiling: number | undefined = undefined;
        let dabOpacity: number = 1.0;

        if (isHardBrush) {
          // Hard brush: use ceiling mode (clamps alpha, preserves solid edges)
          ceiling = config.pressureOpacityEnabled ? config.opacity * dabPressure : config.opacity;
          dabOpacity = 1.0;
          renderModeRef.current = 'ceiling';
        } else if (config.pressureOpacityEnabled) {
          // Soft brush + opacity pressure: use dabOpacity as multiplier
          // This preserves the gradient while applying per-dab opacity
          ceiling = undefined;
          dabOpacity = config.opacity * dabPressure;
          renderModeRef.current = 'ceiling'; // Opacity is baked into buffer
        } else {
          // Soft brush without opacity pressure: Post-Multiply mode
          // Opacity applied at endStroke to preserve full gradient range
          ceiling = undefined;
          dabOpacity = 1.0;
          renderModeRef.current = 'postMultiply';
          baseOpacityRef.current = config.opacity;
        }

        const dabParams: DabParams = {
          x: dab.x,
          y: dab.y,
          size: Math.max(1, dabSize),
          flow: finalFlow,
          hardness: config.hardness / 100, // Convert from 0-100 to 0-1
          maskType: config.maskType,
          color: config.color,
          opacityCeiling: ceiling,
          dabOpacity, // Krita-style: multiplier for entire dab (preserves gradient)
          roundness: config.roundness / 100, // Convert from 0-100 to 0-1
          angle: config.angle,
        };

        buffer.stampDab(dabParams);
      }
    },
    []
  );

  /**
   * End stroke and composite to layer
   */
  const endStroke = useCallback((layerCtx: CanvasRenderingContext2D, opacity: number) => {
    const buffer = strokeBufferRef.current;
    if (!buffer) return;

    // Reset stamper state (no artificial fadeout - rely on natural pressure)
    stamperRef.current.finishStroke(0);

    // Determine final opacity based on render mode:
    // - Ceiling mode: opacity already baked into buffer, use 1.0
    // - Post-Multiply mode: apply opacity as multiplier
    const finalOpacity = renderModeRef.current === 'ceiling' ? 1.0 : opacity;

    buffer.endStroke(layerCtx, finalOpacity);
  }, []);

  /**
   * Get the stroke buffer canvas for preview rendering
   */
  const getPreviewCanvas = useCallback(() => {
    return strokeBufferRef.current?.getCanvas() ?? null;
  }, []);

  /**
   * Get the current preview opacity.
   * This ensures preview matches the final endStroke result exactly.
   * - Ceiling mode: returns 1.0 (opacity already in buffer)
   * - Post-Multiply mode: returns base opacity
   */
  const getPreviewOpacity = useCallback(() => {
    return renderModeRef.current === 'ceiling' ? 1.0 : baseOpacityRef.current;
  }, []);

  /**
   * Check if stroke is active
   */
  const isStrokeActive = useCallback(() => {
    return strokeBufferRef.current?.isActive() ?? false;
  }, []);

  return {
    beginStroke,
    processPoint,
    endStroke,
    getPreviewCanvas,
    getPreviewOpacity,
    isStrokeActive,
  };
}
