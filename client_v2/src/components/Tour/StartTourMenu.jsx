import { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, Play, Search, Route, SearchX, Loader2 } from 'lucide-react';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import { useTour } from '@/context/TourContext';
import { SHELL_TOUR } from '@/lib/tour/steps';
import { fetchTourModules } from '@/helpers/onboarding';

// The menu shows five modules at a time and scrolls past that, so the row
// height has to be fixed for the cut to land between rows rather than through
// one. These two numbers are the whole layout contract.
const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;

// Long enough that a normal typing burst is one request, short enough that the
// list still feels like it is filtering as you type.
const SEARCH_DEBOUNCE_MS = 220;

/**
 * "Start a Tour" — the manual entry point, in the header for every user.
 *
 * Deliberately not gated on `onboarded`: someone who finished (or skipped)
 * onboarding months ago is exactly who needs to revisit a module. It offers
 * two different things:
 *
 *  - Complete tour — replays the global flow: every module THIS user can open,
 *    in sidebar order. "Complete" is scoped to their entitlement, so a role with
 *    two modules gets a two-module tour, not a walk through the whole product.
 *    It is the same run new users get on first login, so it goes through
 *    `startGlobalTour` and will (re)set `onboarded` when it finishes. That is
 *    already true for anyone replaying it, so the write is a no-op for them.
 *  - A single module — jumps straight there and never touches `onboarded`.
 *
 * The module list and its search come from GET /admin/tour-modules, so the menu
 * is filtered by the same authority the sidebar answers to (role permissions
 * plus the resolved logs configuration) rather than by a second copy of those
 * rules here.
 */
