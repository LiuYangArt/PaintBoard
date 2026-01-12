import { memo, useRef, useCallback } from 'react';
import './SaturationSquare.css';

interface SaturationSquareProps {
  hsva: { h: number; s: number; v: number; a: number };
  onChange: (newHsva: { h: number; s: number; v: number; a: number }) => void;
}

export const SaturationSquare = memo(function SaturationSquare({
  hsva,
  onChange,
}: SaturationSquareProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const calculateSV = useCallback((x: number, y: number, width: number, height: number) => {
    let s = (x / width) * 100;
    let v = 100 - (y / height) * 100;

    s = Math.max(0, Math.min(s, 100));
    v = Math.max(0, Math.min(v, 100));

    return { s, v };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    isDragging.current = true;
    containerRef.current.setPointerCapture(e.pointerId);

    const rect = containerRef.current.getBoundingClientRect();
    const { s, v } = calculateSV(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height
    );

    onChange({ ...hsva, s, v });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const { s, v } = calculateSV(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height
    );

    // Check if changed
    if (s !== hsva.s || v !== hsva.v) {
      onChange({ ...hsva, s, v });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging.current && containerRef.current) {
      isDragging.current = false;
      containerRef.current.releasePointerCapture(e.pointerId);
    }
  };

  // Background color for the square (Base Hue)
  const bgColor = `hsl(${hsva.h}, 100%, 50%)`;

  return (
    <div
      className="saturation-square"
      ref={containerRef}
      style={{ backgroundColor: bgColor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="saturation-white" />
      <div className="saturation-black" />
      <div
        className="saturation-pointer"
        style={{
          left: `${hsva.s}%`,
          top: `${100 - hsva.v}%`,
        }}
      />
    </div>
  );
});
