import { useEffect, useState } from 'react';
import { targetLines } from './ApprovalDialog';

const words = (value) => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
export default function ProposalCard({ proposal, onReview, onNewChat, entityNames = new Map() }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const expiry = Date.parse(proposal.expiresAt);
  const remaining = Math.max(0, Math.ceil((expiry - now) / 1000));
  const expired = !Number.isFinite(expiry) || remaining === 0;
  const targets = proposal.targets || [];
  return <div className="agent-proposal-card"><strong>⚠ {expired ? 'Proposal expired · nothing has changed yet' : 'Waiting for your approval · nothing has changed yet'}</strong><span>{expired ? 'Expired' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} left`}</span><h3>{words(proposal.operation)} · {targets.length} targets</h3><ul>{targets.slice(0, 5).map((target, index) => {
    const camera = target.cameraName || target.before?.cameraName || entityNames.get(String(target.channelId || '').toLowerCase()) || 'Camera name unavailable';
    const detector = words(target.detectionType || proposal.impact?.detection || 'Detection');
    const lines = targetLines(proposal, target, entityNames);
    const admin = proposal.kind === 'admin' || proposal.operation?.startsWith('create_');
    const details = admin ? lines.slice(1) : lines;
    return <li key={index}><strong>{admin ? lines[0] : `${detector} · ${camera}`}</strong>{details.slice(0, 4).map((line, lineIndex) => <small key={lineIndex}>{line}</small>)}{details.length > 4 && <small>+ {details.length - 4} more in the review</small>}</li>;
  })}</ul>{targets.length > 5 && <small>+ {targets.length - 5} more in the review</small>}<footer><small>Expires {Number.isFinite(expiry) ? new Date(expiry).toLocaleString() : 'unknown'}</small><button type="button" onClick={expired ? onNewChat : onReview}>{expired ? 'Start new chat' : 'Review & decide'}</button></footer></div>;
}
