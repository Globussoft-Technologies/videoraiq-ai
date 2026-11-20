import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Robot from './Robot';
import { agentApi } from './agentApi';

const labels = {
  search_incidents: 'Searching incidents', summarize_incidents: 'Summarizing incidents',
  search_detector_logs: 'Searching detector logs', aggregate_events: 'Aggregating event analytics',
  query_advanced_analytics: 'Querying advanced analytics', get_advanced_records: 'Reading advanced records',
  find_cameras: 'Finding cameras', get_detection_status: 'Checking detection status',
  read_context: 'Reading camera context', rank_cameras_for_detection: 'Ranking cameras by suitability',
  review_incident_evidence: 'Reviewing incident evidence', get_playback_reference: 'Preparing playback reference',
  get_detector_mapping: 'Reading detector catalogue', get_product_overview: 'Reading product overview',
  get_capabilities: 'Checking available capabilities', describe_read_contract: 'Reading data contract',
  describe_action_contract: 'Reading the change contract', get_action_status: 'Checking action status',
  prepare_detection_change: 'Preparing a change proposal', list_admin_records: 'Listing administration records',
  get_detection_zone: 'Reading the detection zone', configure_detection_zone: 'Drawing a detection zone',
  edit_detection_zone: 'Editing the detection zone', reset_detection_thresholds: 'Preparing threshold reset',
  reset_detection_settings: 'Preparing settings reset', submit_report: 'Writing the report',
  request_more_tools: 'Loading more tools', save_investigation: 'Saving the investigation',
  prepare_add_alert_recipients: 'Preparing alert recipients',
};
const humanize = (value) => String(value).replaceAll('_', ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
const toolLabel = (tool) => labels[tool] || (tool?.startsWith('prepare_add_') ? `Preparing new ${tool.slice(12).replaceAll('_', ' ')}` : String(tool || 'Tool').replaceAll('_', ' '));
function step(event) {
  const p = event.payload || {};
  if (event.kind === 'progress') return p.attempt > 1 ? 'Resumed from checkpoint' : 'Started';
  if (event.kind === 'routed') return p.request_type ? `Understood request · ${humanize(p.request_type)}` : null;
  if (event.kind === 'model_call') return 'Reasoning';
  if (event.kind === 'tool_started') return toolLabel(p.tool);
  if (event.kind === 'tool_completed') return toolLabel(p.tool);
  if (event.kind === 'more_tools') return 'Loading more tools';
  if (event.kind === 'action_status') return `Action ${p.status || 'updated'}`;
  if (event.kind === 'human_decision') return p.decision === 'approve' ? 'You approved the change' : 'You cancelled the proposal';
  if (event.kind === 'budget_report_refused') return 'Report check refused – retrying';
  return null;
}
function parseBatch(batch) {
  return String(batch || '').split(/\r?\n\r?\n/).flatMap((block) => {
    const id = /^id:\s*(\d+)/m.exec(block)?.[1];
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!id || !data) return [];
    try { return [{ ...JSON.parse(data), cursor: Number(id) }]; } catch { return []; }
  });
}

function stepsFromEvents(events) {
  const steps = [];
  const open = new Map();
  for (const event of events) {
    const label = step(event);
    if (!label) continue;
    const { call_id: callId, errorCode, seconds, detector } = event.payload || {};
    const completed = event.kind === 'tool_completed';
    const started = event.kind === 'tool_started';
    const failed = (completed && errorCode) || event.kind === 'budget_report_refused';
    const detail = completed ? errorCode
      : event.kind === 'model_call' && Number.isFinite(seconds) ? seconds.toFixed(1) + 's'
      : event.kind === 'routed' && detector ? humanize(detector) : undefined;
    const index = callId == null ? undefined : open.get(String(callId));
    if (completed && index !== undefined) {
      steps[index] = { ...steps[index], state: failed ? 'error' : 'done', detail };
      open.delete(String(callId));
      continue;
    }
    if (started && callId != null) open.set(String(callId), steps.length);
    steps.push({ id: event.cursor, label, detail, state: started ? 'active' : failed ? 'error' : 'done' });
  }
  return steps;
}
export default function RunActivity({ runId, active, status, reconnecting, stopping, children }) {
  const [open, setOpen] = useState(active);
  const [events, setEvents] = useState([]);
  useEffect(() => { setOpen(active); setEvents([]); }, [runId, active]);
  useEffect(() => {
    if (!active || !runId) return undefined;
    const controller = new AbortController();
    let stopped = false;
    let cursor = 0;
    let timer;
    const poll = async () => {
      if (document.hidden) { timer = window.setTimeout(poll, 5000); return; }
      try {
        let batch;
        do {
          batch = parseBatch(await agentApi.events(runId, cursor, controller.signal))
            .filter((event) => event.cursor > cursor);
          if (stopped) return;
          if (batch.length) { cursor = batch.at(-1).cursor; setEvents((previous) => [...previous, ...batch]); }
        } while (batch.length === 200 && !stopped);
      } catch { /* Activity is optional; run status still comes from the conversation. */ }
      if (!stopped && active) timer = window.setTimeout(poll, 1500);
    };
    poll();
    return () => { stopped = true; controller.abort(); window.clearTimeout(timer); };
  }, [runId, active]);
  const steps = useMemo(() => stepsFromEvents(events), [events]);
  const latest = events.at(-1);
  const activeLabel = reconnecting ? 'Reconnecting to check run status'
    : stopping ? 'Stopping request'
    : status === 'verification_pending' ? 'Verifying the change'
    : [...steps].reverse().find((item) => item.state === 'active')?.label
      || (latest?.kind === 'tool_completed' ? 'Processing results' : step(latest || {}))
      || (status === 'queued' ? 'Preparing your request' : 'Analyzing your request');
  return <div className={`agent-run-activity ${active ? 'agent-run-activity-live' : ''}`}>
    {active ? <div className="agent-run-activity-heading">
      <Robot compact />
      <div className="agent-run-summary">
        <strong title={activeLabel}>{activeLabel}…</strong>
        <span className="agent-run-track" aria-hidden="true"><span className="agent-run-wave" /></span>
      </div>
      {steps.length > 0 && <button type="button" className="agent-run-details" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {steps.length} {steps.length === 1 ? 'step' : 'steps'}
        {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>}
    </div>
      : <button type="button" onClick={() => setOpen((value) => !value)}>{open ? 'Hide activity' : 'Show activity'}</button>}
    {children && <div className="agent-run-activity-actions">{children}</div>}
    {open && steps.length > 0 && <ol>
      {steps.map((item) => <li key={item.id} className={item.state} aria-current={item.state === 'active' ? 'step' : undefined}>
        {item.label}{item.detail && <span> · {item.detail}</span>}
      </li>)}
    </ol>}
  </div>;
}
