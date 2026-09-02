import { X } from 'lucide-react';
import { useTour } from '@/context/TourContext';

/**
 * The tour card.
 *
 * The reason this is a custom tooltip rather than Joyride's built-in one is the
 * two-skip requirement: Joyride ships a single "skip" action, and the whole
 * point here is that leaving a module and leaving onboarding are different
 * decisions with different consequences. So the footer offers both, worded so
 * the difference is obvious before it is clicked — and only the global one is
 * styled as a way out of the entire flow.
 */
export default function TourTooltip({
  backProps,
  index,
  isLastStep,
  primaryProps,
  size,
  step,
  tooltipProps,
}) {
  const { isGlobal, moduleLabel, modulePosition, skipModule, skipAll } = useTour();

  const linkBtn = {
    background: 'none',
    border: 0,
    padding: '4px 2px',
    cursor: 'pointer',
    fontFamily: 'var(--ui)',
    fontSize: 11.5,
    fontWeight: 500,
    color: 'var(--tx3)',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  };

  return (
    <div
      {...tooltipProps}
      style={{
        width: 'min(370px, calc(100vw - 32px))',
        background: 'var(--bg1solid)',
        border: '1px solid var(--bd2)',
        borderRadius: 14,
        boxShadow: '0 22px 60px rgba(0,0,0,.45)',
        fontFamily: 'var(--ui)',
        color: 'var(--tx)',
        overflow: 'hidden',
      }}
    >
      {/* Header: where you are in the flow */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '11px 12px 11px 14px',
          borderBottom: '1px solid var(--bd)',
          background: 'var(--bg2)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9.5,
            letterSpacing: '.14em',
            fontWeight: 600,
            color: 'var(--tx2)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {moduleLabel}
        </span>
        {modulePosition && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              fontWeight: 600,
              color: 'var(--tx3)',
              background: 'var(--bg1)',
              border: '1px solid var(--bd)',
              borderRadius: 5,
              padding: '2px 6px',
              whiteSpace: 'nowrap',
            }}
          >
            {modulePosition.index}/{modulePosition.total}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={skipAll}
          aria-label={isGlobal ? 'Skip the entire tour' : 'Close tour'}
          title={isGlobal ? 'Skip the entire tour' : 'Close tour'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 6,
            border: 0,
            background: 'transparent',
            color: 'var(--tx3)',
            cursor: 'pointer',
          }}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px 4px' }}>
        {step.title && (
          <div
            style={{
              fontFamily: 'var(--disp)',
              fontWeight: 600,
              fontSize: 15.5,
              letterSpacing: '-.01em',
              marginBottom: 7,
            }}
          >
            {step.title}
          </div>
        )}
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--tx2)' }}>{step.content}</div>
      </div>

      {/* Step dots */}
      <div style={{ display: 'flex', gap: 4, padding: '12px 16px 0' }}>
        {Array.from({ length: size }).map((_, i) => (
          <span
            key={i}
            style={{
              height: 3,
              flex: 1,
              borderRadius: 2,
              background:
                i <= index
                  ? 'linear-gradient(90deg,var(--blue),var(--violet))'
                  : 'var(--bd)',
              transition: 'background .2s',
            }}
          />
        ))}
      </div>

      {/* Primary actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px 10px',
        }}
      >
        <span style={{ fontSize: 11.5, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
          {index + 1} / {size}
        </span>
        <span style={{ flex: 1 }} />
        {index > 0 && (
          <button
            {...backProps}
            style={{
              height: 32,
              padding: '0 13px',
              borderRadius: 8,
              border: '1px solid var(--bd2)',
              background: 'transparent',
              color: 'var(--tx2)',
              fontFamily: 'var(--ui)',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        )}
        <button
          {...primaryProps}
          style={{
            height: 32,
            padding: '0 15px',
            borderRadius: 8,
            border: 0,
            background: 'linear-gradient(135deg,var(--blue),var(--violet))',
            color: '#fff',
            fontFamily: 'var(--ui)',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {isLastStep ? (isGlobal ? 'Next module' : 'Done') : 'Next'}
        </button>
      </div>

      {/* The two exits. Kept visually quieter than Next, and apart from each
          other, because they are easy to confuse and only one is reversible. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '9px 16px 12px',
          borderTop: '1px solid var(--bd)',
          background: 'var(--bg2)',
        }}
      >
        {isGlobal ? (
          <>
            <button type="button" onClick={skipModule} style={linkBtn}>
              Skip this module
            </button>
            <button type="button" onClick={skipAll} style={{ ...linkBtn, color: 'var(--tx2)' }}>
              Skip entire tour
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
              Exploring a single module
            </span>
            <button type="button" onClick={skipAll} style={linkBtn}>
              End tour
            </button>
          </>
        )}
      </div>
    </div>
  );
}
