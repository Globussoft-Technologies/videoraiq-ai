/**
 * Round 97: cover Playback/Playback.jsx — the top-level "CCTV Playbacks"
 * page mounted under /playback. The full page is heavy (useReducer-driven
 * filters/state machine, PlaybackHeader + VideoSection children, multiple
 * useCallback fetchers each calling axios.post against
 * /api/v1/authorizedChannels/{getNVRS,getChannels,locations,departments},
 * a debounce'd camera search, websocket teardown on unmount, 5+ useEffects
 * that fire on mount), but the permission gates near the bottom of the
 * component short-circuit the render long before any of the downstream
 * JSX (PlaybackHeader / VideoSection / etc.) mounts:
 *
 *   const { permissions, loading: permissionsLoading } = usePermissions();
 *   const canView = permissions?.playbacks?.view;
 *   ...
 *   if (permissionsLoading) return <PageLoader />;
 *   if (!canView) {
 *     return <AccessDenied message="You don't have permission to view Playbacks." />;
 *   }
 *
 * Unlike Profile R63 / Incidents R62 (where the gate sits at the very top,
 * BEFORE any useEffect registers), Playback declares its useEffects above
 * the gate, so they DO register on the first render and DO fire after the
 * commit. We mock axios + useSocket + useLocation + getAccessToken + the
 * two heavy child files so those side effects can run to no-ops while we
 * observe the gate outputs. Same approach as VisibilityLog / GuardLog /
 * AccessLog specs.
 *
 * Mocks (8 — at the cap, each required to keep the first render +
 *   post-commit effect tick deterministic):
 *   1. @/context/Permission/PermissionContext   (drives the gate)
 *   2. @/components/AccessDenied                (deny branch sentinel)
 *   3. @/components/PageLoader                  (loading branch sentinel)
 *   4. @/context/Sockets/SocketContext          (useSocket returns refs)
 *   5. react-router-dom                         (useLocation for state)
 *   6. axios                                    (post no-ops -> useEffects)
 *   7. @/utils/getAccessToken                   (skip cookie access)
 *   8. ./PlaybackVideo                          (heavy import; assets +
 *                                                PlaybackStreams + Timeline)
 *
 * Test count: 3 (loading, deny, missing-perm fall-through).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";

const permissionsRef = vi.hoisted(() => ({ value: null }));

vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permissionsRef.value,
}));

vi.mock("@/components/AccessDenied", () => ({
  default: ({ message }) => (
    <div data-testid="access-denied">{message}</div>
  ),
}));

vi.mock("@/components/PageLoader", () => ({
  default: () => <div data-testid="page-loader">Loading…</div>,
}));

vi.mock("@/context/Sockets/SocketContext", () => ({
  useSocket: () => ({
    currentVideoRef: { current: null },
    resetCurrentVideoRef: vi.fn(),
  }),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ state: null, pathname: "/playback" }),
}));

vi.mock("axios", () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { body: { data: [] } } }),
    get: vi.fn().mockResolvedValue({ data: { body: { data: [] } } }),
  },
}));

vi.mock("@/utils/getAccessToken", () => ({
  default: () => "fake-token",
}));

// PlaybackVideo pulls in a long import chain (assets, PlaybackStreams,
// Dashboard/VideoCanvasStream, useHlsPlayer, etc.) at module-load time —
// stub the import path so the page module evaluates without those side
// effects. The gate prevents this child from rendering anyway.
vi.mock("../../../../../src/page/user/Playback/PlaybackVideo", () => ({
  default: () => <div data-testid="playback-video" />,
}));

const { default: Playback } = await import(
  "../../../../../src/page/user/Playback/Playback.jsx"
);

beforeEach(() => {
  permissionsRef.value = null;
});

// The useEffects above the gate (fetchNVRs initial-load + the
// selectedNVRId / selectedLocation / selectedDepartment / selectedCameraId
// reaction effects) still register on the first render and fire after the
// commit even when the gate short-circuits the return value. Flush their
// resolved setState calls inside act() so the React-DOM act-warning stays
// quiet and the test cleanup is deterministic.
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe("Playback page — Round 97 permission gates", () => {
  it("renders PageLoader while permissions are still loading", async () => {
    permissionsRef.value = { permissions: null, loading: true };

    render(<Playback />);
    await flush();

    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
    // AccessDenied / page chrome must not be in the tree yet.
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
    expect(screen.queryByTestId("playback-video")).not.toBeInTheDocument();
  });

  it("renders AccessDenied with the Playback-specific message when canView is false", async () => {
    permissionsRef.value = {
      permissions: { playbacks: { view: false } },
      loading: false,
    };

    render(<Playback />);
    await flush();

    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Playbacks/i);
    // PageLoader / page chrome must not be in the tree on the deny branch.
    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    expect(screen.queryByTestId("playback-video")).not.toBeInTheDocument();
  });

  it("renders AccessDenied when the permissions object is missing the playbacks entry entirely", async () => {
    // `permissions?.playbacks?.view` resolves to undefined -> canView falsy
    // -> AccessDenied branch. This covers the "permissions object missing
    // playbacks entirely" arm so the canView=undefined fall-through is
    // covered too (matches the pattern in UserDetails / DetectionSetting /
    // Camerasettings specs).
    permissionsRef.value = {
      permissions: {},
      loading: false,
    };

    render(<Playback />);
    await flush();

    const denied = screen.getByTestId("access-denied");
    expect(denied).toBeInTheDocument();
    expect(denied.textContent).toMatch(/permission to view Playbacks/i);
  });
});
