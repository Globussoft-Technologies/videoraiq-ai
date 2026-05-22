/**
 * src/page/user/Detection/components/MiniCameraPreview.jsx — small leaf
 * that branches on `loadingPreviewImg` / `processedImage` and embeds the
 * DetectionPreviewModal for the fullscreen view.
 *
 * Mocks: 1 (DetectionPreviewModal stub so we don't have to keep the
 * Radix portal mounted; we just verify the `processedImage` content
 * branch and the empty-state copy).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock(
  "../../../../../../src/page/user/Detection/components/DetectionPreviewModal.jsx",
  () => ({
    default: ({ isOpen, children }) =>
      isOpen ? <div data-testid="preview-modal">{children}</div> : null,
  })
);

import MiniCameraPreview from "../../../../../../src/page/user/Detection/components/MiniCameraPreview.jsx";

describe("MiniCameraPreview", () => {
  it("renders a spinner while loadingPreviewImg is true", () => {
    const { container } = render(
      <MiniCameraPreview loadingPreviewImg={true} processedImage={null} />
    );
    expect(container.querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("renders the no-preview fallback when there is no image", () => {
    render(
      <MiniCameraPreview loadingPreviewImg={false} processedImage={null} />
    );
    // The empty-state copy appears in the inline placeholder and also
    // inside the modal subtree; both should be rendered as strings.
    expect(screen.getAllByText("No preview image").length).toBeGreaterThan(0);
  });

  it("renders the processed image as a raw data URI when it already has a data:image prefix", () => {
    const dataUri = "data:image/png;base64,AAAA";
    const { container } = render(
      <MiniCameraPreview loadingPreviewImg={false} processedImage={dataUri} />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe(dataUri);
  });

  it("wraps a bare base64 string into a data:image/jpeg data URI", () => {
    const { container } = render(
      <MiniCameraPreview loadingPreviewImg={false} processedImage="BBBB" />
    );
    const img = container.querySelector("img");
    expect(img.getAttribute("src")).toBe("data:image/jpeg;base64,BBBB");
  });
});
