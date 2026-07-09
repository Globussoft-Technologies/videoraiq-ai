import { Eye, EyeOff, ChevronDown, ArrowRight } from "lucide-react";

/* Shared light-theme building blocks for the employee/user portal pages.
   Kept separate from the admin login's AuthFields so the two never collide.
   Styling is Tailwind; the `vqp-*` classes hook into portal.css (focus rings,
   hover states, disabled) so those must stay. */

/* text input with optional leading icon + trailing slot (e.g. eye toggle) */
export function PInput({ icon: Icon, rightSlot, ...props }) {
  return (
    <div className="relative flex items-center">
      {Icon && <Icon size={16} className="absolute left-[13px] text-[#94a3b8] pointer-events-none" />}
      <input
        className={`vqp-input w-full h-[46px] rounded-[12px] bg-[#f6f8fc] border border-[#e3e8f0] text-[#0f1729] text-[14px] font-[inherit] outline-none transition-[border-color,box-shadow,background] duration-150 ${
          Icon ? "pl-[38px]" : "pl-[14px]"
        } ${rightSlot ? "pr-[42px]" : "pr-[14px]"}`}
        {...props}
      />
      {rightSlot}
    </div>
  );
}

/* native select styled to match PInput */
export function PSelect({ children, ...props }) {
  return (
    <div className="relative flex items-center">
      <select
        className={`vqp-select w-full h-[46px] pl-[14px] pr-[38px] rounded-[12px] bg-[#f6f8fc] border border-[#e3e8f0] text-[14px] font-[inherit] outline-none appearance-none cursor-pointer transition-[border-color,box-shadow,background] duration-150 ${
          props.value ? "text-[#0f1729]" : "text-[#9aa4b8]"
        }`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={16} className="absolute right-[13px] text-[#94a3b8] pointer-events-none" />
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
