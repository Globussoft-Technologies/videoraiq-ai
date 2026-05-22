/**
 * src/page/user/Detection/components/olddetections.jsx — legacy
 * "DetectionSetting" page wrapper that composes AddNewConfiguration +
 * SavedConfiguration into a single page card with a header. It only owns
 * one piece of state (`addedDetection`) which is forwarded as both setter
 * and value to the children.
 *
 * Mocks (2): heavy children are stubbed to capture the props they receive.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const setAddedCalls = vi.hoisted(() => []);
const savedCalls = vi.hoisted(() => []);

vi.mock(
  "../../../../../../src/page/user/Detection/components/AddNewConfiguration",
  () => ({
    default: ({ setAddedDetection }) => (
      <button
        data-testid="add-new"
        onClick={() => {
          setAddedDetection(true);
          setAddedCalls.push(true);
        }}
      >
        AddNew
      </button>
    ),
  })
);

vi.mock(
  "../../../../../../src/page/user/Detection/components/SavedConfiguration",
  () => ({
    default: ({ setAddedDetection, addedDetection }) => {
      savedCalls.push(addedDetection);
      return (
        <div
          data-testid="saved"
          data-added={String(!!addedDetection)}
        >
          Saved
        </div>
      );
    },
  })
);

const { default: DetectionSetting } = await import(
  "../../../../../../src/page/user/Detection/components/olddetections.jsx"
);

describe("olddetections DetectionSetting page", () => {
  it("renders the page title and subtitle", () => {
    render(<DetectionSetting />);
    expect(screen.getByText("Detection Settings")).toBeInTheDocument();
    expect(
      screen.getByText("Configure Detection Settings")
    ).toBeInTheDocument();
  });

  it("renders both child sections", () => {
    render(<DetectionSetting />);
    expect(screen.getByTestId("add-new")).toBeInTheDocument();
    expect(screen.getByTestId("saved")).toBeInTheDocument();
  });

  it("starts with addedDetection=false", () => {
    render(<DetectionSetting />);
    expect(
      screen.getByTestId("saved").getAttribute("data-added")
    ).toBe("false");
  });

  it("AddNewConfiguration's setAddedDetection flips SavedConfiguration's addedDetection prop", () => {
    setAddedCalls.length = 0;
    render(<DetectionSetting />);
    fireEvent.click(screen.getByTestId("add-new"));
    expect(setAddedCalls.length).toBe(1);
    expect(
      screen.getByTestId("saved").getAttribute("data-added")
    ).toBe("true");
  });
});
