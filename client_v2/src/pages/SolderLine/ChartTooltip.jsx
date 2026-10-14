import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ChartTooltip({ anchor, id, children }) {
  const tooltipRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, top: 0, visible: false });
  useLayoutEffect(() => {
    const update = () => {
      const tooltip = tooltipRef.current;
      if (!anchor?.isConnected || !tooltip) {
        setPosition(previous => previous.visible ? { ...previous, visible: false } : previous);
        return;
      }
      const bar = anchor.getBoundingClientRect();
      const region = anchor.closest('[role="region"]')?.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const visible = bar.width > 0 && bar.height > 0 && bar.bottom > 0 && bar.top < viewportHeight
        && (!region || bar.right > region.left && bar.left < region.right);
      const { width, height } = tooltip.getBoundingClientRect();
      const margin = 12, gap = 10;
      const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
      let left, top = bar.top + (bar.height - height) / 2;
      if (bar.right + gap + width <= viewportWidth - margin) left = bar.right + gap;
      else if (bar.left - gap - width >= margin) left = bar.left - gap - width;
      else {
        left = bar.left + (bar.width - width) / 2;
        top = bar.top - gap - height >= margin ? bar.top - gap - height : bar.bottom + gap;
      }
      left = clamp(left, margin, viewportWidth - width - margin);
      top = clamp(top, margin, viewportHeight - height - margin);
      setPosition(previous => previous.left === left && previous.top === top && previous.visible === visible
        ? previous : { left, top, visible });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    if (anchor) observer.observe(anchor);
    const region = anchor?.closest('[role="region"]');
    if (region) observer.observe(region);
    if (tooltipRef.current) observer.observe(tooltipRef.current);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, [anchor, children]);
  return createPortal(<div ref={tooltipRef} id={id} role="tooltip" style={{ position: 'fixed', zIndex: 100, left: position.left, top: position.top, visibility: position.visible ? 'visible' : 'hidden',
    width: 250, maxWidth: 'calc(100% - 24px)', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, background: 'var(--bg1solid)', color: 'var(--tx)',
    border: '1px solid var(--bd2)', boxShadow: '0 4px 18px rgba(0,0,0,.16)', pointerEvents: 'none', fontSize: 11, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
    {children}
  </div>, document.body);
}
