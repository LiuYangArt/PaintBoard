import { ColorPanel } from '../ColorPanel';
import { LayerPanel } from '../LayerPanel';
import './RightPanel.css';

export function RightPanel() {
  return (
    <aside className="right-panel">
      <ColorPanel />
      <LayerPanel />
    </aside>
  );
}
