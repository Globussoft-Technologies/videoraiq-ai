import { useEffect, useId, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { fetchIncidents } from '@/helpers/incidents';
import { robotMoves, timings } from './data';

export default function Robot({ criticalAlerts = null, compact = false }) {
  const gradientId = useId();
  const [move, setMove] = useState(null);
  const today = new Date().toLocaleDateString('en-CA');
  const criticalApi = useApi(
    () => fetchIncidents(
      { skip: 0, limit: 1 },
      { startDate: today, endDate: today, severity: ['critical', 'Critical', 'CRITICAL', 'high', 'High', 'HIGH'], statusFilter: ['new', 'resolved', 'reported'] },
    ),
    [today],
    { enabled: !compact, pollMs: 60000, pollSilent: true },
  );
  const liveCriticalAlerts = criticalAlerts ?? (criticalApi.data ? Number(criticalApi.data.totalCount) : null);
  const moves = robotMoves.map((item) => item.metric === 'criticalAlerts'
    ? { ...item, text: liveCriticalAlerts == null ? 'Checking critical alerts…' : `${Number(liveCriticalAlerts).toLocaleString()} critical alerts 🎉` }
    : item);
  useEffect(() => { if (compact) return; let index = 0; let hide; let next; const act = () => { const current = moves[index]; index = (index + 1) % moves.length; setMove(current); hide = window.setTimeout(() => setMove(null), current.duration); next = window.setTimeout(act, current.duration + timings.robotPause); }; next = window.setTimeout(act, timings.robotStart); return () => { window.clearTimeout(hide); window.clearTimeout(next); }; }, [liveCriticalAlerts, compact]);
  return <div className={compact ? "agent-bot agent-bot-compact" : "agent-bot"} aria-hidden="true"><div className="agent-orbit"><i /><i /><i /></div><div className={`agent-bubble ${move ? 'show' : ''}`}>{move?.text}</div><span className="agent-spark s1">✦</span><span className="agent-spark s2">✦</span><span className="agent-spark s3">✦</span><svg viewBox={compact ? "0 0 220 207" : "-10 0 250 260"} className={`agent-robot ${move?.className || ''}`}>
    <defs><linearGradient id={`${gradientId}-white`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--ink, #fff)" /><stop offset="1" stopColor="#d9d3f0" /></linearGradient><linearGradient id={`${gradientId}-purple`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--ac, #8a4cf5)" /><stop offset="1" stopColor="var(--ac2, #5a22c8)" /></linearGradient><linearGradient id={`${gradientId}-face`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--f1, #2d1f7a)" /><stop offset="1" stopColor="var(--f2, #150e45)" /></linearGradient><radialGradient id={`${gradientId}-eye`}><stop offset="0" stopColor="var(--e1, #9fe8ff)" /><stop offset="1" stopColor="var(--e2, #3b6bff)" /></radialGradient></defs>
    {compact && <g><path d="M105 40V21" stroke="#8078c6" strokeWidth="5" /><circle cx="105" cy="15" r="9" fill="#83baff" /></g>}
    <ellipse cx="105" cy="205" rx="52" ry="48" fill={`url(#${gradientId}-white)`} /><path d="M92 175 105 196 118 175" fill="none" stroke="var(--ac2, #7a3ae0)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /><circle className="agent-core" cx="105" cy="222" r="7" fill={`url(#${gradientId}-purple)`} /><g className="larm"><ellipse cx="50" cy="208" rx="12" ry="28" fill={`url(#${gradientId}-white)`} transform="rotate(8 50 208)" /><circle cx="46" cy="236" r="11" fill={`url(#${gradientId}-white)`} /></g><g className="rarm"><ellipse cx="158" cy="208" rx="12" ry="28" fill={`url(#${gradientId}-white)`} transform="rotate(-8 158 208)" /><g className="hand"><ellipse cx="159" cy="224" rx="9" ry="4" fill={`url(#${gradientId}-purple)`} /><circle cx="162" cy="238" r="13" fill={`url(#${gradientId}-white)`} /><ellipse cx="149" cy="234" rx="4" ry="8" fill={`url(#${gradientId}-white)`} transform="rotate(25 149 234)" /></g></g><g className="head"><rect x="22" y="38" width="166" height="118" rx="52" fill={`url(#${gradientId}-white)`} /><rect x="8" y="76" width="22" height="42" rx="11" fill={`url(#${gradientId}-purple)`} /><rect x="180" y="76" width="22" height="42" rx="11" fill={`url(#${gradientId}-purple)`} /><rect x="40" y="56" width="130" height="84" rx="38" fill={`url(#${gradientId}-face)`} /><ellipse cx="82" cy="98" rx="14" ry="16" fill={`url(#${gradientId}-eye)`} className="agent-eye" /><ellipse cx="128" cy="98" rx="14" ry="16" fill={`url(#${gradientId}-eye)`} className="agent-eye" /><circle cx="86" cy="92" r="4" fill="var(--on, #fff)" opacity=".9" /><circle cx="132" cy="92" r="4" fill="var(--on, #fff)" opacity=".9" /><path d="M95 122q10 8 20 0" fill="none" stroke="var(--e1, #9fe8ff)" strokeWidth="3" strokeLinecap="round" opacity=".7" /><ellipse cx="62" cy="120" rx="7" ry="4" fill="#ff7ad9" opacity=".35" /><ellipse cx="148" cy="120" rx="7" ry="4" fill="#ff7ad9" opacity=".35" /></g>
  </svg><div className="agent-shadow" /></div>;
}
