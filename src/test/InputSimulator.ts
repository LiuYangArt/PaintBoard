/**
 * Input Simulator for automated stroke testing
 * Simulates pointer events aligned with requestAnimationFrame for realistic behavior
 */

export interface TapOptions {
  pressure?: number;
  durationMs?: number;
  pointerType?: 'pen' | 'mouse';
}

export interface GridOptions {
  startX?: number;
  startY?: number;
  intervalMs?: number;
}

export interface StrokeOptions {
  pressure?: number;
  steps?: number;
  pointerType?: 'pen' | 'mouse';
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Simulates pointer events for automated testing
 * Aligned with requestAnimationFrame to mimic real user input
 */
export class InputSimulator {
  private canvas: HTMLCanvasElement;
  private pointerId = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * Simulate a single tap (pointerdown + pointerup)
   */
  async tap(x: number, y: number, options: TapOptions = {}): Promise<void> {
    const { pressure = 0.5, durationMs = 10, pointerType = 'pen' } = options;

    const rect = this.canvas.getBoundingClientRect();
    const clientX = rect.left + x;
    const clientY = rect.top + y;

    this.canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: this.pointerId,
        bubbles: true,
        clientX,
        clientY,
        pressure,
        pointerType,
      })
    );

    await this.waitFrame(durationMs);

    this.canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: this.pointerId,
        bubbles: true,
        clientX,
        clientY,
        pressure: 0,
        pointerType,
      })
    );
  }

  /**
   * Draw a grid of taps for deterministic verification
   * @returns Array of expected tap positions (canvas coordinates)
   */
  async drawGrid(
    rows: number,
    cols: number,
    spacing: number,
    options: GridOptions = {}
  ): Promise<Point[]> {
    const { startX = 50, startY = 50, intervalMs = 20 } = options;
    const points: Point[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * spacing;
        const y = startY + r * spacing;
        points.push({ x, y });

        await this.tap(x, y, { pressure: 0.6, durationMs: 5 });
        await this.waitFrame(intervalMs);
      }
    }

    return points;
  }

  /**
   * Draw a stroke from start to end
   */
  async drawStroke(start: Point, end: Point, options: StrokeOptions = {}): Promise<Point[]> {
    const { pressure = 0.5, steps = 20, pointerType = 'pen' } = options;
    const points: Point[] = [];

    const rect = this.canvas.getBoundingClientRect();
    const startClientX = rect.left + start.x;
    const startClientY = rect.top + start.y;

    // Pointer down
    this.canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: this.pointerId,
        bubbles: true,
        clientX: startClientX,
        clientY: startClientY,
        pressure,
        pointerType,
      })
    );
    points.push({ x: start.x, y: start.y });

    // Move along the path
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      const clientX = rect.left + x;
      const clientY = rect.top + y;

      // Pressure curve: builds up and fades at the end
      const stepPressure = pressure * Math.sin(t * Math.PI);

      this.canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: this.pointerId,
          bubbles: true,
          clientX,
          clientY,
          pressure: stepPressure,
          pointerType,
        })
      );
      points.push({ x, y });

      await this.waitFrame(5);
    }

    // Pointer up
    const endClientX = rect.left + end.x;
    const endClientY = rect.top + end.y;
    this.canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: this.pointerId,
        bubbles: true,
        clientX: endClientX,
        clientY: endClientY,
        pressure: 0,
        pointerType,
      })
    );

    return points;
  }

  /**
   * Rapid fire taps (stress test)
   */
  async rapidTaps(
    count: number,
    area: { x: number; y: number; width: number; height: number },
    intervalMs: number = 5
  ): Promise<Point[]> {
    const points: Point[] = [];

    for (let i = 0; i < count; i++) {
      const x = area.x + Math.random() * area.width;
      const y = area.y + Math.random() * area.height;
      const pressure = 0.1 + Math.random() * 0.9;

      points.push({ x, y });
      await this.tap(x, y, { pressure, durationMs: 1 });
      await this.waitFrame(intervalMs);
    }

    return points;
  }

  /**
   * Wait aligned with requestAnimationFrame
   */
  private waitFrame(minMs: number): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const check = () => {
        if (performance.now() - start >= minMs) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    });
  }
}
