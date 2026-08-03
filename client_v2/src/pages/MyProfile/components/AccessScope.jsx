import { useState } from 'react';
import { ServerCog, Truck, Building2, MapPin, ShieldCheck, ChevronDown } from 'lucide-react';

const CARD_HEIGHT = 440;

function Chip({ icon: Icon, label, color }) {
  return (
    <div
      className="group flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-3 text-[13px] font-medium transition-colors"
      style={{
        color: 'var(--tx)',
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        boxSizing: 'border-box',
      }}
      title={label}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${color}55`;
        e.currentTarget.style.background = `${color}0d`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--bd)';
        e.currentTarget.style.background = 'var(--bg2)';
      }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${color}17` }}
      >
        <Icon size={12} strokeWidth={2.25} style={{ color }} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </div>
  );
}

/** Standalone card per grant type — NVRs, Channels, Departments, Authorized
 * Locations, Employee Locations each get their own bordered card (not one
 * shared panel split into columns), matching the reference design. All 5
 * share CARD_HEIGHT so the row of cards stays aligned; expanding "+N more"
 * scrolls inside the card instead of growing it. */
function AccessCard({ icon: Icon, label, items, color, emptyLabel, previewCount = 6 }) {
  const [expanded, setExpanded] = useState(false);
  const list = items || [];
  const shown = expanded ? list : list.slice(0, previewCount);
  const hiddenCount = list.length - shown.length;

  return (
    <div
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl transition-shadow hover:shadow-lg"
      style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', height: CARD_HEIGHT }}
    >
      <div
        className="relative shrink-0 overflow-hidden"
        style={{ background: `linear-gradient(120deg,${color}1c,${color}08)` }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'repeating-linear-gradient(135deg,rgba(255,255,255,.035) 0 14px,transparent 14px 28px)' }}
        />
        <div className="relative flex items-center gap-2.5 p-4">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `linear-gradient(135deg,${color},${color}99)`, boxShadow: `0 6px 16px ${color}33` }}
          >
            <Icon size={16} color="#fff" strokeWidth={2.25} />
          </span>
          <span
            className="truncate text-[13.5px] font-semibold"
            style={{ fontFamily: 'var(--disp)', color: 'var(--tx)' }}
          >
            {label}
          </span>
          <span
            className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
            style={{ color: '#fff', background: color, fontVariantNumeric: 'tabular-nums' }}
          >
            {list.length}
          </span>
        </div>
      </div>

      {list.length ? (
        <div
          className="flex min-h-0 flex-1 flex-col p-4"
          style={list.length <= previewCount ? { justifyContent: 'flex-start' } : undefined}
        >
          <div
            className="vq-scroll flex min-h-0 flex-col gap-2 overflow-y-auto pr-0.5"
            style={list.length <= previewCount ? { flex: '0 1 auto' } : { flex: '1 1 auto' }}
          >
            {shown.map((item) => (
              <Chip key={item} icon={Icon} label={item} color={color} />
            ))}
          </div>
          {list.length > previewCount && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2.5 flex shrink-0 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-semibold cursor-pointer transition-colors"
              style={{ background: `${color}12`, color, border: `1px solid ${color}35` }}
            >
              {expanded ? 'Show less' : `+ ${hiddenCount} more`}
              <ChevronDown
                size={13}
                strokeWidth={2.5}
                style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
              />
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 pb-5 text-center">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'var(--bg2)' }}
          >
            <Icon size={16} strokeWidth={1.8} style={{ color: 'var(--tx3)' }} />
          </span>
          <span className="text-[12.5px] italic" style={{ color: 'var(--tx3)' }}>{emptyLabel}</span>
        </div>
      )}
    </div>
  );
}

/** Sub-user's granted access scope (server/core/v2/users users/fetch's
 * authorizedChannels join) — which NVRs, channels, departments, sites
 * (`locations`), and employee locations (`employeeLocations`) this account
 * can see, matching what Administer > Users' edit form grants. Rendered as 5
 * separate cards side by side rather than one shared panel. */
export default function AccessScope({ authorizedChannels }) {
  const nvrNames = (authorizedChannels?.nvrIds || []).map((n) => n?.nvrName).filter(Boolean);
  const channelNames = (authorizedChannels?.channels || []).map((c) => c?.name).filter(Boolean);
  const departmentNames = (authorizedChannels?.departmentIds || []).map((d) => d?.departmentName).filter(Boolean);
  const locations = authorizedChannels?.locations || [];
  const employeeLocations = authorizedChannels?.employeeLocations || [];

  const totalGrants = nvrNames.length + channelNames.length + departmentNames.length + locations.length + employeeLocations.length;

  return (
    <div className="rounded-2xl p-5" style={{ border: '1px solid var(--bd)', background: 'var(--bg1)' }}>
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: 'linear-gradient(135deg,var(--blue),var(--violet))' }}
        >
          <ShieldCheck size={14} color="#fff" strokeWidth={2.25} />
        </span>
        <h2 className="text-[13.5px] font-semibold tracking-tight" style={{ fontFamily: 'var(--disp)', color: 'var(--tx)' }}>
          Access Scope
        </h2>
        <span className="text-[11.5px]" style={{ color: 'var(--tx3)' }}>
          {totalGrants} grants across {[nvrNames.length, channelNames.length, departmentNames.length, locations.length, employeeLocations.length].filter(Boolean).length} categories
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <AccessCard
          icon={ServerCog}
          label="NVRs"
          items={nvrNames}
          color="var(--violet)"
          emptyLabel="No NVRs assigned"
        />
        <AccessCard
          icon={Truck}
          label="Channels"
          items={channelNames}
          color="var(--ok)"
          emptyLabel="No channels assigned"
        />
        <AccessCard
          icon={Building2}
          label="Departments"
          items={departmentNames}
          color="var(--magenta)"
          emptyLabel="No departments assigned"
        />
        <AccessCard
          icon={MapPin}
          label="Authorized Locations"
          items={locations}
          color="var(--blue)"
          emptyLabel="No authorized locations"
        />
        <AccessCard
          icon={MapPin}
          label="NVR Locations"
          items={employeeLocations}
          color="var(--warn)"
          emptyLabel="No employee locations"
        />
      </div>
    </div>
  );
}
