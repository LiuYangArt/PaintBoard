import { describe, it, expect } from 'vitest';
import {
  catmullRomInterpolate,
  distance,
  interpolateSegment,
  StrokeBuffer,
  type Point,
} from '../interpolation';

describe('interpolation', () => {
  describe('distance', () => {
    it('should calculate distance between two points', () => {
      const p1: Point = { x: 0, y: 0, pressure: 0.5 };
      const p2: Point = { x: 3, y: 4, pressure: 0.5 };

      expect(distance(p1, p2)).toBe(5);
    });

    it('should return 0 for same point', () => {
      const p1: Point = { x: 10, y: 20, pressure: 0.5 };

      expect(distance(p1, p1)).toBe(0);
    });

    it('should handle negative coordinates', () => {
      const p1: Point = { x: -3, y: -4, pressure: 0.5 };
      const p2: Point = { x: 0, y: 0, pressure: 0.5 };

      expect(distance(p1, p2)).toBe(5);
    });
  });

  describe('catmullRomInterpolate', () => {
    const createPoints = (): [Point, Point, Point, Point] => [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 10, y: 0, pressure: 0.6 },
      { x: 20, y: 0, pressure: 0.7 },
      { x: 30, y: 0, pressure: 0.8 },
    ];

    it('should return start point at t=0', () => {
      const [p0, p1, p2, p3] = createPoints();
      const result = catmullRomInterpolate(p0, p1, p2, p3, 0);

      expect(result.x).toBeCloseTo(10, 5);
      expect(result.y).toBeCloseTo(0, 5);
      expect(result.pressure).toBeCloseTo(0.6, 5);
    });

    it('should return end point at t=1', () => {
      const [p0, p1, p2, p3] = createPoints();
      const result = catmullRomInterpolate(p0, p1, p2, p3, 1);

      expect(result.x).toBeCloseTo(20, 5);
      expect(result.y).toBeCloseTo(0, 5);
      expect(result.pressure).toBeCloseTo(0.7, 5);
    });

    it('should interpolate mid-point at t=0.5', () => {
      const [p0, p1, p2, p3] = createPoints();
      const result = catmullRomInterpolate(p0, p1, p2, p3, 0.5);

      expect(result.x).toBeCloseTo(15, 5);
      expect(result.pressure).toBeCloseTo(0.65, 5);
    });

    it('should interpolate tilt values when present', () => {
      const p0: Point = { x: 0, y: 0, pressure: 0.5, tiltX: 0, tiltY: 0 };
      const p1: Point = { x: 10, y: 0, pressure: 0.5, tiltX: 10, tiltY: 5 };
      const p2: Point = { x: 20, y: 0, pressure: 0.5, tiltX: 20, tiltY: 10 };
      const p3: Point = { x: 30, y: 0, pressure: 0.5, tiltX: 30, tiltY: 15 };

      const result = catmullRomInterpolate(p0, p1, p2, p3, 0.5);

      expect(result.tiltX).toBeDefined();
      expect(result.tiltY).toBeDefined();
    });
  });

  describe('interpolateSegment', () => {
    it('should generate points along segment', () => {
      const p0: Point = { x: 0, y: 0, pressure: 0.5 };
      const p1: Point = { x: 10, y: 0, pressure: 0.5 };
      const p2: Point = { x: 20, y: 0, pressure: 0.5 };
      const p3: Point = { x: 30, y: 0, pressure: 0.5 };

      const result = interpolateSegment(p0, p1, p2, p3, 2);

      // Should have multiple points
      expect(result.length).toBeGreaterThan(1);
    });

    it('should respect minDistance parameter', () => {
      const p0: Point = { x: 0, y: 0, pressure: 0.5 };
      const p1: Point = { x: 0, y: 0, pressure: 0.5 };
      const p2: Point = { x: 10, y: 0, pressure: 0.5 };
      const p3: Point = { x: 10, y: 0, pressure: 0.5 };

      const result1 = interpolateSegment(p0, p1, p2, p3, 2);
      const result2 = interpolateSegment(p0, p1, p2, p3, 5);

      // Smaller minDistance should produce more points
      expect(result1.length).toBeGreaterThanOrEqual(result2.length);
    });
  });

  describe('StrokeBuffer', () => {
    it('should create with default parameters', () => {
      const buffer = new StrokeBuffer();
      expect(buffer.length).toBe(0);
    });

    it('should add points and return interpolated results', () => {
      const buffer = new StrokeBuffer(2);

      // Add first point
      const result1 = buffer.addPoint({ x: 0, y: 0, pressure: 0.5 });
      expect(result1.length).toBe(0); // Not enough points yet

      // Add second point
      const result2 = buffer.addPoint({ x: 10, y: 0, pressure: 0.5 });
      expect(result2.length).toBeGreaterThan(0);
    });

    it('should filter out points that are too close', () => {
      const buffer = new StrokeBuffer(2);

      buffer.addPoint({ x: 0, y: 0, pressure: 0.5 });
      const result = buffer.addPoint({ x: 0.1, y: 0, pressure: 0.5 });

      // Point too close should be filtered
      expect(result.length).toBe(0);
    });

    it('should reset on clear', () => {
      const buffer = new StrokeBuffer();

      buffer.addPoint({ x: 0, y: 0, pressure: 0.5 });
      buffer.addPoint({ x: 10, y: 0, pressure: 0.5 });

      buffer.reset();

      expect(buffer.length).toBe(0);
    });

    it('should finish stroke and return remaining points', () => {
      const buffer = new StrokeBuffer(2);

      buffer.addPoint({ x: 0, y: 0, pressure: 0.5 });
      buffer.addPoint({ x: 10, y: 0, pressure: 0.5 });
      buffer.addPoint({ x: 20, y: 0, pressure: 0.5 });
      buffer.addPoint({ x: 30, y: 0, pressure: 0.5 });

      const result = buffer.finish();

      // Should return remaining interpolated points
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array for finish with insufficient points', () => {
      const buffer = new StrokeBuffer();

      buffer.addPoint({ x: 0, y: 0, pressure: 0.5 });

      const result = buffer.finish();

      expect(result.length).toBe(0);
    });
  });
});
