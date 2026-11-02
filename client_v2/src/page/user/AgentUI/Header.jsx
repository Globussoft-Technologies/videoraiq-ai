import { Maximize2, Minimize2, PanelLeftOpen, Plus, X } from 'lucide-react';
import Logo from './Logo';
import BrandTitle from './BrandTitle';

export default function Header({ compact, sidebarCollapsed, onToggleSidebar, onToggleExpand, onNew, onClose, onPanelPointerDown }) {
  return <header className={`agent-header ${compact ? 'agent-drag-handle' : ''}`} onPointerDown={compact ? onPanelPointerDown : undefined}>
    <div className="agent-header-controls">
      {!compact && <button type="button" className="agent-mobile-sidebar-open" aria-label="Open chat history" onClick={onToggleSidebar}><PanelLeftOpen size={17} /></button>}
      {(compact || sidebarCollapsed) && <div className="agent-collapsed-brand"><Logo /><BrandTitle /></div>}
    </div>
    <div className="agent-header-actions"><span className="agent-live"><i />Live</span><button type="button" className="agent-header-new" onClick={onNew}><Plus size={16} />New chat</button><button type="button" className="agent-header-expand" aria-label={compact ? 'Expand VideoraAI to full view' : 'Collapse VideoraAI to floating chat'} title={compact ? 'Expand VideoraAI to full view' : 'Collapse VideoraAI to floating chat'} onClick={onToggleExpand}>{compact ? <Maximize2 size={17} /> : <Minimize2 size={17} />}</button><button type="button" className="agent-header-close" aria-label="Close VideoraAI" title="Close VideoraAI" onClick={onClose}><X size={17} /></button></div>
  </header>;
}