export default function StartTourMenu() {
  const { startModuleTour, startGlobalTour, active } = useTour();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // How many modules this user may tour in total, captured from the unfiltered
  // fetch. Kept separate from `entries` because that shrinks as you search, and
  // the Complete tour row must describe the whole run, not the search result.
  const [allowedCount, setAllowedCount] = useState(null);

  const ref = useRef(null);
  const inputRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(ref, open, close);

  // Reset the filter each time it opens — a stale query from last time reads as
  // a broken menu ("where did my modules go?").
  useEffect(() => {
    if (!open) {
      setQuery('');
      return undefined;
    }
    // Drop whatever was listed last time before showing anything. Permissions
    // can have changed since — rendering the previous result while the fresh
    // one loads would briefly show a module the user has since lost.
    setEntries([]);
    setAllowedCount(null);
    setFailed(false);
    setLoading(true);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Fetch (and re-fetch on each debounced keystroke) while the menu is open.
  // The abort controller drops a superseded request rather than letting a slow
  // early response overwrite a newer one.
  useEffect(() => {
    if (!open) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetchTourModules(query, { signal: controller.signal })
        .then((modules) => {
          setEntries(modules);
          // Only an unsearched response describes the full entitlement.
          if (!query.trim()) setAllowedCount(modules.length +1);
          setFailed(false);
        })
        .catch((err) => {
          if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
          setEntries([]);
          setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, query ? SEARCH_DEBOUNCE_MS : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  // The shell orientation pass is offered alongside the real modules. It is not
  // a nav module, so the server does not know about it — it is prepended here,
  // and only when it matches what has been typed.
  const shellMatches =
    !query.trim() || SHELL_TOUR.label.toLowerCase().includes(query.trim().toLowerCase());
  const rows = [
    ...(shellMatches
      ? [{ key: SHELL_TOUR.key, label: SHELL_TOUR.label, group: 'ORIENTATION' }]
      : []),
    ...entries,
  ];

  const pick = (entry) => {
    setOpen(false);
    // Pass the whole server-supplied entry, not just the key: it is the object
    // the backend already permission-checked, so nothing here has to re-derive
    // (or re-trust) whether this module is allowed.
    startModuleTour(entry);
  };

  const pickComplete = () => {
    setOpen(false);
    startGlobalTour();
  };

  // Enter runs the top match, so the whole thing is reachable without the mouse.
  const onKeyDown = (event) => {
    if (event.key === 'Enter' && rows.length > 0) {
      event.preventDefault();
      pick(rows[0]);
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative', flex: '0 0 auto' }}>
      <button
        type="button"
        data-tour="hdr-start-tour"
        onClick={() => setOpen((o) => !o)}
        disabled={active}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Start a tour"
        title={active ? 'A tour is already running' : 'Start a tour of any module'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          height: 36,
          padding: '0 12px',
          borderRadius: 9,
          border: '1px solid var(--bd)',
          background: open ? 'var(--bg1solid)' : 'var(--bg2)',
          color: active ? 'var(--tx3)' : 'var(--tx2)',
          fontFamily: 'var(--ui)',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: active ? 'not-allowed' : 'pointer',
          opacity: active ? 0.6 : 1,
          whiteSpace: 'nowrap',
          transition: 'background .12s,color .12s',
        }}
      >
        <Compass size={15} strokeWidth={1.8} />
        <span className="vq-tour-btn-label">Start a Tour</span>
      </button>

      {open && (
        <div
          className="vq-fadeup"
          role="menu"
          style={{
            position: 'absolute',
            top: 44,
            right: 0,
            width: 292,
            background: 'var(--bg1solid)',
            border: '1px solid var(--bd2)',
            borderRadius: 12,
            boxShadow: '0 18px 50px rgba(0,0,0,.5)',
            zIndex: 70,
            overflow: 'hidden',
          }}
        >
          {/* Search */}
          <div style={{ padding: 8, borderBottom: '1px solid var(--bd)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 34,
                padding: '0 10px',
                borderRadius: 8,
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
              }}
            >
              <Search size={14} strokeWidth={1.8} style={{ flex: '0 0 auto', color: 'var(--tx3)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search modules…"
                aria-label="Search modules"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  border: 0,
                  outline: 'none',
                  color: 'var(--tx)',
                  fontFamily: 'var(--ui)',
                  fontSize: 12.5,
                }}
              />
              {loading && (
                <Loader2
                  size={13}
                  className="animate-spin"
                  style={{ flex: '0 0 auto', color: 'var(--tx3)' }}
                />
              )}
            </div>
          </div>

          {/* Complete tour — pinned, and never filtered out: it is the way back
              to the whole thing, so hiding it behind a search term would be a
              trap. */}
          <div style={{ padding: 6, borderBottom: '1px solid var(--bd)' }}>
            <button
              type="button"
              role="menuitem"
              onClick={pickComplete}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '9px 9px',
                borderRadius: 8,
                border: '1px solid transparent',
                background: 'linear-gradient(90deg,rgba(59,130,246,.14),rgba(168,85,247,.08))',
                color: 'var(--tx)',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--ui)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--blue)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <Route size={14} strokeWidth={2} style={{ flex: '0 0 auto', color: 'var(--blue)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>
                  Complete tour
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)', marginTop: 1 }}>
                  {allowedCount === null
                    ? 'Every module you can open'
                    : `All ${allowedCount} module${allowedCount === 1 ? '' : 's'} you can open`}
                </span>
              </span>
            </button>
          </div>

          <div
            style={{
              padding: '9px 12px 5px',
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              letterSpacing: '.14em',
              fontWeight: 600,
              color: 'var(--tx2)',
            }}
          >
            {query.trim() ? `${rows.length} MATCHING` : 'OR PICK ONE MODULE'}
          </div>

          <div
            className="vq-scroll"
            style={{
              maxHeight: ROW_HEIGHT * VISIBLE_ROWS,
              overflowY: 'auto',
              padding: '0 6px 6px',
            }}
          >
            {rows.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '14px 9px 16px',
                  color: 'var(--tx3)',
                  fontSize: 12,
                }}
              >
                {loading ? (
                  <span>Loading modules…</span>
                ) : (
                  <>
                    <SearchX size={15} strokeWidth={1.8} style={{ flex: '0 0 auto' }} />
                    <span>
                      {failed
                        ? 'Could not load modules. Try again in a moment.'
                        : `No module matches “${query.trim()}”.`}
                    </span>
                  </>
                )}
              </div>
            ) : (
              rows.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="menuitem"
                  onClick={() => pick(entry)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    width: '100%',
                    height: ROW_HEIGHT - 4,
                    padding: '0 9px',
                    borderRadius: 8,
                    border: 0,
                    background: 'transparent',
                    color: 'var(--tx)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'var(--ui)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Play size={12} strokeWidth={2} style={{ flex: '0 0 auto', color: 'var(--blue)' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 12.5,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {entry.label}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 9.5,
                        fontFamily: 'var(--mono)',
                        letterSpacing: '.1em',
                        color: 'var(--tx3)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {entry.group}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
