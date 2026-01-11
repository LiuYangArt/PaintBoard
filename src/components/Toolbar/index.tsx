import { Brush, Eraser, Pipette, Move, BoxSelect, Undo2, Redo2, LucideIcon } from 'lucide-react';
import { useToolStore, ToolType } from '@/stores/tool';
import './Toolbar.css';

const TOOLS: { id: ToolType; label: string; icon: LucideIcon }[] = [
  { id: 'brush', label: 'Brush', icon: Brush },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'eyedropper', label: 'Eyedropper', icon: Pipette },
  { id: 'move', label: 'Move', icon: Move },
  { id: 'select', label: 'Select', icon: BoxSelect },
];

export function Toolbar() {
  const {
    currentTool,
    setTool,
    brushSize,
    setBrushSize,
    brushOpacity,
    setBrushOpacity,
    brushColor,
    setBrushColor,
  } = useToolStore();

  return (
    <header className="toolbar">
      <div className="toolbar-section tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            className={`tool-btn ${currentTool === tool.id ? 'active' : ''}`}
            onClick={() => setTool(tool.id)}
            title={tool.label}
          >
            <tool.icon size={18} strokeWidth={1.5} />
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section brush-settings">
        <label className="setting">
          <span className="setting-label">Size</span>
          <input
            type="range"
            min="1"
            max="200"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
          <span className="setting-value">{brushSize}px</span>
        </label>

        <label className="setting">
          <span className="setting-label">Opacity</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={brushOpacity}
            onChange={(e) => setBrushOpacity(Number(e.target.value))}
          />
          <span className="setting-value">{Math.round(brushOpacity * 100)}%</span>
        </label>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section color-picker">
        <input
          type="color"
          value={brushColor}
          onChange={(e) => setBrushColor(e.target.value)}
          className="color-input"
          title="Brush Color"
        />
        <span className="color-hex">{brushColor}</span>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-section actions">
        <button data-testid="undo-btn" disabled title="Undo">
          <Undo2 size={18} strokeWidth={1.5} />
        </button>
        <button data-testid="redo-btn" disabled title="Redo">
          <Redo2 size={18} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
