import { useMemo, useState } from 'react';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Cctv, ScanEye } from 'lucide-react';
import { detectionColor } from './detectionColors';

function StatusPill({ enabled }) {
  return (
    <span
      className="w-[72px] justify-self-end rounded-full py-1 text-center text-[10px] font-semibold"
      style={
        enabled
          ? { background: 'rgba(34,197,94,.12)', color: 'var(--ok)' }
          : { background: 'rgba(239,68,68,.12)', color: 'var(--crit)', border: '1px solid rgba(239,68,68,.22)' }
      }
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}

const GROUP_STATUS_STYLE = {
  enabled: { background: 'rgba(34,197,94,.12)', color: 'var(--ok)', label: 'Enabled' },
  partial: { background: 'rgba(245,158,11,.14)', color: 'var(--warn)', border: '1px solid rgba(245,158,11,.3)', label: 'Partial' },
  disabled: { background: 'rgba(239,68,68,.12)', color: 'var(--crit)', border: '1px solid rgba(239,68,68,.22)', label: 'Disabled' },
};

function GroupStatusPill({ status }) {
  const { label, ...style } = GROUP_STATUS_STYLE[status];
  return (
    <span className="w-[72px] justify-self-end rounded-full py-1 text-center text-[10px] font-semibold" style={style}>
      {label}
    </span>
  );
}

function groupBySettingType(detections) {
  const groups = new Map();
  (detections || []).filter((d) => d.cameras?.length).forEach((d) => {
    const key = d.settingType;
    const group = groups.get(key) || {
      settingType: key,
      name: d.name,
      items: [],
    };
    group.items.push(d);
    groups.set(key, group);
  });
  return [...groups.values()].map((group) => {
    const enabledCount = group.items.filter((d) => d.enabled).length;
    const totalCount = group.items.length;
    const status = enabledCount === 0 ? 'disabled' : enabledCount === totalCount ? 'enabled' : 'partial';
    return { ...group, enabledCount, totalCount, status };
  });
}

function SettingRow({ item }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 pl-[19px] pr-1">
      <span aria-hidden className="h-4 w-3 flex-shrink-0" style={{ borderLeft: '1.5px solid var(--bd)', borderBottom: '1.5px solid var(--bd)', borderBottomLeftRadius: 6 }} />
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md" style={{ background: 'var(--bg2)' }}>
        <Cctv size={12} strokeWidth={1.8} color="var(--tx3)" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: 'var(--tx)' }}>
        {item.cameras.length ? item.cameras.map((c) => c.name).join(', ') : 'No camera linked'}
      </span>
      <StatusPill enabled={item.enabled} />
    </div>
  );
}

function GroupRow({ group, isLast, expanded, onToggle }) {
  const { fg, bg } = detectionColor(group.settingType);
  const hasMultiple = group.totalCount > 1;

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--bd)' }}>
      <button
        type="button"
        onClick={hasMultiple ? onToggle : undefined}
        className="grid w-full items-center gap-3 px-1 py-3 text-left"
        style={{
          gridTemplateColumns: 'minmax(0,1fr) auto 88px',
          cursor: hasMultiple ? 'pointer' : 'default',
          background: 'transparent',
          border: 'none',
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: bg }}>
            <ScanEye size={16} strokeWidth={2} color={fg} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--tx)' }}>{group.name}</div>
            <div className="truncate text-[9.5px] uppercase tracking-wide" style={{ color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
              {group.settingType}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {hasMultiple && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'var(--bg2)', color: 'var(--tx3)', fontFamily: 'var(--mono)' }}
            >
              {group.enabledCount}/{group.totalCount} cameras
            </span>
          )}
          {hasMultiple && (
            <ChevronDown
              size={14}
              color="var(--tx3)"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
            />
          )}
        </div>

        <GroupStatusPill status={group.status} />
      </button>

      {hasMultiple && expanded && (
        <div className="pb-2 pt-0.5" style={{ background: 'var(--bg2)', borderRadius: 10, margin: '0 2px 6px' }}>
          {group.items.map((item) => (
            <SettingRow key={item.settingId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DetectionAllocation({ detections }) {
  const groups = useMemo(() => groupBySettingType(detections), [detections]);
  const [expandedTypes, setExpandedTypes] = useState(() => new Set());

  const total = groups.length;
  const enabledCount = groups.filter((g) => g.status !== 'disabled').length;
  const disabledCount = Math.max(total - enabledCount, 0);
  const pct = total ? Math.round((enabledCount / total) * 100) : 0;

  const expandableTypes = useMemo(() => groups.filter((g) => g.totalCount > 1).map((g) => g.settingType), [groups]);
  const anyExpanded = expandableTypes.some((t) => expandedTypes.has(t));

  const toggle = (settingType) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(settingType)) next.delete(settingType);
      else next.add(settingType);
      return next;
    });
  };

  const toggleAll = () => {
    setExpandedTypes(anyExpanded ? new Set() : new Set(expandableTypes));
  };

  return (
    <div className="rounded-2xl p-5" style={{ border: '1px solid var(--bd)', background: 'var(--bg1)' }}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: 'linear-gradient(135deg,var(--blue),var(--violet))' }}
          >
            <ScanEye size={16} color="#fff" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-tight" style={{ fontFamily: 'var(--disp)', color: 'var(--tx)' }}>
              Detection Allocation
            </h2>
            <span className="text-[11px]" style={{ color: 'var(--tx3)' }}>
              {enabledCount} enabled - {disabledCount} disabled
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expandableTypes.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: 'var(--bg2)', color: 'var(--tx2)', border: '1px solid var(--bd)' }}
            >
              {anyExpanded ? <ChevronsDownUp size={12} /> : <ChevronsUpDown size={12} />}
              {anyExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          )}
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'rgba(168,85,247,.12)', color: 'var(--violet)', fontFamily: 'var(--mono)' }}
          >
            {pct}%
          </span>
        </div>
      </div>

      <div className="my-4 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg2)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,var(--blue),var(--violet))' }}
        />
      </div>

      {total ? (
        <div className="max-h-96 overflow-y-auto vq-scroll">
          <div
            className="sticky top-0 z-10 grid items-center gap-3 px-1 pb-2 pt-1 text-[10px] uppercase tracking-wide"
            style={{
              gridTemplateColumns: 'minmax(0,1fr) auto 88px',
              background: 'var(--bg1)',
              borderBottom: '1px solid var(--bd)',
              color: 'var(--tx3)',
              fontFamily: 'var(--mono)',
            }}
          >
            <span>Detection</span>
            <span />
            <span className="justify-self-end">Status</span>
          </div>
          {groups.map((group, i) => (
            <GroupRow
              key={group.settingType}
              group={group}
              isLast={i === groups.length - 1}
              expanded={expandedTypes.has(group.settingType)}
              onToggle={() => toggle(group.settingType)}
            />
          ))}
        </div>
      ) : (
        <span className="text-xs" style={{ color: 'var(--tx3)' }}>No detection data available</span>
      )}
    </div>
  );
}
