import { useState } from 'react';
import { ServerCog, Truck, Building2, MapPin, ChevronDown } from 'lucide-react';

const CARD_HEIGHT = 440;

function Chip({ icon: Icon, label, color }) {
  return (
    <div
      className="flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-3 text-[13px] font-medium"
      style={{
        color: 'var(--tx)',
        background: `${color}0d`,
        border: `1.5px solid ${color}40`,
        boxSizing: 'border-box',
      }}
      title={label}
    >
      <Icon size={14} strokeWidth={2} className="shrink-0" style={{ color }} />
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
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl"
      style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', height: CARD_HEIGHT }}
    >
      <div
        className="flex shrink-0 items-center gap-2.5 p-5 pb-4"
        style={{ borderTop: `2.5px solid ${color}` }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${color}1a` }}
        >
          <Icon size={16} color={color} strokeWidth={2.25} />
        </span>
        <span className="truncate text-[14px] font-semibold" style={{ color: 'var(--tx)' }}>
          {label}
        </span>
        <span
          className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ color, background: `${color}14`, fontVariantNumeric: 'tabular-nums' }}
        >
          {list.length}
        </span>
      </div>

      {list.length ? (
        <div
          className="flex min-h-0 flex-1 flex-col px-5 pb-5"
          style={list.length <= previewCount ? { justifyContent: 'flex-start' } : undefined}
        >
          <div
            className="vq-scroll flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-0.5"
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
              className="mt-2.5 flex shrink-0 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-medium cursor-pointer transition-colors hover:opacity-80"
              style={{ background: 'var(--bg2)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
            >
              {expanded ? 'Show less' : `+ ${hiddenCount} more`}
              <ChevronDown
                size={13}
                strokeWidth={2.25}
                style={{ color, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
              />
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-5 pb-5">
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

  return (
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
  );
}
