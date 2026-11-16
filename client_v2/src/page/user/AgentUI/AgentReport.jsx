import { useRef, useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import AgentMarkdown from './AgentMarkdown';
import ActionResult from './ActionResult';

const words = (value) => String(value || '').replace(/_/g, ' ');
const actionIdPattern = /\bAction(?:\s+ID)?\s*[:#]?\s*(?:[0-9a-f]{8}-[0-9a-f-]{27,36}|[0-9a-f]{24})\b/gi;
const rawIdPattern = /\b(?:[0-9a-f]{8}-[0-9a-f-]{27,36}|[0-9a-f]{24})\b/gi;
function readableAnswer(answer, actionResult, entityNames) {
  const operation = String(actionResult?.operation || '');
  const subject = operation.includes('location') ? 'Location' : operation.includes('camera') ? 'Camera' : operation.includes('zone') ? 'Detection zone' : 'Change';
  const target = (actionResult?.normalized_target_results || actionResult?.targets || [])[0];
  const name = target?.label || target?.locationName || target?.cameraName || target?.name;
  const label = name ? `${subject} ${name}` : `${subject} change`;
  return String(answer || '').replace(actionIdPattern, label)
    .replace(rawIdPattern, (id) => entityNames.get(id.toLowerCase()) || 'record');
}
export default function AgentReport({ report, sources = [], actionResult, entityNames = new Map(), theme }) {
  const answerRef = useRef(null);
  const [copyState, setCopyState] = useState('Copy');
  const copy = async () => {
    const element = answerRef.current;
    if (!element) return;
    const clean = element.cloneNode(true);
    clean.querySelectorAll('button, .agent-md-codebar').forEach((node) => node.remove());
    clean.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none';
    document.body.appendChild(clean);
    const plain = clean.innerText.trim();
    clean.remove();
    try {
      if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('Plain copy only');
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([plain], { type: 'text/plain' }),
        'text/html': new Blob([clean.innerHTML], { type: 'text/html' }),
      })]);
      setCopyState('Copied');
    } catch {
      try { await navigator.clipboard.writeText(plain); setCopyState('Copied'); }
      catch { setCopyState('Copy failed'); }
    }
    window.setTimeout(() => setCopyState('Copy'), 1800);
  };
  const stats = [['Total matching', report.total_matching], ['Records analyzed', report.records_analyzed], ['Visually reviewed', report.visual_evidence_reviewed]];
  const hasStructuredEvidence = Boolean(
    (report.coverage && report.coverage !== 'unknown')
    || stats.some(([, value]) => value != null && value !== 0)
    || report.findings?.length
    || report.recommendations?.length
    || sources.length
    || actionResult,
  );
  return <div className="agent-report">
    <div className="agent-report-answer-card"><div ref={answerRef}><AgentMarkdown text={readableAnswer(report.answer, actionResult, entityNames)} theme={theme} /></div>
    {report.clarification && <div className="agent-report-callout"><strong>Need a little more detail</strong><p>{report.clarification}</p></div>}
    {hasStructuredEvidence && report.coverage && report.coverage !== 'unknown' && <div className="agent-report-chips">
      <span className={`coverage ${report.coverage}`}>{words(report.coverage)} coverage</span>
      {report.time_range && <small>Resolved window {report.time_range.start || report.time_range[0]} → {report.time_range.end || report.time_range[1]}</small>}
    </div>}</div>
    <button type="button" className={`agent-report-copy${copyState === 'Copied' ? ' copied' : ''}`} onClick={copy} aria-label="Copy response" title="Copy response">{copyState === 'Copied' ? <Check size={14} /> : <Copy size={14} />}{copyState}</button>
    {report.warnings?.filter((warning) => !/no structured evidence[- ]backed report was produced/i.test(String(warning))).map((warning, index) => <div className="agent-report-warning" key={index}><AlertTriangle size={16} /><span>{warning}</span></div>)}
    {stats.some(([, value]) => value != null && value !== 0) && <><div className="agent-report-stats">{stats.map(([label, value]) => <div key={label}><strong>{value == null ? 'Unknown' : value}</strong><small>{label}</small></div>)}</div>{report.sampling_method && <small>Sampling: {report.sampling_method}</small>}</>}
{report.findings?.length > 0 && <section><h3>Findings</h3>{report.findings.map((finding, index) => <div className={`agent-report-item ${finding.kind || "observation"}`} key={index}><span className={`agent-report-badge ${finding.kind}`}>{words(finding.kind)}</span><p>{finding.statement}</p></div>)}</section>}
    {report.recommendations?.length > 0 && <section><h3>Recommendations</h3>{report.recommendations.map((item, index) => <div className={`agent-report-item recommendation ${item.priority || "medium"}`} key={index}><span className={`agent-report-badge ${item.priority}`}>{words(item.priority)}</span> <span className="agent-report-badge">{words(item.category)}</span>{item.owner && <small> Owner: {item.owner}</small>}<p>{item.text}</p>{item.follow_up && <p>→ Follow-up: {item.follow_up}</p>}</div>)}</section>}
    {actionResult && <ActionResult action={actionResult} outcomes={report.action_results || []} entityNames={entityNames} />}
  </div>;
}
