import { CheckCircle2, ChevronRight, Clock3, Code2, XCircle } from 'lucide-react';

const words = (value) => String(value || '').replaceAll('_', ' ');
const labels = {
  completed: 'Applied and verified', verification_pending: 'Verification pending',
  partially_failed: 'Partly applied', failed: 'Not applied', cancelled: 'Cancelled',
  expired: 'Expired', approved: 'Approved', executing: 'Applying',
};

export default function ActionResult({ action, outcomes = [], entityNames = new Map() }) {
  const status = action.display_status || action.status || 'unknown';
  const targets = outcomes.length ? outcomes : action.normalized_target_results || action.targets || [];
  const Icon = status === 'completed' ? CheckCircle2 : ['failed', 'cancelled', 'expired'].includes(status) ? XCircle : Clock3;
  return <section className="agent-action-result">
    <div className="agent-action-heading"><span className={`agent-action-icon ${status}`}><Icon size={18} /></span><div><h3>{words(action.operation || 'Change')}</h3><span className={`agent-action-status ${status}`}>{labels[status] || words(status)}</span></div></div>
    {targets.length > 0 && <ul className="agent-action-targets">{targets.map((item, index) => <li key={item.actionId || item.channelId || index}><strong>{item.cameraName || item.locationName || item.label || entityNames.get(String(item.channelId || '').toLowerCase()) || 'Name unavailable'}</strong>{item.detectionType && <span>{words(item.detectionType)}</span>}<small>{item.verified ? 'Verified' : words(item.status || item.result?.status || 'Pending')}</small>{item.reason && <p>{item.reason}</p>}</li>)}</ul>}
    <details className="agent-action-details"><summary><ChevronRight size={15} /><Code2 size={15} /><span>Technical details</span></summary><pre>{JSON.stringify(action, null, 2).slice(0, 40000)}</pre></details>
  </section>;
}
