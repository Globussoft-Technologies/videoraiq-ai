import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, ChevronDown, ArrowRight, Check, Search } from "lucide-react";

/* Shared light-theme building blocks for the employee/user portal pages.
   Kept separate from the admin login's AuthFields so the two never collide.
   Styling is Tailwind; the `vqp-*` classes hook into portal.css (focus rings,
   hover states, disabled) so those must stay. */

/* text input with optional leading icon + trailing slot (e.g. eye toggle).
   Text is 16px on mobile — anything smaller makes iOS Safari zoom on focus. */
export function PInput({ icon: Icon, rightSlot, ...props }) {
  return (
    <div className="relative flex items-center">
      {Icon && <Icon size={16} className="absolute left-[13px] text-[#94a3b8] pointer-events-none" />}
      <input
        className={`vqp-input w-full h-[46px] rounded-[12px] bg-[#f6f8fc] border border-[#e3e8f0] text-[#0f1729] text-[16px] sm:text-[14px] font-[inherit] outline-none transition-[border-color,box-shadow,background] duration-150 ${
          Icon ? "pl-[38px]" : "pl-[14px]"
        } ${rightSlot ? "pr-[42px]" : "pr-[14px]"}`}
        {...props}
      />
      {rightSlot}
    </div>
  );
}

/* Custom dropdown used for Location / Department.
   The native <select> renders an OS-drawn list that ignores the portal styling
   and overflows the card once the option list gets long, so this replaces it
   with a scrollable, searchable panel anchored under the trigger.
   `options` is [{ value, label }]; `value` is the selected value. */
const PANEL_MAX_H = 268; // search box + option list + padding

/* Autofocusing the search box on a phone raises the keyboard over the option
   list, so only do it for mouse/trackpad pointers. */
const autoFocusSearch = !window.matchMedia?.("(pointer: coarse)").matches;

export function PCombo({
  options = [],
  value,
  onChange,
  placeholder = "Select",
  name,
  disabled = false,
  searchThreshold = 8,
  preferUp = false,
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [panelH, setPanelH] = useState(PANEL_MAX_H);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const showSearch = options.length >= searchThreshold;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Close on outside click / Esc so the panel never gets stranded open.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const pick = (opt) => {
    // Mimic a native change event so callers keep using `e.target.value`.
    onChange?.({ target: { name, value: opt.value } });
    setOpen(false);
  };

  /* Decide the open direction from the space actually available, so the panel
     never runs off-screen on any viewport. `preferUp` opens above the trigger
     whenever that side can hold the panel — these fields are the last row of
     the card, so an upward panel stays over the form instead of hanging past
     it (or off the bottom of a phone screen). */
  const toggle = () => {
    if (disabled) return;
    if (!open) {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) {
        const below = window.innerHeight - rect.bottom - 8;
        const above = rect.top - 8;
        const up = preferUp ? above >= PANEL_MAX_H || above > below : below < PANEL_MAX_H && above > below;
        setDropUp(up);
        setPanelH(Math.max(140, Math.min(PANEL_MAX_H, up ? above : below)));
      }
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={`vqp-input w-full h-[46px] pl-[14px] pr-[38px] rounded-[12px] bg-[#f6f8fc] border text-[15px] sm:text-[14px] font-[inherit] text-left outline-none flex items-center transition-[border-color,box-shadow,background] duration-150 ${
          open ? "border-[#2a6fdb] shadow-[0_0_0_3px_rgba(43,111,219,0.12)]" : "border-[#e3e8f0]"
        } ${selected ? "text-[#0f1729]" : "text-[#9aa4b8]"} ${
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        }`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown
          size={16}
          className={`absolute right-[13px] text-[#94a3b8] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          style={{ maxHeight: panelH }}
          className={`absolute z-30 left-0 right-0 flex flex-col rounded-[12px] bg-white border border-[#e3e8f0] shadow-[0_16px_38px_rgba(24,39,75,0.14)] overflow-hidden ${
            dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {showSearch && (
            <div className="relative p-2 border-b border-[#eef1f7] shrink-0">
              <Search size={14} className="absolute left-[19px] top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none" />
              <input
                autoFocus={autoFocusSearch}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full h-9 pl-[30px] pr-3 rounded-[9px] bg-[#f6f8fc] border border-[#e8ecf4] text-[16px] sm:text-[13px] text-[#0f1729] placeholder:text-[#9aa4b8] outline-none focus:border-[#bcd4f7]"
              />
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto vqp-scroll py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-[13px] text-[#94a3b8] text-center">No matches</div>
            ) : (
              filtered.map((opt) => {
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => pick(opt)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 sm:py-2 text-[14px] sm:text-[13.5px] text-left cursor-pointer transition-colors ${
                      active ? "bg-[#eef5ff] text-[#2a6fdb] font-semibold" : "text-[#334155] hover:bg-[#f4f7fd]"
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {active && <Check size={14} className="shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PEye({ shown, onToggle }) {
  return (
    <div
      className="vqp-eye absolute right-2 w-[30px] h-[30px] flex items-center justify-center cursor-pointer rounded-[7px] text-[#94a3b8]"
      onClick={onToggle}
    >
      {shown ? <Eye size={17} /> : <EyeOff size={17} />}
    </div>
  );
}

/* submit button — `variant` picks the tone: "primary" (blue) or "success" (green).
   `iconLeft` renders the glyph before the label (e.g. ✓ Complete Registration). */
const CTA_TONES = {
  primary: "bg-[#2a6fdb] shadow-[0_6px_16px_rgba(43,111,219,0.26)]",
  success: "bg-[linear-gradient(135deg,#22c55e,#16a34a)] shadow-[0_8px_22px_rgba(22,163,74,0.34)]",
};

export function PButton({ label, loading = false, disabled = false, icon: Icon = ArrowRight, type = "submit", variant = "primary", iconLeft = false, onClick }) {
  const tone = CTA_TONES[variant] || CTA_TONES.primary;
  const glyph = Icon && !loading ? <Icon size={17} /> : null;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`vqp-cta vqp-cta-${variant} w-full h-12 border-0 rounded-[12px] cursor-pointer font-['Space_Grotesk',sans-serif] font-semibold text-[14.5px] text-white flex items-center justify-center gap-[9px] transition-[box-shadow,transform,background] duration-[180ms] ${tone}`}
    >
      {iconLeft && glyph}
      {label}
      {!iconLeft && glyph}
    </button>
  );
}
