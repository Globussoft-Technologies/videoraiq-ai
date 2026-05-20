/**
 * NVRAuthLogin is currently a stub page component that just renders its
 * own name. Lock the surface in a couple of trivial assertions so future
 * refactors stay honest.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NVRAuthLogin } from "../../../src/page/user/NVR/NVRAuthLogin.jsx";

describe("page/NVR/NVRAuthLogin", () => {
  it("renders without crashing", () => {
    const { container } = render(<NVRAuthLogin />);
    expect(container.firstChild).not.toBeNull();
  });

  it("displays its identifying placeholder text", () => {
    render(<NVRAuthLogin />);
    expect(screen.getByText("NVRAuthLogin")).toBeInTheDocument();
  });

  it("is a named (non-default) export", () => {
    expect(typeof NVRAuthLogin).toBe("function");
    expect(NVRAuthLogin.name).toBe("NVRAuthLogin");
  });
});
