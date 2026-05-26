/**
 * src/layout/Header/Header.jsx — top-level page chrome shown on every
 * authenticated route. Combines three contexts (AuthContext, Permission,
 * AllDetections) + UserContext (consumed via React.useContext) with four
 * child slot components (HeaderSkeleton / DesktopNav / MobileNav /
 * ProfileDropdown) and a status WebSocket that drives the inlined Install /
 * Upgrade affordances on the legacy commented-out HeaderActions branch.
 *
 * Behaviour we pin:
 *   - Loading state: while AuthContext reports isLoading=true the Header
 *     renders the HeaderSkeleton sentinel and none of the real header
 *     chrome (no logo, no DesktopNav, no mute button).
 *   - Loaded state (isLoading=false + setTimeout(1500) elapsed):
 *       * the logo, DesktopNav, MobileNav and ProfileDropdown sentinels all
 *         render.
 *       * the mute button is rendered with the Unmute aria-label when the
 *         AllDetections context exposes isMuted=false.
 *       * clicking the mute button forwards to AllDetections.toggleMute.
 *       * the Welcome-strip is rendered when user.name_f is present and the
 *         first letter is capitalised (e.g. "Welcome, Alice" for name_f
 *         "alice").
 *   - Permission filtering for navLinks (computed inside the component
 *     before render): with permissions = {} the filter is a no-op and all
 *     8 baseNavLinks are forwarded to DesktopNav (verified via the captured
 *     navLinks prop on the DesktopNav stub).
 *
 * Mocks (7 — within the 8 budget):
 *   - @/context/AuthContext (useAuth)
 *   - @/context/Permission/PermissionContext (usePermissions)
 *   - @/context/Sockets/AllDetectionContext (useAllDetections)
 *   - ./HeaderSkeleton — sentinel
 *   - ./DesktopNav — captures navLinks prop
 *   - ./MobileNav — sentinel
 *   - ./ProfileDropdown — sentinel
 *
 * Globals stubbed (not counted as mocks):
 *   - globalThis.WebSocket — Header's useEffect opens a status socket on
 *     mount; jsdom has no WebSocket implementation. We provide a tiny stub
 *     that records construction + exposes a close() method so the cleanup
 *     return is a no-op.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authRef = vi.hoisted(() => ({
  user: { name_f: "alice" },
  setUser: vi.fn(),
  isLoading: false,
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => authRef,
}));

const permsRef = vi.hoisted(() => ({ permissions: {} }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permsRef,
}));

const detRef = vi.hoisted(() => ({ isMuted: false, toggleMute: vi.fn() }));
vi.mock("@/context/Sockets/AllDetectionContext", () => ({
  useAllDetections: () => detRef,
}));

vi.mock("../../../../src/layout/Header/HeaderSkeleton", () => ({
  default: () => <div data-testid="header-skeleton" />,
}));

const desktopNavSpy = vi.fn();
vi.mock("../../../../src/layout/Header/DesktopNav", () => ({
  default: (props) => {
    desktopNavSpy(props);
    return <div data-testid="desktop-nav" />;
  },
}));

vi.mock("../../../../src/layout/Header/MobileNav", () => ({
  default: () => <div data-testid="mobile-nav" />,
}));

vi.mock("../../../../src/layout/Header/ProfileDropdown", () => ({
  default: () => <div data-testid="profile-dropdown" />,
}));

const { default: Header } = await import(
  "../../../../src/layout/Header/Header.jsx"
);
const { default: UserContext } = await import(
  "../../../../src/context/UserContext/Context.jsx"
);

// WebSocket stub — Header's mount effect opens `${VITE_SOCKET_URL}/statusinfo`.
// jsdom has no WebSocket; we install a tiny stub that exposes the shape
// the cleanup return checks (readyState, close).
class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
  }
  close() {}
}
FakeWebSocket.OPEN = 1;
FakeWebSocket.CONNECTING = 0;

function renderHeader() {
  const ctxValue = {
    detectionItems: [],
    detectionStates: {},
    handleDetectionToggle: vi.fn(),
  };
  return render(
    <MemoryRouter>
      <UserContext.Provider value={ctxValue}>
        <Header />
      </UserContext.Provider>
    </MemoryRouter>
  );
}

describe("layout/Header/Header", () => {
  let prevWS;

  beforeEach(() => {
    vi.useFakeTimers();
    prevWS = globalThis.WebSocket;
    globalThis.WebSocket = FakeWebSocket;
    // Reset shared refs between tests
    authRef.user = { name_f: "alice" };
    authRef.setUser = vi.fn();
    authRef.isLoading = false;
    permsRef.permissions = {};
    detRef.isMuted = false;
    detRef.toggleMute = vi.fn();
    desktopNavSpy.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = prevWS;
    cleanup();
  });

  it("renders the HeaderSkeleton while AuthContext.isLoading is true (no logo / nav / mute button)", () => {
    authRef.isLoading = true;
    renderHeader();

    expect(screen.getByTestId("header-skeleton")).toBeInTheDocument();
    // None of the loaded-state chrome is mounted.
    expect(screen.queryByAltText("Logo")).toBeNull();
    expect(screen.queryByTestId("desktop-nav")).toBeNull();
    expect(screen.queryByTestId("mobile-nav")).toBeNull();
    expect(screen.queryByTestId("profile-dropdown")).toBeNull();
    expect(screen.queryByLabelText(/mute detection audio/i)).toBeNull();
  });

  it("renders the full header chrome once auth finishes loading and the 1.5s mount timer elapses (logo + nav + mute + welcome)", () => {
    renderHeader();

    // Pump the setTimeout(1500) so internal `loading` flips to false.
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    // Skeleton is gone, real chrome is mounted.
    expect(screen.queryByTestId("header-skeleton")).toBeNull();
    expect(screen.getByAltText("Logo")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-nav")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-nav")).toBeInTheDocument();
    expect(screen.getByTestId("profile-dropdown")).toBeInTheDocument();

    // The mute button is rendered with the Unmute aria-label
    // (isMuted=false -> Volume2 icon + Mute-toggle aria-label).
    const muteButton = screen.getByLabelText("Mute detection audio");
    expect(muteButton).toBeInTheDocument();

    // Welcome strip renders with the first letter capitalised.
    expect(screen.getByText(/Welcome, Alice/)).toBeInTheDocument();
  });

  it("the mute button forwards clicks to AllDetections.toggleMute", () => {
    renderHeader();
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    fireEvent.click(screen.getByLabelText("Mute detection audio"));
    expect(detRef.toggleMute).toHaveBeenCalledTimes(1);
  });

  it("the mute button swaps to the 'Unmute detection audio' aria-label when isMuted=true", () => {
    detRef.isMuted = true;
    renderHeader();
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(
      screen.getByLabelText("Unmute detection audio")
    ).toBeInTheDocument();
    // The not-muted label is gone in this state.
    expect(screen.queryByLabelText("Mute detection audio")).toBeNull();
  });

  it("the Welcome strip is suppressed when user.name_f is missing", () => {
    authRef.user = { name_f: undefined };
    renderHeader();
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(screen.queryByText(/Welcome,/)).toBeNull();
    // But the rest of the header chrome still renders.
    expect(screen.getByTestId("desktop-nav")).toBeInTheDocument();
  });

  it("forwards the full 8-entry baseNavLinks list to DesktopNav when permissions={} (no filtering applied)", () => {
    renderHeader();
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    // DesktopNav was rendered at least once.
    expect(desktopNavSpy).toHaveBeenCalled();
    const lastCallProps = desktopNavSpy.mock.calls.at(-1)[0];
    expect(Array.isArray(lastCallProps.navLinks)).toBe(true);
    // Empty `permissions` short-circuits the filter to pass-through.
    // baseNavLinks has 8 entries: Dashboard, Incidents, NVR, Live, Playback,
    // Settings, Logs, User Details. Playback might be hidden by the
    // isPlaybackHidden() check if VITE_HIDE_PLAYBACK_FEATURE contains the
    // current user_id — but vitest.config does NOT set
    // VITE_HIDE_PLAYBACK_FEATURE so the env value is undefined and the
    // hidden list is empty, leaving all 8 entries in place.
    expect(lastCallProps.navLinks).toHaveLength(8);
    expect(lastCallProps.navLinks.map((l) => l.label)).toEqual([
      "Dashboard",
      "Incidents",
      "NVR",
      "Live",
      "Playback",
      "Settings",
      "Logs",
      "User Details",
    ]);
  });

  it("filters out the Settings tab when every settings sub-permission view is false", () => {
    permsRef.permissions = {
      dashboard: { view: true },
      incidents: { view: true },
      NVR: { view: true },
      LIVE: { view: true },
      playbacks: { view: true },
      // settings tab keys: detectionSettings / profiles / recipients / storageSettings all false
      detectionSettings: { view: false },
      profiles: { view: false },
      recipients: { view: false },
      storageSettings: { view: false },
      logs: { global: { view: true } },
      Users: { view: true },
    };
    renderHeader();
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    const lastCallProps = desktopNavSpy.mock.calls.at(-1)[0];
    expect(lastCallProps.navLinks.map((l) => l.label)).not.toContain("Settings");
    // The other seven tabs still pass.
    expect(lastCallProps.navLinks.map((l) => l.label)).toEqual([
      "Dashboard",
      "Incidents",
      "NVR",
      "Live",
      "Playback",
      "Logs",
      "User Details",
    ]);
  });
});
