import { RgbaStringColorPicker } from 'react-colorful';
import { useToolStore } from '@/stores/tool';
import { useState, useEffect } from 'react';
import './ColorPanel.css';

// Helper to convert hex to rgba
const hexToRgba = (hex: string): { r: number; g: number; b: number; a: number } => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b, a: 1 }; // react-colorful handles alpha separately usually, but we'll stick to hex for now in store
};

// Helper to convert rgba object to rgba string for react-colorful
const toRgbaString = (r: number, g: number, b: number, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;

export function ColorPanel() {
  const { brushColor, setBrushColor } = useToolStore();

  // Local state for the hex input to allow typing without constant re-formatting interruptions
  const [hexInput, setHexInput] = useState(brushColor.replace('#', ''));

  useEffect(() => {
    setHexInput(brushColor.replace('#', ''));
  }, [brushColor]);

  const handleColorChange = (newColor: string) => {
    // react-colorful returns rgba string e.g. "rgba(255, 0, 0, 1)"
    // We need to convert it back to hex for our store
    // For simplicity, let's parse the rgba string
    const match = newColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      const r = parseInt(match[1] || '0');
      const g = parseInt(match[2] || '0');
      const b = parseInt(match[3] || '0');
      // Verify hex format
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      setBrushColor(hex);
    }
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow any input, but validate only valid hex to update store
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
      setBrushColor(`#${fullHex}`);
    }
  };

  const handleHexBlur = () => {
    // On blur, reset input to actual current color to ensure consistency
    setHexInput(brushColor.replace('#', ''));
  };

  // Convert current hex to rgba string for the picker
  const rgb = hexToRgba(brushColor);
  const colorStr = toRgbaString(rgb.r, rgb.g, rgb.b, rgb.a);

  return (
    <div className="color-panel">
      <h3>Color</h3>
      <div className="color-picker-wrapper">
        <RgbaStringColorPicker color={colorStr} onChange={handleColorChange} />

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
