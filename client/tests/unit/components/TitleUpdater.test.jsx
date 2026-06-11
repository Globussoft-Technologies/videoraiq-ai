/**
 * TitleUpdater is a side-effect-only component: it reads the current route
 * from react-router and writes document.title.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TitleUpdater from "../../../src/components/TitleUpdater.jsx";

beforeEach(() => {
  document.title = "";
});

function renderAt(pathname) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <TitleUpdater />
    </MemoryRouter>
  );
}

describe("TitleUpdater", () => {
  it("sets the dashboard title for /dashboard", () => {
    renderAt("/dashboard");
    expect(document.title).toBe("Dashboard | VideoraIQ");
  });

  it("sets the root-path title for /", () => {
    renderAt("/");
    expect(document.title).toBe("VideoraIQ | Dashboard");
  });

  it("sets the incidents title for /incidents", () => {
    renderAt("/incidents");
    expect(document.title).toBe("Incidents | VideoraIQ");
  });

  it("falls back to the generic title for an unknown path", () => {
    renderAt("/this-route-does-not-exist");
    expect(document.title).toBe("VideoraIQ");
  });

  it("renders nothing in the DOM", () => {
    const { container } = renderAt("/dashboard");
    expect(container.firstChild).toBeNull();
  });
});
