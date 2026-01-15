/**
 * Chaos Testing for PaintBoard
 * Randomly generates input to test robustness and edge cases
 */

import { InputSimulator } from './InputSimulator';

export interface ChaosTestResult {
  duration: number;
  clicks: number;
  strokes: number;
  errors: number;
  errorMessages: string[];
}

export interface ChaosTestOptions {
  /** Test duration in milliseconds */
  duration?: number;
  /** Probability of stroke vs tap (0-1) */
  strokeProbability?: number;
  /** Minimum interval between actions (ms) */
  minInterval?: number;
  /** Maximum interval between actions (ms) */
  maxInterval?: number;
  /** Progress callback */
  onProgress?: (progress: number) => void;
}

/**
 * Run chaos clicking test - random taps at varying intervals
 */
export async function chaosClicker(
  canvas: HTMLCanvasElement,
  options: ChaosTestOptions = {}
): Promise<ChaosTestResult> {
  const { duration = 5000, minInterval = 1, maxInterval = 50, onProgress } = options;

  const simulator = new InputSimulator(canvas);
  const startTime = performance.now();
  let clicks = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  while (performance.now() - startTime < duration) {
    try {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const pressure = 0.1 + Math.random() * 0.9;
      const tapDuration = 1 + Math.random() * 20;
      const interval = minInterval + Math.random() * (maxInterval - minInterval);

      await simulator.tap(x, y, { pressure, durationMs: tapDuration });
      await new Promise((r) => setTimeout(r, interval));
      clicks++;

      // Report progress
      if (onProgress) {
        const progress = (performance.now() - startTime) / duration;
        onProgress(Math.min(progress, 1));
      }
    } catch (e) {
      errors++;
      const msg = e instanceof Error ? e.message : String(e);
      if (errorMessages.length < 10) {
        errorMessages.push(msg);
      }
      console.error('Chaos test error:', e);
    }
  }

  return {
    duration: performance.now() - startTime,
    clicks,
    strokes: 0,
    errors,
    errorMessages,
  };
}

/**
 * Run chaos mixed test - random mix of taps and strokes
 */
export async function chaosMixed(
  canvas: HTMLCanvasElement,
  options: ChaosTestOptions = {}
): Promise<ChaosTestResult> {
  const {
    duration = 5000,
    strokeProbability = 0.3,
    minInterval = 5,
    maxInterval = 100,
    onProgress,
  } = options;

  const simulator = new InputSimulator(canvas);
  const startTime = performance.now();
  let clicks = 0;
  let strokes = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  while (performance.now() - startTime < duration) {
    try {
      const isStroke = Math.random() < strokeProbability;

      if (isStroke) {
        // Random stroke
        const start = {
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
        };
        const end = {
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
        };
        const steps = 5 + Math.floor(Math.random() * 20);

        await simulator.drawStroke(start, end, {
          pressure: 0.3 + Math.random() * 0.7,
          steps,
        });
        strokes++;
      } else {
        // Random tap
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const pressure = 0.1 + Math.random() * 0.9;

        await simulator.tap(x, y, { pressure, durationMs: 1 + Math.random() * 10 });
        clicks++;
      }

      const interval = minInterval + Math.random() * (maxInterval - minInterval);
      await new Promise((r) => setTimeout(r, interval));

      // Report progress
      if (onProgress) {
        const progress = (performance.now() - startTime) / duration;
        onProgress(Math.min(progress, 1));
      }
    } catch (e) {
      errors++;
      const msg = e instanceof Error ? e.message : String(e);
      if (errorMessages.length < 10) {
        errorMessages.push(msg);
      }
      console.error('Chaos test error:', e);
    }
  }

  return {
    duration: performance.now() - startTime,
    clicks,
    strokes,
    errors,
    errorMessages,
  };
}

/**
 * Format chaos test results for display
 */
export function formatChaosReport(result: ChaosTestResult): string {
  const lines: string[] = [
    '=== Chaos Test Report ===',
    `Duration: ${(result.duration / 1000).toFixed(1)}s`,
    `Clicks: ${result.clicks}`,
    `Strokes: ${result.strokes}`,
    `Total Actions: ${result.clicks + result.strokes}`,
    `Errors: ${result.errors}`,
    `Status: ${result.errors === 0 ? '✅ PASSED' : '❌ ERRORS OCCURRED'}`,
  ];

  if (result.errorMessages.length > 0) {
    lines.push('');
    lines.push('Error Messages:');
    result.errorMessages.forEach((msg, i) => {
      lines.push(`  ${i + 1}. ${msg}`);
    });
  }

  return lines.join('\n');
}
