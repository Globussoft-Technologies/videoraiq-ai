import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/utils/getAccessToken.js", () => ({
  default: vi.fn(),
}));

import getAccessToken from "../../../src/utils/getAccessToken.js";
import { waitForToken } from "../../../src/utils/waitForToken.js";

beforeEach(() => {
  getAccessToken.mockReset();
});

describe("waitForToken", () => {
  it("returns immediately when a token is already available", async () => {
    getAccessToken.mockReturnValue("token-123");
    await expect(waitForToken()).resolves.toBe("token-123");
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("retries until a token appears", async () => {
    // null, null, then a token on the 3rd call.
    getAccessToken
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValue("late-token");
    // Tiny delay so the exponential backoff doesn't slow the test.
    await expect(waitForToken(5, 1)).resolves.toBe("late-token");
    expect(getAccessToken).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all retries", async () => {
    getAccessToken.mockReturnValue(null);
    await expect(waitForToken(3, 1)).rejects.toThrow(
      /Failed to get access token/i
    );
    expect(getAccessToken).toHaveBeenCalledTimes(3);
  });

  it("treats an empty-string token as missing and keeps retrying", async () => {
    getAccessToken.mockReturnValueOnce("").mockReturnValue("real");
    await expect(waitForToken(3, 1)).resolves.toBe("real");
    expect(getAccessToken).toHaveBeenCalledTimes(2);
  });
});
