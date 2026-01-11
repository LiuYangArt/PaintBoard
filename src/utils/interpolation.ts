/**
 * Catmull-Rom spline interpolation for smooth stroke rendering
 */

export interface Point {
  x: number;
  y: number;
  pressure: number;
  tiltX?: number;
  tiltY?: number;
}

/**
 * Catmull-Rom spline interpolation between p1 and p2
 * Uses p0 and p3 as control points for smooth curve calculation
 *
 * @param p0 - Previous control point
 * @param p1 - Start point of segment
 * @param p2 - End point of segment
 * @param p3 - Next control point
 * @param t - Interpolation parameter (0 to 1)
 * @param tension - Curve tension (0.5 = Catmull-Rom, 0 = linear)
 */
export function catmullRomInterpolate(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
  tension = 0.5
): Point {
  const t2 = t * t;
  const t3 = t2 * t;

  // Catmull-Rom basis functions
  const s = (1 - tension) / 2;

  const b0 = -s * t3 + 2 * s * t2 - s * t;
  const b1 = (2 - s) * t3 + (s - 3) * t2 + 1;
  const b2 = (s - 2) * t3 + (3 - 2 * s) * t2 + s * t;
  const b3 = s * t3 - s * t2;

  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
    pressure: b0 * p0.pressure + b1 * p1.pressure + b2 * p2.pressure + b3 * p3.pressure,
    tiltX:
      p0.tiltX !== undefined
        ? b0 * p0.tiltX! + b1 * p1.tiltX! + b2 * p2.tiltX! + b3 * p3.tiltX!
        : undefined,
    tiltY:
      p0.tiltY !== undefined
        ? b0 * p0.tiltY! + b1 * p1.tiltY! + b2 * p2.tiltY! + b3 * p3.tiltY!
        : undefined,
  };
}

/**
 * Calculate distance between two points
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Generate interpolated points along a Catmull-Rom spline segment
 *
 * @param p0 - Previous control point
 * @param p1 - Start point of segment
 * @param p2 - End point of segment
 * @param p3 - Next control point
 * @param minDistance - Minimum distance between interpolated points
 */
export function interpolateSegment(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  minDistance = 2
): Point[] {
  const segmentLength = distance(p1, p2);

  // Calculate number of subdivisions based on segment length
  const subdivisions = Math.max(1, Math.ceil(segmentLength / minDistance));
  const points: Point[] = [];

  for (let i = 0; i <= subdivisions; i++) {
    const t = i / subdivisions;
    points.push(catmullRomInterpolate(p0, p1, p2, p3, t));
  }

  return points;
}

/**
 * Smooth step function for easing
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Stroke buffer for managing points and interpolation
 */
export class StrokeBuffer {
  private points: Point[] = [];
  private minDistance: number;
  private taperStart: number;
  private taperEnd: number;

  constructor(minDistance = 2, taperStart = 20, taperEnd = 15) {
    this.minDistance = minDistance;
    this.taperStart = taperStart;
    this.taperEnd = taperEnd;
  }

  /**
   * Apply taper to a point based on its position in the stroke
   */
  applyTaper(point: Point, index: number, isEnd = false, endIndex = 0): Point {
    let multiplier = 1;

    // Start taper
    if (index < this.taperStart) {
      multiplier = Math.min(multiplier, (index + 1) / this.taperStart);
    }

    // End taper
    if (isEnd && endIndex < this.taperEnd) {
      multiplier = Math.min(multiplier, (endIndex + 1) / this.taperEnd);
    }

    // Apply smooth easing
    multiplier = smoothstep(0, 1, multiplier);

    return {
      ...point,
      pressure: point.pressure * multiplier,
    };
  }

  /**
   * Add a new point to the buffer
   * Returns interpolated points if enough points are available
   */
  addPoint(point: Point): Point[] {
    // Filter out points that are too close (reduces jitter)
    if (this.points.length > 0) {
      const lastPoint = this.points[this.points.length - 1];
      if (lastPoint && distance(lastPoint, point) < this.minDistance * 0.5) {
        return [];
      }
    }

    this.points.push(point);

    // Need at least 4 points for Catmull-Rom interpolation
    if (this.points.length < 4) {
      // For the first few points, return direct line segments
      if (this.points.length >= 2) {
        const len = this.points.length;
        const p1 = this.points[len - 2];
        const p2 = this.points[len - 1];
        if (p1 && p2) {
          return [p1, p2];
        }
      }
      return [];
    }

    // Interpolate the segment between points[n-3] and points[n-2]
    const len = this.points.length;
    const p0 = this.points[len - 4];
    const p1 = this.points[len - 3];
    const p2 = this.points[len - 2];
    const p3 = this.points[len - 1];

    if (p0 && p1 && p2 && p3) {
      return interpolateSegment(p0, p1, p2, p3, this.minDistance);
    }
    return [];
  }

  /**
   * Finish the stroke and return remaining interpolated points
   */
  finish(): Point[] {
    if (this.points.length < 2) {
      return [];
    }

    const result: Point[] = [];

    if (this.points.length >= 4) {
      // Interpolate the second-to-last segment
      const len = this.points.length;
      const p0 = this.points[len - 3];
      const p1 = this.points[len - 2];
      const p2 = this.points[len - 1];
      // Use last point as control point (endpoint tangent)
      const p3 = p2;

      if (p0 && p1 && p2 && p3) {
        result.push(...interpolateSegment(p0, p1, p2, p3, this.minDistance));
      }
    } else if (this.points.length >= 2) {
      // Just return remaining points for short strokes
      const slice = this.points.slice(-2);
      result.push(...slice);
    }

    return result;
  }

  /**
   * Reset the buffer for a new stroke
   */
  reset(): void {
    this.points = [];
  }

  /**
   * Get the number of points in the buffer
   */
  get length(): number {
    return this.points.length;
  }
}
