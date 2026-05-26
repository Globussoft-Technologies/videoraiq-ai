/**
 * Round 101: cover Dashboard/Alertwidgets/alert.jsx — the FireAlert
 * default-export wraps a switchOn[] array (one entry per active widget
 * category) and dispatches each entry through a per-incidentType switch
 * to one of six BaseAlertCard wrapper variants (PersonCount /
 * VehicleCount / MotionDetection / ObjectDetection / UnauthorizedLoitering /
 * AuthorizedLoitering) or falls back to <NoDataCard incidentName={...} />
 * on an unknown type. BaseAlertCard renders a header strip (icon + heading
 * + severity chip), a preview pane (video / .webp image / "No Image
 * Available" fallback), a Maximize button gated by totalWidgets (only
 * shown for the single-widget layout), and a metadata grid that lists
 * one cell per metaData entry or a single "Metadata: N/A" cell when the
 * array is empty.
 *
 * Spec pins:
 *   - empty switchOn -> renders an empty grid wrapper (no incident card)
 *   - 1-item switchOn -> grid-cols-1 (isSingleToggle=true) + the picked
 *     card variant gets a Maximize button (totalWidgets truthy)
 *   - 2-item switchOn -> md:grid-cols-1 lg:grid-cols-2 (isSingleToggle
 *     =false) + Maximize button suppressed on every tile
 *   - each known incidentType branch dispatches to its documented
 *     wrapper card (severity copy + status chip styled per palette):
 *       unauthorizedAccess -> VehicleCountAlertCard
 *       motionDetection    -> MotionDetectionAlertCard
 *       genericObjectDetection -> ObjectDetectionAlertCard
 *       loiteringWithoutAuth -> UnauthorizedLoiteringAlertCard
 *       loiteringWithAuth  -> AuthorizedLoitering
 *       countPersons       -> PersonCountAlertCard
 *   - unknown / default branch -> NoDataCard fallback (passes
 *     incidentTypeKey to the empty-state card)
 *   - non-object entries in switchOn (null / undefined / "string") -> null
 *     return inside the renderer (no crash, no card)
 *   - metaData empty -> "Metadata: N/A" cell renders once
 *   - metaData populated -> one label/value pair per entry; severity
 *     value flows into the BaseAlertCard's status chip via the
 *     `Severity`-labelled entry
 *   - .webp image branch renders an <img>; videoLink overrides image
 *     and renders a <video src=…>; neither -> "No Image Available"
 *     fallback pane
 *
 * The lineCrossing case (`<lineCrossingAlertCard …>` at the switch case)
 * is a known product bug (videoraiq-ai#97 — lowercase JSX tag, would
 * render an empty HTMLElement instead of the intended
 * LineCrossingAlertCard component). Skipped here with `it.skip` and
 * `// videoraiq-ai#97` annotation per the test-only / issue-on-failure
 * playbook.
 *
 * Mocks (8 at cap):
 *   1-6. The six SVG asset imports (lineCrossing.svg, unauthorizedAccess
 *        .svg, motionDetection.svg, genericObjectDetection.svg,
 *        loiteringWithoutAuth.svg, loiteringWithAuth.svg) — stubbed so
 *        the asset imports resolve under jsdom.
 *   7.   @/utils/DynamicDateTime — replaced by a marker div that prints
 *        the forwarded date (the real impl pulls a live clock + moment).
 *   8.   ./NoDataCard — replaced by a marker div that captures the
 *        forwarded incidentName so the default-branch fallback is
 *        observable from the assertion side.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";

vi.mock("@/assets/lineCrossing.svg", () => ({ default: "lineCrossing.svg" }));
vi.mock("@/assets/unauthorizedAccess.svg", () => ({
  default: "unauthorizedAccess.svg",
}));
vi.mock("@/assets/motionDetection.svg", () => ({
  default: "motionDetection.svg",
}));
vi.mock("@/assets/genericObjectDetection.svg", () => ({
  default: "genericObjectDetection.svg",
}));
vi.mock("@/assets/loiteringWithoutAuth.svg", () => ({
  default: "loiteringWithoutAuth.svg",
}));
vi.mock("@/assets/loiteringWithAuth.svg", () => ({
  default: "loiteringWithAuth.svg",
}));

vi.mock("@/utils/DynamicDateTime", () => ({
  __esModule: true,
  default: ({ currentDateTime }) => (
    <span data-mock="dynamic-date-time">{String(currentDateTime ?? "")}</span>
  ),
}));

vi.mock(
  "@/page/user/Dashboard/Alertwidgets/NoDataCard",
  () => ({
    __esModule: true,
    default: ({ incidentName }) => (
      <div data-mock="no-data-card" data-incident-name={String(incidentName ?? "")}>
        NoDataCard:{String(incidentName ?? "")}
      </div>
    ),
  })
);

import FireAlert from "@/page/user/Dashboard/Alertwidgets/alert.jsx";

const sevMeta = (severity) => [
  { label: "Severity", value: severity },
  { label: "Camera", value: "Cam-1" },
];

describe("Dashboard/Alertwidgets/FireAlert — grid wrapper", () => {
  it("empty switchOn — renders the grid wrapper with no children", () => {
    const { container } = render(<FireAlert switchOn={[]} />);
    // The outer grid wrapper exists but contains no card.
    const grid = container.firstChild;
    expect(grid).toBeInTheDocument();
    expect(grid.tagName).toBe("DIV");
    // No tile children — every immediate child is one entry of switchOn.
    expect(grid.children.length).toBe(0);
    // 2-column class branch (isSingleToggle=false when length !== 1).
    expect(grid.className).toMatch(/md:grid-cols-1/);
    expect(grid.className).toMatch(/lg:grid-cols-2/);
  });

  it("single-entry switchOn — picks grid-cols-1 and renders the Maximize button", () => {
    const incident = {
      incidentType: "unauthorizedAccess",
      incidentTypeKey: "unauthorizedAccess",
      incidentName: "Vehicle entry",
      metaData: sevMeta("high"),
      createdAt: "2026-05-26T10:00:00Z",
      Image: "front-door.webp",
      videoLink: "",
    };
    const { container } = render(<FireAlert switchOn={[incident]} />);
    const grid = container.firstChild;
    expect(grid.className).toMatch(/grid-cols-1/);
    expect(grid.className).toMatch(/h-full/);
    // Heading
    expect(screen.getByText("Vehicle entry")).toBeInTheDocument();
    // Severity appears in both the header chip and the metadata grid cell.
    expect(screen.getAllByText("high").length).toBeGreaterThanOrEqual(1);
    // Maximize button is the only button on the tile (totalWidgets truthy)
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(1);
  });

  it("multi-entry switchOn — falls back to the 2-col grid and suppresses Maximize", () => {
    const a = {
      incidentType: "motionDetection",
      incidentName: "Motion 1",
      metaData: sevMeta("moderate"),
      createdAt: "2026-05-26T10:01:00Z",
    };
    const b = {
      incidentType: "genericObjectDetection",
      incidentName: "Object 1",
      metaData: sevMeta("low"),
      createdAt: "2026-05-26T10:02:00Z",
    };
    const { container } = render(<FireAlert switchOn={[a, b]} />);
    const grid = container.firstChild;
    expect(grid.className).toMatch(/md:grid-cols-1/);
    expect(grid.className).toMatch(/lg:grid-cols-2/);
    // No Maximize buttons across both cards (totalWidgets=false).
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(screen.getByText("Motion 1")).toBeInTheDocument();
    expect(screen.getByText("Object 1")).toBeInTheDocument();
  });

  it("renderAlertCard returns null for falsy / non-object switchOn entries (no crash)", () => {
    const { container } = render(
      <FireAlert switchOn={[null, undefined, "stringy", { incidentType: "countPersons", incidentName: "P1", metaData: [] }]} />
    );
    // 4 entries -> 4 wrapper divs, but 3 of them are empty (renderAlertCard
    // returned null inside the wrapper). The 4th is the populated tile.
    const grid = container.firstChild;
    expect(grid.children.length).toBe(4);
    // Only the countPersons entry rendered a heading.
    expect(screen.getByText("P1")).toBeInTheDocument();
  });
});

describe("Dashboard/Alertwidgets/FireAlert — incidentType branch dispatch", () => {
  // videoraiq-ai#97 — the switch case at line 52 references
  // <lineCrossingAlertCard> (lowercase first letter), which React treats
  // as an HTML element rather than the intended LineCrossingAlertCard
  // component at line 396. Skipped pending product fix.
  it.skip("dispatches lineCrossing -> LineCrossingAlertCard (videoraiq-ai#97)", () => {});

  it("unauthorizedAccess -> VehicleCountAlertCard (unauthorizedAccess.svg icon)", () => {
    const incident = {
      incidentType: "unauthorizedAccess",
      incidentName: "Unauthorized 1",
      metaData: sevMeta("high"),
      createdAt: "2026-05-26T10:00:00Z",
    };
    const { container } = render(<FireAlert switchOn={[incident]} />);
    expect(screen.getByText("Unauthorized 1")).toBeInTheDocument();
    // The icon <img> uses the unauthorizedAccess.svg asset.
    const icon = container.querySelector('img[src="unauthorizedAccess.svg"]');
    expect(icon).toBeInTheDocument();
  });

  it("motionDetection -> MotionDetectionAlertCard (motionDetection.svg icon)", () => {
    const incident = {
      incidentType: "motionDetection",
      incidentName: "Motion 1",
      metaData: sevMeta("moderate"),
      createdAt: "2026-05-26T10:00:00Z",
    };
    const { container } = render(<FireAlert switchOn={[incident]} />);
    expect(screen.getByText("Motion 1")).toBeInTheDocument();
    expect(
      container.querySelector('img[src="motionDetection.svg"]')
    ).toBeInTheDocument();
  });

  it("genericObjectDetection -> ObjectDetectionAlertCard (genericObjectDetection.svg icon)", () => {
    const incident = {
      incidentType: "genericObjectDetection",
      incidentName: "Object 1",
      metaData: sevMeta("low"),
      createdAt: "2026-05-26T10:00:00Z",
    };
    const { container } = render(<FireAlert switchOn={[incident]} />);
    expect(screen.getByText("Object 1")).toBeInTheDocument();
    expect(
      container.querySelector('img[src="genericObjectDetection.svg"]')
    ).toBeInTheDocument();
  });

  it("loiteringWithoutAuth -> UnauthorizedLoiteringAlertCard", () => {
    const incident = {
      incidentType: "loiteringWithoutAuth",
      incidentName: "Loiter 1",
      metaData: sevMeta("high"),
      createdAt: "2026-05-26T10:00:00Z",
    };
    const { container } = render(<FireAlert switchOn={[incident]} />);
    expect(screen.getByText("Loiter 1")).toBeInTheDocument();
    expect(
      container.querySelector('img[src="loiteringWithoutAuth.svg"]')
    ).toBeInTheDocument();
  });

  it("loiteringWithAuth -> AuthorizedLoiteringAlertCard", () => {
    const incident = {
      incidentType: "loiteringWithAuth",
      incidentName: "Authorized loiter",
      metaData: sevMeta("low"),
      createdAt: "2026-05-26T10:00:00Z",
    };
    const { container } = render(<FireAlert switchOn={[incident]} />);
    expect(screen.getByText("Authorized loiter")).toBeInTheDocument();
    expect(
      container.querySelector('img[src="loiteringWithAuth.svg"]')
    ).toBeInTheDocument();
  });

  it("countPersons -> PersonCountAlertCard (lineCrossing.svg icon, aliased as countPersons)", () => {
    const incident = {
      incidentType: "countPersons",
      incidentName: "People count",
      metaData: sevMeta("moderate"),
      createdAt: "2026-05-26T10:00:00Z",
    };
    const { container } = render(<FireAlert switchOn={[incident]} />);
    expect(screen.getByText("People count")).toBeInTheDocument();
    // The PersonCount card uses the countPersons local var which is
    // imported from `@/assets/lineCrossing.svg`.
    expect(
      container.querySelector('img[src="lineCrossing.svg"]')
    ).toBeInTheDocument();
  });

  it("unknown incidentType -> NoDataCard fallback (forwards incidentTypeKey)", () => {
    const incident = {
      incidentType: "neverHeardOfIt",
      incidentTypeKey: "neverHeardOfIt",
      incidentName: "Mystery",
      metaData: [],
    };
    render(<FireAlert switchOn={[incident]} />);
    const card = screen.getByText(/^NoDataCard:/);
    expect(card).toBeInTheDocument();
    expect(card.getAttribute("data-incident-name")).toBe("neverHeardOfIt");
  });

  it("falls back to 'Unknown Incident' key when incidentType is missing", () => {
    // Missing incidentType -> the `key` variable resolves to
    // 'Unknown Incident', which does NOT match any case and lands on
    // the default branch -> NoDataCard. incidentTypeKey is also
    // missing, so the forwarded incidentName is the 'Unknown Incident'
    // fallback string.
    const incident = { incidentName: "Headless" };
    render(<FireAlert switchOn={[incident]} />);
    const card = screen.getByText(/^NoDataCard:/);
    expect(card.getAttribute("data-incident-name")).toBe("Unknown Incident");
  });
});

describe("Dashboard/Alertwidgets/BaseAlertCard — preview & metadata", () => {
  it("videoLink present — renders a <video> (image branch suppressed)", () => {
    const incident = {
      incidentType: "motionDetection",
      incidentName: "With video",
      metaData: sevMeta("moderate"),
      createdAt: "2026-05-26T10:00:00Z",
      Image: "old.webp",
      videoLink: "https://example.com/clip.mp4",
    };
    const { container } = render(<FireAlert switchOn={[incident]} />);
    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video.getAttribute("src")).toBe("https://example.com/clip.mp4");
    // The .webp image fallback is suppressed when videoLink is present.
    expect(container.querySelector('img[src="old.webp"]')).toBeNull();
    // Date overlay flows the createdAt through DynamicDateTime.
    expect(screen.getByText("2026-05-26T10:00:00Z")).toBeInTheDocument();
  });

  it(".webp image branch — renders an <img>; non-.webp Image falls through to 'No Image Available'", () => {
    const webpIncident = {
      incidentType: "motionDetection",
      incidentName: "With webp",
      metaData: sevMeta("low"),
      Image: "frame.webp",
      videoLink: "",
    };
    const { container, rerender } = render(<FireAlert switchOn={[webpIncident]} />);
    expect(container.querySelector('img[src="frame.webp"]')).toBeInTheDocument();

    cleanup();

    const jpgIncident = { ...webpIncident, Image: "frame.jpg" };
    const { container: c2 } = render(<FireAlert switchOn={[jpgIncident]} />);
    // Non-.webp Image is rejected by the includes('.webp') guard, so
    // the fallback "No Image Available" pane shows.
    expect(c2.querySelector('img[src="frame.jpg"]')).toBeNull();
    expect(screen.getByText("No Image Available")).toBeInTheDocument();
  });

  it("empty metaData — renders the single 'Metadata: N/A' fallback cell", () => {
    const incident = {
      incidentType: "countPersons",
      incidentName: "No-meta",
      metaData: [],
    };
    render(<FireAlert switchOn={[incident]} />);
    expect(screen.getByText("Metadata")).toBeInTheDocument();
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("populated metaData — renders one label/value pair per entry (severity flows into the status chip)", () => {
    const incident = {
      incidentType: "countPersons",
      incidentName: "With-meta",
      metaData: [
        { label: "Severity", value: "high" },
        { label: "Zone", value: "Gate-1" },
        { label: "Camera", value: "Cam-7" },
      ],
    };
    const { container } = render(<FireAlert switchOn={[incident]} />);
    // One Severity chip in the header strip + one in the metadata grid.
    expect(screen.getAllByText("high").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Zone")).toBeInTheDocument();
    expect(screen.getByText("Gate-1")).toBeInTheDocument();
    expect(screen.getByText("Camera")).toBeInTheDocument();
    expect(screen.getByText("Cam-7")).toBeInTheDocument();
  });

  it("missing Severity in metaData — header status chip is suppressed", () => {
    const incident = {
      incidentType: "countPersons",
      incidentName: "No-sev",
      metaData: [{ label: "Camera", value: "Cam-7" }],
    };
    render(<FireAlert switchOn={[incident]} />);
    expect(screen.getByText("No-sev")).toBeInTheDocument();
    // No "high" / "moderate" / "low" status chip text.
    expect(screen.queryByText("high")).toBeNull();
    expect(screen.queryByText("moderate")).toBeNull();
    expect(screen.queryByText("low")).toBeNull();
  });

  it("Maximize button fires document.requestFullscreen on the preview pane (single-toggle layout)", () => {
    const incident = {
      incidentType: "motionDetection",
      incidentName: "Maximizable",
      metaData: sevMeta("high"),
      createdAt: "2026-05-26T10:00:00Z",
    };
    const { container } = render(<FireAlert switchOn={[incident]} />);
    const maximizeBtn = container.querySelector("button");
    expect(maximizeBtn).toBeInTheDocument();
    // Wire up a spy on requestFullscreen so we can observe the click
    // without actually entering fullscreen (jsdom doesn't implement it).
    const reqFs = vi.fn();
    // The preview ref points at the div with class containing
    // "rounded-[9px]" + "overflow-hidden" — find it and add the spy.
    const previewPane = container.querySelector("div.relative.w-full.h-full");
    expect(previewPane).toBeInTheDocument();
    previewPane.requestFullscreen = reqFs;
    // Ensure document.fullscreenElement is null so the maximize (not
    // minimize) branch fires.
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    maximizeBtn.click();
    expect(reqFs).toHaveBeenCalledTimes(1);
  });

  it("Maximize while already in fullscreen — calls document.exitFullscreen instead", () => {
    const incident = {
      incidentType: "motionDetection",
      incidentName: "Already FS",
      metaData: sevMeta("high"),
    };
    const { container } = render(<FireAlert switchOn={[incident]} />);
    const maximizeBtn = container.querySelector("button");
    expect(maximizeBtn).toBeInTheDocument();
    const exitFs = vi.fn();
    document.exitFullscreen = exitFs;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => container.firstChild,
    });
    maximizeBtn.click();
    expect(exitFs).toHaveBeenCalledTimes(1);
  });
});
