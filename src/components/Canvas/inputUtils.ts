import { RawInputPoint } from '@/stores/tablet';

/**
 * Resolves pressure and tilt data, preferring WinTab buffer if active
 *
 * @param evt The original pointer event
 * @param isWinTabActive Whether WinTab backend is currently active
 * @param bufferedPoints Buffered WinTab points to match against
 * @param currentPoint The last known valid WinTab point, if any
 * @param toleranceMs Time matching tolerance in ms
 */
export function getEffectiveInputData(
  evt: PointerEvent,
  isWinTabActive: boolean,
  bufferedPoints: RawInputPoint[],
  currentPoint: RawInputPoint | null,
  toleranceMs: number = 20 // Relaxed tolerance
): { pressure: number; tiltX: number; tiltY: number } {
  if (!isWinTabActive) {
    return {
      pressure: evt.pressure,
      tiltX: evt.tiltX,
      tiltY: evt.tiltY,
    };
  }

  const eventTime = evt.timeStamp;

  // 1. Search backwards for the latest relevant point in buffer
  for (let i = bufferedPoints.length - 1; i >= 0; i--) {
    const pt = bufferedPoints[i];
    if (!pt) continue;

    // Find point with timestamp <= event time + tolerance
    // And ensure it has valid pressure (filtering out lift-off noise if needed, though usually desirable)
    if (pt.timestamp_ms <= eventTime + toleranceMs) {
      if (pt.pressure > 0) {
        return {
          pressure: pt.pressure,
          tiltX: pt.tilt_x,
          tiltY: pt.tilt_y,
        };
      }
    }
  }

  // 2. Fallback: Use currentPoint (last known valid input) if available
  // This handles cases where WinTab data is sparse or bufferedPoints is empty for this frame
  if (currentPoint && currentPoint.pressure > 0) {
    return {
      pressure: currentPoint.pressure,
      tiltX: currentPoint.tilt_x,
      tiltY: currentPoint.tilt_y,
    };
  }

  // 3. Ultimate Fallback: Use PointerEvent data
  // Note: Windows Ink 'pressure' might be available even if WinTab logic missed
  return {
    pressure: evt.pressure > 0 ? evt.pressure : 0.5,
    tiltX: evt.tiltX,
    tiltY: evt.tiltY,
  };
}
