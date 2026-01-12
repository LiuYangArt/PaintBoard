import { memo, useRef, useCallback } from 'react';
import './VerticalHueSlider.css';

interface VerticalHueSliderProps {
  hue: number;
  onChange: (newHue: number) => void;
}

export const VerticalHueSlider = memo(function VerticalHueSlider({
  hue,
  onChange,
}: VerticalHueSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const calculateHue = useCallback((y: number, height: number, top: number) => {
    // 0% at top (0deg), 100% at bottom (360deg)
    // Or normally Hue 0 is Red. 360 is Red.
    // react-colorful usually maps 0-360.
    const relativeY = Math.max(0, Math.min(y - top, height));
    const percent = relativeY / height;
    return percent * 360;
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); // Prevent text selection, etc.
    if (!containerRef.current) return;

    isDragging.current = true;
    containerRef.current.setPointerCapture(e.pointerId);

    const rect = containerRef.current.getBoundingClientRect();
    const newHue = calculateHue(e.clientY, rect.height, rect.top);
    onChange(newHue);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const newHue = calculateHue(e.clientY, rect.height, rect.top);
    onChange(newHue);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging.current && containerRef.current) {
      isDragging.current = false;
      containerRef.current.releasePointerCapture(e.pointerId);
    }
  };

  // Convert hue to % position for the pointer
  const topPercent = (hue / 360) * 100;

  return (
    <div
      className="vertical-hue-slider"
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      /* Fallback for safety */
      onPointerLeave={handlePointerUp}
    >
      <div className="vertical-hue-pointer" style={{ top: `${topPercent}%` }} />
    </div>
  );
});
