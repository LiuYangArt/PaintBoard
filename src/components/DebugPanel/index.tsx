import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Bug,
  Grid3X3,
  Zap,
  Play,
  X,
  RotateCcw,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { InputSimulator, verifyGrid, formatVerificationReport } from '../../test';
import { chaosMixed, formatChaosReport, type ChaosTestResult } from '../../test';
import { installDiagnosticHooks, getTestReport, type DiagnosticHooks } from '../../test';
import './DebugPanel.css';

interface DebugPanelProps {
  canvas: HTMLCanvasElement | null;
  onClose: () => void;
}

type TestStatus = 'idle' | 'running' | 'passed' | 'failed';

interface TestResult {
  name: string;
  status: TestStatus;
  report?: string;
  timestamp: Date;
}

export function DebugPanel({ canvas, onClose }: DebugPanelProps) {
  const [results, setResults] = useState<TestResult[]>([]);
  const [runningTest, setRunningTest] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);
  const diagnosticsRef = useRef<DiagnosticHooks | null>(null);
  const abortRef = useRef(false);

  // Install diagnostics on mount
  useEffect(() => {
    diagnosticsRef.current = installDiagnosticHooks();
    return () => {
      diagnosticsRef.current?.cleanup();
    };
  }, []);

  const addResult = useCallback((name: string, status: TestStatus, report?: string) => {
    setResults((prev: TestResult[]) => [
      { name, status, report, timestamp: new Date() },
      ...prev.slice(0, 9), // Keep last 10 results
    ]);
  }, []);

  // Grid Test (10x10)
  const runGridTest = useCallback(async () => {
    if (!canvas || runningTest) return;

    setRunningTest('grid');
    setProgress(0);
    addResult('Grid Test (10x10)', 'running');
    diagnosticsRef.current?.reset();

    try {
      const simulator = new InputSimulator(canvas);
      const points = await simulator.drawGrid(10, 10, 30, {
        startX: 50,
        startY: 50,
        intervalMs: 20,
      });

      // Wait for rendering
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify
      const verification = await verifyGrid(canvas, points);
      const telemetryReport = diagnosticsRef.current ? getTestReport(diagnosticsRef.current) : '';

      const fullReport = formatVerificationReport(verification) + '\n\n' + telemetryReport;

      addResult('Grid Test (10x10)', verification.passed ? 'passed' : 'failed', fullReport);
    } catch (e) {
      addResult('Grid Test (10x10)', 'failed', String(e));
    } finally {
      setRunningTest(null);
      setProgress(0);
    }
  }, [canvas, runningTest, addResult]);

  // Rapid Taps Test
  const runRapidTapsTest = useCallback(async () => {
    if (!canvas || runningTest) return;

    setRunningTest('rapid');
    setProgress(0);
    addResult('Rapid Taps (100x)', 'running');
    diagnosticsRef.current?.reset();

    try {
      const simulator = new InputSimulator(canvas);
      const points = await simulator.rapidTaps(
        100,
        {
          x: 50,
          y: 50,
          width: canvas.width - 100,
          height: canvas.height - 100,
        },
        5
      );

      // Wait for rendering
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify
      const verification = await verifyGrid(canvas, points, { sampleRadius: 5 });
      const telemetryReport = diagnosticsRef.current ? getTestReport(diagnosticsRef.current) : '';

      const fullReport =
        `Taps: ${points.length}\n` +
        formatVerificationReport(verification) +
        '\n\n' +
        telemetryReport;

      addResult('Rapid Taps (100x)', verification.passed ? 'passed' : 'failed', fullReport);
    } catch (e) {
      addResult('Rapid Taps (100x)', 'failed', String(e));
    } finally {
      setRunningTest(null);
      setProgress(0);
    }
  }, [canvas, runningTest, addResult]);

  // Chaos Test
  const runChaosTest = useCallback(async () => {
    if (!canvas || runningTest) return;

    setRunningTest('chaos');
    setProgress(0);
    abortRef.current = false;
    addResult('Chaos Test (5s)', 'running');
    diagnosticsRef.current?.reset();

    try {
      const result: ChaosTestResult = await chaosMixed(canvas, {
        duration: 5000,
        strokeProbability: 0.3,
        onProgress: (p: number) => setProgress(p),
      });

      const telemetryReport = diagnosticsRef.current ? getTestReport(diagnosticsRef.current) : '';

      const fullReport = formatChaosReport(result) + '\n\n' + telemetryReport;

      addResult('Chaos Test (5s)', result.errors === 0 ? 'passed' : 'failed', fullReport);
    } catch (e) {
      addResult('Chaos Test (5s)', 'failed', String(e));
    } finally {
      setRunningTest(null);
      setProgress(0);
    }
  }, [canvas, runningTest, addResult]);

  // Clear Canvas
  const clearCanvas = useCallback(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    diagnosticsRef.current?.reset();
  }, [canvas]);

  // Export Results
  const exportResults = useCallback(() => {
    const content = results
      .map(
        (r: TestResult) =>
          `[${r.timestamp.toISOString()}] ${r.name}: ${r.status}\n${r.report || ''}`
      )
      .join('\n\n---\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const getStatusIcon = (status: TestStatus) => {
    switch (status) {
      case 'running':
        return <span className="status-icon running">⏳</span>;
      case 'passed':
        return <span className="status-icon passed">✅</span>;
      case 'failed':
        return <span className="status-icon failed">❌</span>;
      default:
        return null;
    }
  };

  return (
    <div className="debug-panel">
      <div className="debug-panel-header">
        <div className="debug-panel-title">
          <Bug size={18} />
          <span>Debug Panel</span>
        </div>
        <button className="debug-close-btn" onClick={onClose} title="Close (Shift+Ctrl+D)">
          <X size={16} />
        </button>
      </div>

      <div className="debug-panel-content">
        {/* Test Buttons */}
        <div className="debug-section">
          <h3>Stroke Tests</h3>
          <div className="debug-button-grid">
            <button
              className="debug-btn"
              onClick={runGridTest}
              disabled={!!runningTest}
              title="Draw 10x10 grid of taps and verify all points are rendered"
            >
              <Grid3X3 size={16} />
              <span>Grid 10x10</span>
            </button>

            <button
              className="debug-btn"
              onClick={runRapidTapsTest}
              disabled={!!runningTest}
              title="100 rapid random taps"
            >
              <Zap size={16} />
              <span>Rapid 100x</span>
            </button>

            <button
              className="debug-btn"
              onClick={runChaosTest}
              disabled={!!runningTest}
              title="5 seconds of random input (taps + strokes)"
            >
              <Play size={16} />
              <span>Chaos 5s</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {runningTest && (
          <div className="debug-progress">
            <div className="debug-progress-label">
              Running: {runningTest}
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="debug-progress-bar">
              <div className="debug-progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="debug-section">
          <h3>Actions</h3>
          <div className="debug-button-row">
            <button
              className="debug-btn secondary"
              onClick={clearCanvas}
              disabled={!!runningTest}
              title="Clear the canvas"
            >
              <RotateCcw size={16} />
              <span>Clear</span>
            </button>

            <button
              className="debug-btn secondary"
              onClick={exportResults}
              disabled={results.length === 0}
              title="Export test results"
            >
              <Download size={16} />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="debug-section">
            <h3>Results</h3>
            <div className="debug-results">
              {results.map((result: TestResult, index: number) => (
                <div
                  key={index}
                  className={`debug-result ${result.status}`}
                  onClick={() => setExpandedResult(expandedResult === index ? null : index)}
                >
                  <div className="debug-result-header">
                    {getStatusIcon(result.status)}
                    <span className="debug-result-name">{result.name}</span>
                    <span className="debug-result-time">
                      {result.timestamp.toLocaleTimeString()}
                    </span>
                    {result.report &&
                      (expandedResult === index ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      ))}
                  </div>
                  {expandedResult === index && result.report && (
                    <pre className="debug-result-report">{result.report}</pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="debug-panel-footer">
        <span className="debug-hint">Press Shift+Ctrl+D to toggle</span>
      </div>
    </div>
  );
}

export default DebugPanel;
