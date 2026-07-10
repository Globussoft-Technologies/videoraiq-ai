import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';

/**
 * Horizontal-scroll container that surfaces edge fades + a chevron whenever
 * there is more content off-screen, so users can tell a wide table is swipeable
 * on narrow screens. Content is given `minWidth` so it overflows (and scrolls)
 * instead of squishing.
 *
 * `fadeColor` should match the surface behind the table (defaults to --bg1).
 */
export default function HScrollHint({ children, minWidth, fadeColor = 'var(--bg1)', className = '' }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = () => {
    const el = ref.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setEdges({
      left: el.scrollLeft > 2,
      right: el.scrollLeft < maxScroll - 2,
    });
  };

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, []);

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div ref={ref} style={{ overflowX: 'auto' }}>
        <div style={{ minWidth }}>{children}</div>
      </div>

      {edges.left && (
        <>
          <div
            style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, width: 34, pointerEvents: 'none',
              background: `linear-gradient(to right, ${fadeColor}, transparent)`,
            }}
          />
          <div style={{ position: 'absolute', top: '50%', left: 4, transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)' }}>
            <ChevronLeft size={16} />
          </div>
        </>
      )}

      {edges.right && (
        <>
          <div
            style={{
              position: 'absolute', top: 0, bottom: 0, right: 0, width: 40, pointerEvents: 'none',
              background: `linear-gradient(to left, ${fadeColor}, transparent)`,
            }}
          />
          <div className="vq-scrollnudge" style={{ position: 'absolute', top: '50%', right: 5, transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx2)' }}>
            <ChevronRight size={16} />
          </div>
        </>
      )}
    </div>
  );
}
