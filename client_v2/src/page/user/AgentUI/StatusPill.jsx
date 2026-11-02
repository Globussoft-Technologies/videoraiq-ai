import { useEffect, useState } from 'react';
import { timings } from './data';

export default function StatusPill({ text }) {
  const [display, setDisplay] = useState(text);
  const [swapping, setSwapping] = useState(false);
  useEffect(() => { if (text === display) return; setSwapping(true); const id = window.setTimeout(() => { setDisplay(text); setSwapping(false); }, timings.tickerSwap); return () => window.clearTimeout(id); }, [text, display]);
  return <div className="agent-status inline-flex items-center"><span className="agent-status-dot" /><span className={`agent-status-text ${swapping ? 'swap' : ''}`}>{display}</span></div>;
}
