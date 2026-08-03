import { useEffect, useRef } from 'react';
import { SEVERITIES, SEVERITY_BY_KEY, INCIDENT_STATUS } from './detectionsData';
import DateRangePicker from '../../../../components/DateRangePicker';

const FILTERS = [{ key: 'all', label: 'All' }, ...SEVERITIES.map((s) => ({ key: s.key, label: s.label }))];

function IncidentRow({ incident }) {
  const sev = SEVERITY_BY_KEY[incident.severity] || SEVERITY_BY_KEY.low;
  const status = INCIDENT_STATUS[incident.status] || INCIDENT_STATUS.new;
  const source = [
    incident.camera,
    incident.site,
    incident.confidence == null ? null : `${incident.confidence}%`,
  ].filter(Boolean).join(' - ');

  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderLeft: `3px solid ${sev.color}`,
        borderRadius: 8,
        padding: '10px 13px 11px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '.04em',
            padding: '2px 6px',
            borderRadius: 4,
            color: sev.color,
            background: sev.tint,
            flex: '0 0 auto',
          }}
        >
          {sev.short}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
          {incident.time}
        </span>
      </div>

      <div
        title={incident.title}
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--tx)',
          margin: '7px 0 4px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {incident.title}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--tx3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {source || 'Alert source unavailable'}
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            flex: '0 0 auto',
            fontSize: 10,
            fontWeight: 600,
            color: status.color,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: status.color }} />
          {status.label}
        </span>
      </div>
    </div>
  );
}

export default function DetectionIncidents({
  incidents,
  loading = false,
  loadingMore = false,
  error = null,
  onRetry,
  totalCount,
  hasMore = false,
  onLoadMore,
  dateFrom = '',
  dateTo = '',
  onDateFromChange,
  onDateToChange,
  onDateClear,
  severity = 'all',
  onSeverityChange,
}) {
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [dateFrom, dateTo, severity]);

  const matchingCount = totalCount != null ? totalCount : incidents.length;
  const showInitialLoading = loading && incidents.length === 0;
  const hasRows = !error && incidents.length > 0;

  const handleScroll = (event) => {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 72) onLoadMore?.();
  };

  return (
    <div className="vq-det-incidents" style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'visible' }}>
      <style>{`
        .vq-det-incidents .vq-inc-datepicker {
          left: auto !important;
          right: 0;
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '15px 16px 12px' }}>
        <span style={{ fontFamily: 'var(--disp)', fontSize: 14, fontWeight: 600 }}>Incidents</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
          {showInitialLoading ? 'loading' : `${matchingCount} matching`}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '0 16px 14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minWidth: 0 }}>
          {FILTERS.map((f) => {
            const active = severity === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onSeverityChange?.(f.key)}
                style={{
                  height: 27,
                  padding: '0 13px',
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  color: active ? '#fff' : 'var(--tx2)',
                  background: active ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg2)',
                  border: `1px solid ${active ? 'transparent' : 'var(--bd)'}`,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', flex: '0 0 auto' }}>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onFrom={(value) => onDateFromChange?.(value)}
            onTo={(value) => onDateToChange?.(value)}
            onClear={() => onDateClear?.()}
          />
        </div>
      </div>

      <div
        ref={listRef}
        className="vq-scroll"
        onScroll={handleScroll}
        style={{
          maxHeight: 336,
          overflowY: 'auto',
          borderTop: '1px solid var(--bd)',
          padding: hasRows ? '12px 14px' : 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
        }}
      >
        {showInitialLoading ? (
          <div style={{ padding: '26px 16px', textAlign: 'center', fontSize: 12, color: 'var(--tx3)' }}>
            Loading alerts...
          </div>
        ) : error ? (
          <div style={{ padding: '22px 16px', textAlign: 'center', fontSize: 12, color: 'var(--tx3)' }}>
            <div style={{ marginBottom: 10 }}>Failed to load alerts</div>
            <button
              type="button"
              onClick={() => onRetry?.()}
              style={{
                height: 28,
                padding: '0 12px',
                borderRadius: 7,
                border: '1px solid var(--bd)',
                background: 'var(--bg2)',
                color: 'var(--tx2)',
                fontSize: 11.5,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        ) : incidents.length === 0 ? (
          <div style={{ padding: '26px 16px', textAlign: 'center', fontSize: 12, color: 'var(--tx3)' }}>
            No incidents for this filter
          </div>
        ) : (
          <>
            {incidents.map((incident) => <IncidentRow key={incident.id} incident={incident} />)}
            {loadingMore && (
              <div style={{ padding: '8px 0 2px', textAlign: 'center', fontSize: 11.5, color: 'var(--tx3)' }}>
                Loading more alerts...
              </div>
            )}
            {!loadingMore && hasMore && (
              <div style={{ padding: '5px 0 0', textAlign: 'center', fontSize: 10.5, color: 'var(--tx3)' }}>
                Scroll for more
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
