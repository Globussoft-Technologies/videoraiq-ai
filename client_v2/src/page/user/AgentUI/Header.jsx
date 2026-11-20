import { Maximize2, Minimize2, PanelLeftOpen, Plus, X } from 'lucide-react';

export function VideoraBrand({ compact = false, sidebar = false }) {
  return <div
    role="img"
    aria-label="VideoraAI"
    className={`videora-motion group relative inline-flex min-w-0 items-center gap-2 overflow-hidden rounded-xl px-1 py-1 transition-transform duration-300 hover:-translate-y-0.5 sm:gap-2.5 ${sidebar ? 'max-w-[250px]' : compact ? 'max-w-[190px]' : 'max-w-[280px]'}`}
  >
    <span className="relative isolate inline-flex shrink-0" aria-hidden="true">
      <span className="videora-aura" />
      <span className="videora-ring" />
      <span className="videora-ring videora-ring-blue" />
      <svg
      className={`shrink-0 transition-transform duration-300 group-hover:scale-[1.06] group-hover:-rotate-2 [.agent-ui[data-agent-theme=dark]_&]:brightness-125 ${sidebar ? 'h-8 w-11' : compact ? 'h-7 w-10' : 'h-7 w-10'}`}
      viewBox="80 120 610 440"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="videora-mark-left" x1="0.1" y1="0" x2="0.75" y2="1">
          <stop offset="0" stopColor="#CC3BE3" />
          <stop offset="0.45" stopColor="#9A1FE0" />
          <stop offset="1" stopColor="#5410CF" />
        </linearGradient>
        <linearGradient id="videora-mark-right" x1="0.5" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#4C93F2" />
          <stop offset="0.5" stopColor="#5B5BEA" />
          <stop offset="1" stopColor="#4310BE" />
        </linearGradient>
        <linearGradient id="videora-mark-fold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B72FD8" />
          <stop offset="1" stopColor="#DA55EC" />
        </linearGradient>
      </defs>
      <path className="[.agent-ui[data-agent-theme=dark]_&]:hidden" d="M398 345 Q425 320 432 350 L440 440 L405 440 Z" fill="#E8DCFA" opacity=".8" />
      <path className="videora-fold" d="M403 436 Q440 466 516 458 Q506 504 470 530 Q438 546 400 536 Q382 522 394 502 Q410 478 403 436 Z" fill="url(#videora-mark-fold)" />
      <path className="videora-left" d="M118 143 H226 Q256 143 273 172 L405 442 Q422 474 396 512 Q372 541 330 538 Q286 536 262 496 L102 168 Q88 143 118 143 Z" fill="url(#videora-mark-left)" />
      <path className="videora-right" d="M548 143 H650 Q676 143 663 170 L522 454 Q508 468 486 460 Q446 450 431 342 Q426 298 452 250 Q492 160 548 143 Z" fill="url(#videora-mark-right)" />
      </svg>
      <span className="videora-spark -right-0.5 top-0 [animation-delay:2.1s]" />
      <span className="videora-spark bottom-0 left-0 [animation-delay:2.9s]" />
      <span className="videora-spark left-3 top-0 [animation-delay:3.6s]" />
    </span>
    <span aria-hidden="true" className="videora-spark right-1 top-0 [animation-delay:3.2s]" />

    <span className="flex min-w-0 flex-col leading-none">
      <span className="agent-brand-title whitespace-nowrap">
        <span className="agent-word normal-case">{Array.from('Videora', (letter, index) => (
          <span key={index} style={{ '--agent-i': index }}>{letter}</span>
        ))}</span>
        <span className="agent-ai-tag [.agent-ui[data-agent-theme=dark]_&]:text-[#dbe5ff]! [.agent-ui[data-agent-theme=dark]_&]:bg-transparent!"><span className="videora-ai-shimmer">AI</span></span>
      </span>
      <span className={`mt-1.5 flex items-center gap-1.5 uppercase min-w-0 text-[#475569] [.agent-ui[data-agent-theme=dark]_&]:font-semibold [.agent-ui[data-agent-theme=dark]_&]:text-[#dce6ff] ${sidebar ? 'text-[7px] tracking-[0.18em]' : compact ? 'text-[9px] font-semibold tracking-normal leading-tight' : 'text-[7px] tracking-[0.22em] sm:text-[8px]'}`}>
        <span className={`${compact ? 'w-3' : 'w-5'} videora-line h-px shrink-0 bg-gradient-to-r from-[#c026d3] to-[#3b82f6] [.agent-ui[data-agent-theme=dark]_&]:from-[#e58aff] [.agent-ui[data-agent-theme=dark]_&]:to-[#89b4ff]`} />
        <span className="videora-tagline shrink-0 whitespace-nowrap pr-0.5">Video Intelligence</span>
      </span>
    </span>
  </div>;
}

export default function Header({ compact, sidebarCollapsed, onToggleSidebar, onToggleExpand, onNew, onClose, onPanelPointerDown }) {
  return <header className={`agent-header ${compact ? 'agent-drag-handle' : ''}`} onPointerDown={compact ? onPanelPointerDown : undefined}>
    <div className="agent-header-controls">
      {!compact && <button type="button" className="agent-mobile-sidebar-open" aria-label="Open chat history" onClick={onToggleSidebar}><PanelLeftOpen size={17} /></button>}
      {(compact || sidebarCollapsed) && <div className="agent-collapsed-brand"><VideoraBrand compact={compact} /></div>}
    </div>
    <div className="agent-header-actions"><span className="agent-live"><i />Live</span><button type="button" className="agent-header-new" aria-label="New chat" title="New chat" onClick={onNew}><Plus size={16} />{!compact && "New chat"}</button><button type="button" className="agent-header-expand" aria-label={compact ? 'Expand VideoraAI to full view' : 'Collapse VideoraAI to floating chat'} title={compact ? 'Expand VideoraAI to full view' : 'Collapse VideoraAI to floating chat'} onClick={onToggleExpand}>{compact ? <Maximize2 size={17} /> : <Minimize2 size={17} />}</button><button type="button" className="agent-header-close" aria-label="Close VideoraAI" title="Close VideoraAI" onClick={onClose}><X size={17} /></button></div>
  </header>;
}
