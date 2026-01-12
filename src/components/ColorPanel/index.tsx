import { SaturationSquare } from './SaturationSquare';
import { useToolStore } from '@/stores/tool';
import { useState, useEffect, useCallback } from 'react';
import { hexToHsva, hsvaToHex } from '@/utils/colorUtils';
import { VerticalHueSlider } from './VerticalHueSlider';
import './ColorPanel.css';

export function ColorPanel() {
  const { brushColor, setBrushColor } = useToolStore();

  // Use HSVA locally to control Saturation and Hue separately
  const [hsva, setHsva] = useState(() => hexToHsva(brushColor));

  // Also keep hex input synced
  const [hexInput, setHexInput] = useState(brushColor.replace('#', ''));

  // When store changes (e.g. undo/eyedropper), sync local state
  useEffect(() => {
    // Only update if significantly different to allow fractional edits?
    // Actually, store is the source of truth.
    const newHsva = hexToHsva(brushColor);
    // Simple check to avoid loops if needed, but hex->hsva is stable usually.
    setHsva(newHsva);
    setHexInput(brushColor.replace('#', ''));
  }, [brushColor]);

  // Handler for Saturation change
  const handleSaturationChange = useCallback(
    (newColor: { h: number; s: number; v: number; a: number }) => {
      // newColor contains updated s,v. h,a are passed from props?
      // react-colorful Saturation calls onChange with { h, s, v, a } merged.
      const hex = hsvaToHex(newColor);
      setHsva(newColor);
      setBrushColor(hex);
    },
    [setBrushColor]
  );

  // Handler for Hue change
  const handleHueChange = useCallback(
    (newHue: number) => {
      const newHsva = { ...hsva, h: newHue };
      const hex = hsvaToHex(newHsva);
      setHsva(newHsva);
      setBrushColor(hex);
    },
    [hsva, setBrushColor]
  );

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexInput(val);

    // Check if valid hex (3 or 6 chars)
    const cleanHex = val.replace(/[^0-9a-fA-F]/g, '');
    if (cleanHex.length === 3 || cleanHex.length === 6) {
      // Expand 3 char hex
      let fullHex = cleanHex;
      if (cleanHex.length === 3) {
        fullHex = cleanHex
          .split('')
          .map((c) => c + c)
          .join('');
      }
      const hex = `#${fullHex}`;
      setBrushColor(hex);
      // We don't update HSVA here immediately to avoid jumping while typing?
      // Actually we should, to see preview.
      setHsva(hexToHsva(hex));
    }
  };

  const handleHexBlur = () => {
    setHexInput(brushColor.replace('#', ''));
  };

  return (
    <div className="color-panel">
      <h3>Color</h3>
      <div className="color-picker-wrapper">
        {/* Custom Layout: Saturation + Vertical Hue */}
        <div className="picker-area">
          <div className="saturation-wrapper">
            <SaturationSquare hsva={hsva} onChange={handleSaturationChange} />
          </div>
          <div className="hue-wrapper">
            <VerticalHueSlider hue={hsva.h} onChange={handleHueChange} />
          </div>
        </div>

        <div className="color-inputs">
          <div className="color-preview" style={{ backgroundColor: brushColor }} />
          <div className="hex-input-wrapper">
            <span className="hex-prefix">#</span>
            <input
              type="text"
              value={hexInput}
              onChange={handleHexChange}
              onBlur={handleHexBlur}
              className="hex-input"
              maxLength={6}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
