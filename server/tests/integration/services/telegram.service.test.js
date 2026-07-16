/**
 * TelegramService — the production file is short (sendMessage +
 * sendDomainRegistration) and was previously at 0% coverage. axios is mocked;
 * we just assert the request shape and the error swallow path.
 *
 * Mocks: 1 (axios).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));
vi.mock("../../../core/v1/admin/admin.model.js", () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}));

const axios = (await import("axios")).default;
const adminModel = (await import("../../../core/v1/admin/admin.model.js")).default;
const { default: TelegramService } = await import(
  "../../../services/telegram.service.js"
);

// adminModel queries chain .select().lean() — resolve to `value`.
const chainResolving = (value) => ({ select: () => ({ lean: async () => value }) });

beforeEach(() => {
  axios.post.mockReset();
  adminModel.findOne.mockReset();
  adminModel.findOneAndUpdate.mockReset();
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

describe("TelegramService._deliver photo-fetch retry", () => {
  const fetchErr = () => ({
    response: {
      data: { ok: false, error_code: 400, description: "Bad Request: failed to get HTTP URL content" },
    },
  });

  it("retries sendPhoto once when Telegram can't fetch the image URL", async () => {
    axios.post.mockRejectedValueOnce(fetchErr()).mockResolvedValueOnce({ data: { ok: true } });

    vi.useFakeTimers();
    const p = TelegramService._deliver({ token: "t", chat: "c", message: "m", imageUrl: "http://img" });
    await vi.advanceTimersByTimeAsync(3000);
    await p;
    vi.useRealTimers();

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][0]).toMatch(/sendPhoto$/);
    expect(axios.post.mock.calls[1][0]).toMatch(/sendPhoto$/);
  });

  it("falls back to text only after every scheduled photo retry fails", async () => {
    axios.post
      .mockRejectedValueOnce(fetchErr())
      .mockRejectedValueOnce(fetchErr())
      .mockRejectedValueOnce(fetchErr())
      .mockResolvedValueOnce({ data: { ok: true } });

    vi.useFakeTimers();
    const p = TelegramService._deliver({ token: "t", chat: "c", message: "m", imageUrl: "http://img" });
    await vi.advanceTimersByTimeAsync(3000); // first retry
    await vi.advanceTimersByTimeAsync(15000); // second retry
    await p;
    vi.useRealTimers();

    expect(axios.post).toHaveBeenCalledTimes(4); // photo ×3, then text
    expect(axios.post.mock.calls[2][0]).toMatch(/sendPhoto$/);
    expect(axios.post.mock.calls[3][0]).toMatch(/sendMessage$/);
  });
});

describe("TelegramService.handleUpdate linking", () => {
  const update = { channel_post: { text: "VRIQ-ABCDEF12", chat: { id: -100123 } } };

  it("does NOT bind the channel when the bot cannot post the confirmation", async () => {
    adminModel.findOne.mockReturnValueOnce(chainResolving({ _id: "a1" }));
    axios.post.mockRejectedValueOnce({
      response: {
        data: { ok: false, error_code: 400, description: "Bad Request: need administrator rights in the channel chat" },
      },
    });

    const res = await TelegramService.handleUpdate(update);

    expect(res.matched).toBe(false);
    expect(adminModel.findOneAndUpdate).not.toHaveBeenCalled(); // code stays active, chat not bound
  });

  it("binds the channel only after the confirmation is delivered", async () => {
    adminModel.findOne.mockReturnValueOnce(chainResolving({ _id: "a1" }));
    axios.post.mockResolvedValueOnce({ data: { ok: true } });
    adminModel.findOneAndUpdate.mockReturnValueOnce(chainResolving({ _id: "a1" }));

    const res = await TelegramService.handleUpdate(update);

    expect(res).toMatchObject({ ok: true, matched: true, adminId: "a1", chatId: "-100123" });
    expect(axios.post.mock.calls[0][0]).toMatch(/sendMessage$/);
    expect(adminModel.findOneAndUpdate).toHaveBeenCalledWith(
      { telegramLinkCode: "VRIQ-ABCDEF12" },
      { $set: { telegramChatId: "-100123", telegramLinkCode: null } },
      { new: false },
    );
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
