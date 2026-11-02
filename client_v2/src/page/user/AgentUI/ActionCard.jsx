function CardIcon({ type }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (type === 'analytics') return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" fillOpacity=".18" /><path d="M7.5 15.5 11 11l3 2.5 3.5-5" /><circle cx="17.5" cy="8.5" r="1" fill="currentColor" /></svg>;
  if (type === 'camera') return <svg {...common}><rect x="2.5" y="6.5" width="13" height="11" rx="3.5" fill="currentColor" fillOpacity=".18" /><path d="m15.5 10.5 5-3v9l-5-3" /><circle className="agent-rec" cx="6.5" cy="10.5" r="1.3" fill="#ef4444" stroke="none" /></svg>;
  if (type === 'detection') return <svg {...common}><g className="agent-bell"><path d="M6 17V11a6 6 0 1 1 12 0v6l1.8 2H4.2z" fill="currentColor" fillOpacity=".2" /><path d="M10 21a2 2 0 0 0 4 0" /></g><circle cx="18" cy="5" r="2.6" fill="#ef4444" stroke="#fff" strokeWidth="1.2" /></svg>;
  return <svg {...common}><path d="M12 3 4 6v6c0 4.5 3.5 7.5 8 9 4.5-1.5 8-4.5 8-9V6z" fill="currentColor" fillOpacity=".18" /><path d="M12 8v5" /><circle cx="12" cy="16.3" r=".6" fill="currentColor" /></svg>;
}

export default function ActionCard({ card, active, onAsk }) {
  return <button type="button" className={`agent-card ${card.tone} flex items-center text-left ${active ? 'active' : ''}`} onClick={() => onAsk(card.query)} aria-label={card.title}><span className={`agent-card-icon ${card.tone} grid shrink-0 place-items-center`}><CardIcon type={card.icon} /></span><span><b>{card.title}</b><small>{card.description}</small></span></button>;
}
