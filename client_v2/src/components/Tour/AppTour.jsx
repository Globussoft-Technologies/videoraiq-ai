import { useCallback } from 'react';
// v3 dropped the default export — Joyride is a named export now.
import { Joyride, ACTIONS, EVENTS } from 'react-joyride';
import { useTour } from '@/context/TourContext';
import { useTheme } from '@/theme/ThemeContext';
import TourTooltip from './TourTooltip';

/**
 * Joyride host, run fully controlled.
 *
 * Controlled mode (`stepIndex` supplied, every advance driven from the event
 * handler) is what makes a tour that crosses routes possible: an autopilot
 * Joyride would advance while the next module's page is still mounting and
 * spotlight nothing. Here the context owns the position, and Joyride only
 * draws.
 *
 * Note the v3 API differs from the v2 one most examples online still show:
 * the handler prop is `onEvent` (not `callback`), and per-tour configuration
 * lives in a flat `options` object rather than inside `styles.options`. Getting
 * this wrong fails in a way that looks like a positioning bug — the tooltip
 * simply never reappears after the first step, because controlled mode is
 * waiting for a `stepIndex` change that the ignored handler never makes.
 */
export default function AppTour() {
  const { run, steps, stepIndex, goToStep, finish } = useTour();
  const { theme } = useTheme();
  const isDark = theme !== 'light';

  const handleEvent = useCallback(
    (data) => {
      if (!run) return;
      const { action, index, type } = data;

      // If an anchor vanishes mid-module, advance to the next step if available,
      // but never call finish() on missing targets to prevent runaway auto-skipping.
      if (type === EVENTS.TARGET_NOT_FOUND) {
        if (index + 1 < steps.length) {
          goToStep(index + 1);
        }
        return;
      }

      if (type === EVENTS.STEP_AFTER) {
        if (action === ACTIONS.PREV) {
          goToStep(Math.max(0, index - 1));
          return;
        }
        if (index + 1 >= steps.length) {
          // End of this module: hand back to the context, which either moves
          // to the next module or closes out the flow.
          finish();
          return;
        }
        goToStep(index + 1);
      }
    },
    [run, steps.length, goToStep, finish]
  );

  if (!steps.length) return null;

  return (
    <Joyride
      steps={steps}
      stepIndex={stepIndex}
      run={run}
      continuous
      tooltipComponent={TourTooltip}
      onEvent={handleEvent}
      styles={{
        spotlight: {
          stroke: isDark ? 'var(--blue)' : 'rgba(59, 130, 246, 0.75)',
          strokeWidth: isDark ? 2 : 1.5,
          style: {
            pointerEvents: 'none',
            filter: isDark
              ? 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.55))'
              : 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.35))',
          },
        },
      }}
      options={{
        // Above the header (60), the sidebar, and the mobile drawer backdrop
        // (75) — all of which the tour has to spotlight through.
        zIndex: 10000,
        arrowColor: 'var(--bg1solid)',
        overlayColor: isDark ? 'rgba(2, 6, 23, 0.78)' : 'rgba(2, 6, 23, 0.55)',
        primaryColor: 'var(--blue)',
        spotlightPadding: 6,
        spotlightRadius: 10,
        scrollOffset: 140,
        // Go straight to the tooltip. Without this a beacon is rendered first
        // and the user has to click a dot before each step appears.
        skipBeacon: true,
        // The tooltip carries explicit exits (an X plus the two skip links), so
        // a stray overlay click or Escape press must not be a third, ambiguous
        // way out — especially when one of the real exits is irreversible.
        overlayClickAction: false,
        dismissKeyAction: false,
      }}
    />
  );
}
