/**
 * src/page/user/Settings/Settings.jsx — thin layout composing
 * AlertPreferences and Reports. We stub the children to avoid pulling
 * in their real API / context deps; this file is essentially structural
 * markup, and we just want the wrapper code path covered.
 *
 * Mocks: 3 (AlertPreferences, Reports, NvrAlertsettings — the third is
 * imported but currently commented out in JSX; mocking it future-proofs
 * against the import side-effects).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock(
  "../../../../../src/page/user/Settings/components/AlertPreferences",
  () => ({
    default: () => <div data-testid="alert-preferences">AlertPreferences</div>,
  })
);

vi.mock("../../../../../src/page/user/Settings/components/Reports", () => ({
  default: () => <div data-testid="reports">Reports</div>,
}));

vi.mock(
  "../../../../../src/page/user/Settings/components/NvrAlertsettings",
  () => ({
    default: () => <div data-testid="nvr-alert-settings">NVRSettings</div>,
  })
);

import Settings from "../../../../../src/page/user/Settings/Settings.jsx";

describe("Settings page", () => {
  it("renders the AlertPreferences and Reports child sections", () => {
    render(<Settings />);
    expect(screen.getByTestId("alert-preferences")).toBeInTheDocument();
    expect(screen.getByTestId("reports")).toBeInTheDocument();
  });

  it("wraps everything in the page-level main container", () => {
    const { container } = render(<Settings />);
    expect(container.querySelector("main")).not.toBeNull();
    // The min-h-screen layout class lives on the outer wrapper.
    expect(container.querySelector(".min-h-screen")).not.toBeNull();
  });
});
