/**
 * TelegramService — the production file is short (sendMessage +
 * sendDomainRegistration) and was previously at 0% coverage. axios is mocked;
 * we just assert the request shape and the error swallow path.
 *
 * Mocks: 1 (axios).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));

const axios = (await import("axios")).default;
const { default: TelegramService } = await import(
  "../../../services/telegram.service.js"
);

beforeEach(() => {
  axios.post.mockReset();
});

describe("TelegramService.sendMessage", () => {
  it("POSTs to the Telegram bot endpoint with Markdown parse_mode", async () => {
    axios.post.mockResolvedValueOnce({ data: { ok: true } });
    await TelegramService.sendMessage("hello");

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toMatch(/^https:\/\/api\.telegram\.org\/bot.+\/sendMessage$/);
    expect(body).toMatchObject({
      chat_id: "test-chat-id",
      text: "hello",
      parse_mode: "Markdown",
    });
  });

  it("swallows axios failures (logs but does not throw)", async () => {
    axios.post.mockRejectedValueOnce(new Error("network down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(TelegramService.sendMessage("oops")).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("TelegramService.sendDomainRegistration", () => {
  it("formats the domain registration payload and forwards to sendMessage", async () => {
    axios.post.mockResolvedValueOnce({ data: { ok: true } });
    await TelegramService.sendDomainRegistration("example.com", "1.2.3.4", 8080);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const body = axios.post.mock.calls[0][1];
    expect(body.text).toContain("New Domain Registration");
    expect(body.text).toContain("Domain: example.com");
    expect(body.text).toContain("IP: 1.2.3.4");
    expect(body.text).toContain("Port: 8080");
    expect(body.parse_mode).toBe("Markdown");
  });
});
