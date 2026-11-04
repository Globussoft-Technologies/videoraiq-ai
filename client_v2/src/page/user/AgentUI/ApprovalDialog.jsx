import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { agentApi } from './agentApi';

const names = {
  camera_detection_toggle: 'Detection', camera_processing_toggle: 'Camera processing',
  configure_detection_zone: 'Detection zone', edit_detection_zone: 'Detection zone',
  reset_detection_thresholds: 'Detection thresholds', reset_detection_settings: 'Detection settings',
};
const readable = (key) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
const value = (item, entityNames) => {
  if (item == null) return 'None';
  if (typeof item === 'boolean') return item ? 'On' : 'Off';
  if (typeof item === 'string') return entityNames.get(item.toLowerCase()) || (/^(?:[0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f-]{27,36})$/i.test(item) ? 'Name unavailable' : item);
  if (Array.isArray(item)) return item.map((part) => value(part, entityNames)).join(', ');
  return 'Details available after review';
};
function changes(before, after, entityNames, path = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && !Array.isArray(before) && !Array.isArray(after) && typeof before === 'object' && typeof after === 'object') {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) => changes(before[key], after[key], entityNames, path ? `${path}.${key}` : key));
  }
  return [`${readable(path || 'Value')}: ${value(before, entityNames)} → ${value(after, entityNames)}`];
}
function targetLines(proposal, target, entityNames) {
  if (proposal.kind === 'admin' || proposal.operation?.startsWith('create_')) {
    const record = target.after || {};
    const linked = ['roleIds', 'departmentIds', 'channelIds', 'nvrIds', 'locations'].flatMap((key) => {
      const entries = record[key] || record.access?.[key];
      return entries?.length ? [`${readable(key)}: ${value(entries, entityNames)}`] : [];
    });
    return [`Add ${readable(target.entity || proposal.operation.replace('create_', ''))}: ${target.label || value(target.after, entityNames)}`, ...linked];
  }
  const camera = target.before?.cameraName || target.cameraName || entityNames.get(String(target.channelId || '').toLowerCase()) || 'camera name unavailable';
  const detector = proposal.impact?.detection || readable(target.detectionType || names[proposal.operation] || 'Detection');
  const prefix = `${detector} on ${camera}`;
  if (proposal.operation === 'camera_detection_toggle' || proposal.operation === 'camera_processing_toggle') return [`${prefix}: ${value(target.before?.enabled, entityNames)} → ${value(target.after?.enabled, entityNames)}`];
  const changed = changes(target.before, target.after, entityNames).filter((line) => !line.startsWith('camera Name:'));
  return changed.length ? changed.map((line) => `${prefix}: ${line}`) : [`${prefix}: ${readable(proposal.operation)}`];
}

export default function ApprovalDialog({ approval, error, entityNames, onDecide, onClose, theme }) {
  const proposal = approval?.proposals?.[0];
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [preview, setPreview] = useState('');
  const [targetFilter, setTargetFilter] = useState('');
  const targets = useMemo(() => (proposal?.targets || []).map((target, index) => ({ index, lines: targetLines(proposal, target, entityNames) })), [proposal, entityNames]);
  const visibleTargets = useMemo(() => targets.filter((target) => target.lines.join(' ').toLocaleLowerCase().includes(targetFilter.trim().toLocaleLowerCase())), [targets, targetFilter]);
  useEffect(() => { setReviewed(false); setLocalError(''); setTargetFilter(''); }, [proposal?.actionId, proposal?.proposalVersion, proposal?.digest]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!proposal || proposal.kind !== 'zone' || !proposal.impact?.preview?.available) return undefined;
    let active = true;
    let url;
    agentApi.preview(proposal.actionId).then((blob) => { if (active) { url = URL.createObjectURL(blob); setPreview(url); } }).catch(() => { if (active) setPreview('unavailable'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); setPreview(''); };
  }, [proposal?.actionId]);
  if (!proposal) return null;
  const expiry = new Date(proposal.expiresAt).getTime();
  const expired = !Number.isFinite(expiry) || now >= expiry;
  const remaining = Math.max(0, Math.ceil((expiry - now) / 1000));
  const zonePoints = (proposal.targets || []).some((target) => target.before?.zones?.some((zone) => zone.points?.length) || target.after?.zones?.some((zone) => zone.points?.length));
  const warnings = [...(proposal.impact?.notes || []), ...(proposal.agentNotes || [])];
  if (proposal.operation === 'camera_processing_toggle') warnings.push(proposal.targets?.some((target) => target.after?.enabled) ? 'Resuming turns on EVERY linked detector on the camera.' : 'Pausing turns off EVERY linked detector.');
  if (proposal.operation === 'reset_detection_settings') warnings.push('This removes the detection from the camera and cannot be undone.');
  const submit = async (decision) => { setBusy(true); setLocalError(''); try { await onDecide(proposal, decision); } catch (failure) { setLocalError(failure.message); } finally { setBusy(false); } };
  return createPortal(<div className="agent-approval-backdrop" data-agent-theme={theme}><section className="agent-approval" role="dialog" aria-modal="true" aria-labelledby="agent-approval-title">
    <header className="agent-approval-header"><div><h2 id="agent-approval-title">{expired ? 'Proposal expired' : 'Confirm this change'}</h2><p className="agent-approval-unchanged">Nothing has changed yet.</p></div><span className={`agent-approval-status ${expired ? 'expired' : ''}`}>{expired ? 'Expired' : `Time left ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</span></header>
    {expired && <p className="agent-approval-expired" role="status">This proposal can no longer be approved. Ask the agent to prepare a new one.</p>}
    <div className="agent-approval-scroll"><h3>Changes <span>({targets.length})</span></h3>{targets.length > 10 && <label className="agent-approval-search"><span>Find a target</span><input type="search" value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)} placeholder="Search locations or cameras" /></label>}{targetFilter && <p className="agent-approval-filter-count">Showing {visibleTargets.length} of {targets.length} targets</p>}<ol className="agent-approval-targets">{visibleTargets.map((target) => <li key={target.index} data-number={target.index + 1}>{target.lines.map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}</li>)}</ol>
      {proposal.kind === 'zone' && (preview && preview !== 'unavailable' ? <img className="agent-approval-preview" src={preview} alt="Detection zone preview" /> : zonePoints && <p>No preview image: check the zone points carefully.</p>)}
      {warnings.length > 0 && <div className="agent-approval-warnings"><h3>Warnings</h3><ul>{warnings.map((note, index) => <li key={index}>{String(note)}</li>)}</ul></div>}
    </div>
    {!expired && <label className="agent-approval-check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> I reviewed all {targets.length} {targets.length === 1 ? 'change' : 'changes'}.</label>}
    {(localError || error) && <p className="agent-approval-error" role="alert">{localError || error}</p>}
    <div className="agent-approval-actions">{!expired && <><button type="button" onClick={() => submit('approve')} disabled={!reviewed || busy}>Approve</button><button type="button" onClick={() => submit('cancel')} disabled={busy}>Cancel change</button></>}<button type="button" onClick={() => onClose(proposal.actionId)} disabled={busy}>{expired ? 'Close' : 'Later'}</button></div>
  </section></div>, document.body);
}
