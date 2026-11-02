import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AgentUI from '@/page/user/AgentUI/AgentUI';

function useDraggablePosition(key, initial) {
  const [position, setPosition] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      return Number.isFinite(saved?.right) && Number.isFinite(saved?.bottom) ? saved : initial;
    } catch { return initial; }
  });
  const dragRef = useRef(null);
  const movedRef = useRef(false);

  const onPointerDown = useCallback((event) => {
    if (event.button !== 0 || (event.currentTarget.classList.contains('agent-drag-handle') && event.target.closest('button'))) return;
    const element = event.currentTarget.classList.contains('agent-drag-handle') ? event.currentTarget.closest('.agent-compact') : event.currentTarget;
    const rect = element.getBoundingClientRect();
    movedRef.current = false;
    dragRef.current = { x: event.clientX, y: event.clientY, right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.bottom, width: rect.width, height: rect.height };
  }, []);

  useEffect(() => {
    const move = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 4 && !movedRef.current) return;
      movedRef.current = true;
      setPosition({
        right: Math.min(Math.max(8, window.innerWidth - drag.width - 8), Math.max(8, drag.right - dx)),
        bottom: Math.min(Math.max(8, window.innerHeight - drag.height - 8), Math.max(8, drag.bottom - dy)),
      });
    };
    const stop = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); };
  }, []);

  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(position)); } catch { /* storage is optional */ } }, [key, position]);
  const consumeMove = () => { const moved = movedRef.current; movedRef.current = false; return moved; };
  return { position, onPointerDown, consumeMove };
}

export default function AgentLauncher() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [labelVisible, setLabelVisible] = useState(false);
  const [labelPlacement, setLabelPlacement] = useState('left');
  const labelTimer = useRef(null);
  const launcherRef = useRef(null);
  const launcher = useDraggablePosition('videora_agent_launcher_position', { right: 24, bottom: 20 });
  const panel = useDraggablePosition('videora_agent_panel_position', { right: 16, bottom: 16 });

  useLayoutEffect(() => {
    if (location.state?.agentOpenCompact === true) setOpen(true);
    if (location.state?.agentOpenCompact === false) setOpen(false);
  }, [location.key, location.state]);
  useEffect(() => () => window.clearTimeout(labelTimer.current), []);
  useLayoutEffect(() => {
    if (!labelVisible || !launcherRef.current) return;
    const rect = launcherRef.current.getBoundingClientRect();
    const sideReach = 180;
    const labelHeight = 50;
    let next;
    if (rect.left >= sideReach) next = 'left';
    else if (window.innerWidth - rect.right >= sideReach) next = 'right';
    else if (rect.top >= labelHeight + 12) next = 'top';
    else next = 'bottom';
    setLabelPlacement((current) => current === next ? current : next);
  }, [launcher.position, labelVisible]);
  const showLabel = () => {
    window.clearTimeout(labelTimer.current);
    setLabelVisible(true);
    labelTimer.current = window.setTimeout(() => setLabelVisible(false), 9000);
  };
  const hideLabel = () => {
    window.clearTimeout(labelTimer.current);
    labelTimer.current = window.setTimeout(() => setLabelVisible(false), 1200);
  };

  if (location.pathname === '/agent') return null;

  return <>
    {open && <AgentUI mode="compact" panelPosition={panel.position} onPanelPointerDown={panel.onPointerDown} onClose={() => setOpen(false)} onExpand={() => {
      navigate('/agent', { state: { agentReturnTo: `${location.pathname}${location.search}${location.hash}` } });
    }} />}
    {!open && <div ref={launcherRef} className={`vai-lw vai-label-${labelPlacement} ${labelVisible ? 'vai-label-visible' : ''}`} style={launcher.position} onPointerEnter={showLabel} onPointerLeave={hideLabel} onFocus={showLabel} onBlur={hideLabel} onPointerDown={launcher.onPointerDown}>
      <span className="vai-lab">Ask <em>VIDEORA</em> AI</span>
      <button type="button" className="vai-btn" aria-label="Open VideoraAI chat" onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setLook({ x: Math.max(-2.5, Math.min(2.5, (event.clientX - rect.left - rect.width / 2) / 12)), y: Math.max(-2.5, Math.min(2.5, (event.clientY - rect.top - rect.height / 2) / 12)) });
      }} onPointerLeave={() => setLook({ x: 0, y: 0 })} onClick={() => { if (!launcher.consumeMove()) setOpen(true); }}>
        <span className="vai-aura" /><span className="vai-orbit" /><span className="vai-frame" /><span className="vai-rec" /><span className="vai-gloss" />
        <svg className="vai-face" viewBox="0 0 64 64" aria-hidden="true"><rect x="11" y="28" width="4" height="10" rx="2" fill="#fff" opacity=".85" /><rect x="49" y="28" width="4" height="10" rx="2" fill="#fff" opacity=".85" /><path d="M32 21v-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><circle className="vai-ant" cx="32" cy="14" r="2.6" fill="#9fe8ff" /><rect x="16" y="21" width="32" height="25" rx="11" fill="#fff" /><rect x="19.5" y="24.5" width="25" height="18" rx="8" fill="#1b1250" /><g className="vai-look" style={{ transform: `translate(${look.x}px,${look.y}px)` }}><ellipse className="vai-eye" cx="27" cy="33" rx="2.8" ry="3.6" fill="#9fe8ff" /><ellipse className="vai-eye" cx="37" cy="33" rx="2.8" ry="3.6" fill="#9fe8ff" /><circle className="vai-eye-shine" cx="26.2" cy="31.5" r=".85" fill="#fff" /><circle className="vai-eye-shine" cx="36.2" cy="31.5" r=".85" fill="#fff" /></g></svg>
      </button>
    </div>}
  </>;
}
