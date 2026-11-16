import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
  request_more_tools: 'Loading more tools',
};
const toolLabel = (tool) => labels[tool] || (tool?.startsWith('prepare_add_') ? `Preparing new ${tool.slice(12).replaceAll('_', ' ')}` : String(tool || 'Tool').replaceAll('_', ' '));
function step(event) {
  const p = event.payload || {};
  if (event.kind === 'progress') return p.attempt > 1 ? 'Resumed from checkpoint' : 'Started';
  if (event.kind === 'routed') return p.request_type ? `Understood request · ${p.request_type}` : null;
  if (event.kind === 'model_call') return `Reasoning${p.seconds ? ` · ${p.seconds}s` : ''}`;
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
export default function RunActivity({ runId, active, status }) {
  const [open, setOpen] = useState(active);
  const [showAll, setShowAll] = useState(false);
  const [events, setEvents] = useState([]);
  useEffect(() => setOpen(active), [active, runId]);
  useEffect(() => {
    if (!active || !runId) return undefined;
    let stopped = false;
    let cursor = 0;
    let timer;
    const poll = async () => {
      if (document.hidden) { timer = window.setTimeout(poll, 5000); return; }
      try {
        let batch;
        do {
          batch = parseBatch(await agentApi.events(runId, cursor));
          if (stopped) return;
          if (batch.length) { cursor = batch.at(-1).cursor; setEvents((previous) => [...previous, ...batch]); }
        } while (batch.length === 200 && !stopped);
      } catch { /* Activity is optional; run status still comes from the conversation. */ }
      if (!stopped && active) timer = window.setTimeout(poll, 1500);
    };
    poll();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [runId, active]);
  const steps = events.reduce((list, event) => {
    const label = step(event);
    if (!label) return list;
    const callId = event.payload?.call_id;
    if (event.kind === 'tool_completed' && callId) {
      const started = list.find((item) => item.callId === callId);
      if (started) { started.label = label; started.state = event.payload?.errorCode ? 'error' : 'done'; started.detail = event.payload?.errorCode || ''; return list; }
    }
    list.push({ id: event.cursor, callId, label, state: event.kind === 'tool_started' ? 'active' : event.kind === 'tool_completed' && event.payload?.errorCode ? 'error' : 'done' });
    return list;
  }, []);
  const visibleSteps = active && !showAll ? steps.slice(-6) : steps;
  const activeLabel = status === 'verification_pending' ? 'Verifying the change'
    : [...steps].reverse().find((item) => item.state === 'active')?.label
      || (status === 'queued' ? 'Preparing your request' : 'Analyzing your request');
  return <div className={`agent-run-activity ${active ? 'agent-run-activity-live' : ''}`}>
    {active ? <div className="agent-run-activity-heading"><span className="agent-run-activity-pulse" /><span>{activeLabel}…</span>{steps.length > 0 && <span className="agent-run-activity-count">{steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>}{runId && <button type="button" className="agent-run-activity-toggle" aria-label={open ? 'Collapse activity' : 'Expand activity'} aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>}</div>
      : <button type="button" onClick={() => setOpen((value) => !value)}>{open ? 'Hide activity' : 'Show activity'}</button>}
    {open && steps.length > 0 && <><ol>{visibleSteps.map((item) => <li key={item.id} className={item.state}>{item.label}{item.detail && <span> · {item.detail}</span>}</li>)}</ol>{active && steps.length > 6 && <button className="agent-run-activity-more" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show recent steps' : `Show all activity (${steps.length})`}</button>}</>}
  </div>;
}
