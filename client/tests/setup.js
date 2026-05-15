/**
 * Vitest setup for the client test suite.
 * Pulls in jest-dom matchers (toBeInTheDocument, toHaveClass, ...) and
 * resets the DOM + mocks between tests.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
