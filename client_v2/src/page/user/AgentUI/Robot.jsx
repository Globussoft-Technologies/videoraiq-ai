import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { fetchIncidents } from '@/helpers/incidents';
import { robotMoves, timings } from './data';

export default function Robot({ criticalAlerts = null }) {
  const [move, setMove] = useState(null);
  const today = new Date().toLocaleDateString('en-CA');
  const criticalApi = useApi(
    () => fetchIncidents(
      { skip: 0, limit: 1 },
      { startDate: today, endDate: today, severity: ['critical', 'Critical', 'CRITICAL', 'high', 'High', 'HIGH'], statusFilter: ['new', 'resolved', 'reported'] },
    ),
    [today],
    { pollMs: 60000, pollSilent: true },
  );
  const liveCriticalAlerts = criticalAlerts ?? (criticalApi.data ? Number(criticalApi.data.totalCount) : null);
  const moves = robotMoves.map((item) => item.metric === 'criticalAlerts'
    ? { ...item, text: liveCriticalAlerts == null ? 'Checking critical alerts…' : `${Number(liveCriticalAlerts).toLocaleString()} critical alerts 🎉` }
    : item);
  useEffect(() => { let index = 0; let hide; let next; const act = () => { const current = moves[index]; index = (index + 1) % moves.length; setMove(current); hide = window.setTimeout(() => setMove(null), current.duration); next = window.setTimeout(act, current.duration + timings.robotPause); }; next = window.setTimeout(act, timings.robotStart); return () => { window.clearTimeout(hide); window.clearTimeout(next); }; }, [liveCriticalAlerts]);
  return <div className="agent-bot" aria-hidden="true"><div className="agent-orbit"><i /><i /><i /></div><div className={`agent-bubble ${move ? 'show' : ''}`}>{move?.text}</div><span className="agent-spark s1">✦</span><span className="agent-spark s2">✦</span><span className="agent-spark s3">✦</span><svg viewBox="-10 0 250 260" className={`agent-robot ${move?.className || ''}`}>
    <defs><linearGradient id="robot-white" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#d9d3f0" /></linearGradient><linearGradient id="robot-purple" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8a4cf5" /><stop offset="1" stopColor="#5a22c8" /></linearGradient><linearGradient id="robot-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2d1f7a" /><stop offset="1" stopColor="#150e45" /></linearGradient><radialGradient id="robot-eye"><stop offset="0" stopColor="#9fe8ff" /><stop offset="1" stopColor="#3b6bff" /></radialGradient></defs>
    <ellipse cx="105" cy="205" rx="52" ry="48" fill="url(#robot-white)" /><path d="M92 175 105 196 118 175" fill="none" stroke="#7a3ae0" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /><circle className="agent-core" cx="105" cy="222" r="7" fill="url(#robot-purple)" /><g className="larm"><ellipse cx="50" cy="208" rx="12" ry="28" fill="url(#robot-white)" transform="rotate(8 50 208)" /><circle cx="46" cy="236" r="11" fill="url(#robot-white)" /></g><g className="rarm"><ellipse cx="158" cy="208" rx="12" ry="28" fill="url(#robot-white)" transform="rotate(-8 158 208)" /><g className="hand"><ellipse cx="159" cy="224" rx="9" ry="4" fill="url(#robot-purple)" /><circle cx="162" cy="238" r="13" fill="url(#robot-white)" /><ellipse cx="149" cy="234" rx="4" ry="8" fill="url(#robot-white)" transform="rotate(25 149 234)" /></g></g><g className="head"><rect x="22" y="38" width="166" height="118" rx="52" fill="url(#robot-white)" /><rect x="8" y="76" width="22" height="42" rx="11" fill="url(#robot-purple)" /><rect x="180" y="76" width="22" height="42" rx="11" fill="url(#robot-purple)" /><rect x="40" y="56" width="130" height="84" rx="38" fill="url(#robot-face)" /><ellipse cx="82" cy="98" rx="14" ry="16" fill="url(#robot-eye)" className="agent-eye" /><ellipse cx="128" cy="98" rx="14" ry="16" fill="url(#robot-eye)" className="agent-eye" /><circle cx="86" cy="92" r="4" fill="#fff" opacity=".9" /><circle cx="132" cy="92" r="4" fill="#fff" opacity=".9" /><path d="M95 122q10 8 20 0" fill="none" stroke="#9fe8ff" strokeWidth="3" strokeLinecap="round" opacity=".7" /><ellipse cx="62" cy="120" rx="7" ry="4" fill="#ff7ad9" opacity=".35" /><ellipse cx="148" cy="120" rx="7" ry="4" fill="#ff7ad9" opacity=".35" /></g>
  </svg><div className="agent-shadow" /></div>;
}
