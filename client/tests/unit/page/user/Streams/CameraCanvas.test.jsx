/**
 * Round 47 — cover src/page/user/Streams/CameraCanvas.jsx.
 *
 * CameraCanvas is the small video-thumbnail tile shared by Incidents,
 * Streams and Playback. It receives a `src` (HLS / video URL) and a
 * `thumbnailSrc` (relative path appended to VITE_INCIDENT_URL), shows
 * the <video> when src is present and not yet errored, otherwise falls
 * back to a thumbnail <img>. If the thumbnail fetch fails it swaps in
 * a bundled fallback SVG (one swap only — the onError guards against
 * an infinite loop). The maximize button has two behaviours: when
 * isInModal=true it requests fullscreen on the wrapping div; otherwise
 * it pushes the src into UserContext (setStreamModalContentSrc) and
 * flips setStreamModalShow(true) so the parent shows the stream
 * modal. The component also re-renders when the fullscreen state
 * changes by listening to the document `fullscreenchange` events.
 *
 * Mocks:
 *   1. `@/assets/Missing.svg` — Vite asset import; resolve to a
 *      sentinel string so the fallback-swap branch can be asserted.
 *   2. UserContext — wrap renders in a Provider exposing two setter
 *      spies so we can prove the non-modal Maximize click dispatches
 *      both setStreamModalContentSrc(src) and setStreamModalShow(true).
 *
 * No product code is touched — this file lives entirely under tests/.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("@/assets/Missing.svg", () => ({ default: "missing.svg" }));

import CameraCanvas from "../../../../../src/page/user/Streams/CameraCanvas.jsx";
import UserContext from "../../../../../src/context/UserContext/Context.jsx";

const renderWithCtx = (ui, ctx = {}) => {
  const value = {
    setStreamModalShow: vi.fn(),
    setStreamModalContentSrc: vi.fn(),
    ...ctx,
  };
  const utils = render(
    <UserContext.Provider value={value}>{ui}</UserContext.Provider>
  );
  return { ...utils, value };
};

describe("Streams/CameraCanvas", () => {
  it("renders the <video> when src is provided and clicking Maximize (non-modal) pushes src into UserContext", () => {
    const { container, value } = renderWithCtx(
      <CameraCanvas src="rtsp://demo/stream.m3u8" thumbnailSrc="thumb.png" />
    );

    // Video element is rendered with the src; the fallback <img> is not.
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video.getAttribute("src")).toBe("rtsp://demo/stream.m3u8");
    expect(container.querySelector("img")).toBeNull();

    // Maximize button (not in modal mode) -> push src into context + show modal.
    fireEvent.click(screen.getByRole("button"));
    expect(value.setStreamModalContentSrc).toHaveBeenCalledWith(
      "rtsp://demo/stream.m3u8"
    );
    expect(value.setStreamModalShow).toHaveBeenCalledWith(true);
  });

  it("falls back to the thumbnail <img> when src is missing, and swaps in the bundled fallback SVG on the first img onError", () => {
    const { container, value } = renderWithCtx(
      <CameraCanvas thumbnailSrc="/missing-thumb.png" />
    );

    // No <video> when src is falsy; <img> is shown instead.
    expect(container.querySelector("video")).toBeNull();
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // src is built as `${VITE_INCIDENT_URL}${thumbnailSrc}` — VITE_INCIDENT_URL
    // is not defined in vitest.config.js so it resolves to `undefined`.
    expect(img.getAttribute("src")).toBe("undefined/missing-thumb.png");

    // First onError swaps to the fallback SVG (mocked to "missing.svg").
    fireEvent.error(img);
    expect(img.getAttribute("src")).toContain("missing.svg");

    // A second onError on the same fallback src is a no-op (guard against
    // infinite onError loop). The mocked fallback path stays put.
    const prev = img.getAttribute("src");
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(prev);

    // Non-modal Maximize click still wires through context with src=undefined.
    fireEvent.click(screen.getByRole("button"));
    expect(value.setStreamModalContentSrc).toHaveBeenCalledWith(undefined);
    expect(value.setStreamModalShow).toHaveBeenCalledWith(true);
  });

  it("when isInModal=true, the Maximize button requests fullscreen on its wrapping div and does NOT touch UserContext", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);

    // jsdom doesn't ship a real Fullscreen API; install just enough for the
    // `if (containerRef.current.requestFullscreen)` branch + the exit guard.
    const origReq = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = requestFullscreen;
    const origExitDesc = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    const origFsElemDesc = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement"
    );
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });

    try {
      const { value } = renderWithCtx(
        <CameraCanvas src="rtsp://demo/stream.m3u8" isInModal={true} />
      );
      fireEvent.click(screen.getByRole("button"));
      expect(requestFullscreen).toHaveBeenCalledTimes(1);
      // Modal mode must NOT push into UserContext.
      expect(value.setStreamModalShow).not.toHaveBeenCalled();
      expect(value.setStreamModalContentSrc).not.toHaveBeenCalled();
    } finally {
      Element.prototype.requestFullscreen = origReq;
      if (origExitDesc) {
        Object.defineProperty(document, "exitFullscreen", origExitDesc);
      } else {
        delete document.exitFullscreen;
      }
      if (origFsElemDesc) {
        Object.defineProperty(document, "fullscreenElement", origFsElemDesc);
      } else {
        delete document.fullscreenElement;
      }
    }
  });

  it("falls back to the thumbnail <img> when the <video> element fires onError (videoError flips true)", () => {
    const { container } = renderWithCtx(
      <CameraCanvas src="rtsp://demo/stream.m3u8" thumbnailSrc="/thumb.png" />
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();

    // Simulate the video failing to load -> onError -> videoError=true ->
    // showVideo becomes false -> <img> fallback renders.
    fireEvent.error(video);

    expect(container.querySelector("video")).toBeNull();
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // src is the literal `${VITE_INCIDENT_URL}${thumbnailSrc}` — VITE_INCIDENT_URL
    // is not defined in vitest.config.js so it stringifies to "undefined".
    expect(img.getAttribute("src")).toBe("undefined/thumb.png");
  });
});
