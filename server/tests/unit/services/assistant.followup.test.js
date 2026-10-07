import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("../../../utils/logger.js", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../../core/v2/assistant/assistant.provider.js", () => ({ generateAssistantText: vi.fn() }));
import { askAssistant } from "../../../core/v2/assistant/assistant.service.js";
import { generateAssistantText } from "../../../core/v2/assistant/assistant.provider.js";

beforeEach(() => { vi.stubEnv("ASSISTANT_MCP_URL", "http://localhost:5003"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("assistant follow-up MCP bridge", () => {
  it("forwards a detection explanation unchanged", async () => {
    const question = "explain me about Gunny Bags/Materials Wrong Location Detection";
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ response: "This detection identifies misplaced materials." }));
    vi.stubGlobal("fetch", fetchMock);
    await askAssistant({ message: question, history: [], req: { headers: { "x-access-token": "current-token" } } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).message).toBe(question);
  });
  it("keeps registration how-to questions on the registration workflow", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ response: "Registration steps." }));
    vi.stubGlobal("fetch", fetchMock);
    await askAssistant({ message: "Explain how to register a new user", history: [], req: { headers: { "x-access-token": "current-token" } } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).message).toMatch(/workflow for registering a new user/);
  });
  it("forwards the owned structured context and conversation identifier with the current token", async () => {
    const context = { version: 1, conversationId: "chat-a", subjects: [{ resource: "nvrs", resultCount: 3 }] };
    const next = { ...context, subjects: [{ resource: "nvrs", resultIds: ["nvr-a"] }] };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ response: "NVR A", conversationContext: next }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await askAssistant({ message: "Can you name them?", history: [], req: { headers: { "x-access-token": "current-token" } }, conversationContext: context, conversationId: "chat-a" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:5003/agent/chat");
    expect(init.headers["x-access-token"]).toBe("current-token");
    expect(JSON.parse(init.body)).toMatchObject({ conversationContext: context, conversationId: "chat-a" });
    expect(result.conversationContext).toEqual(next);
    expect(generateAssistantText).not.toHaveBeenCalled();
  });
  it("preserves explicit context cleanup and never falls back to invented model data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ response: "Which records do you mean?", conversationContext: null })));
    const result = await askAssistant({ message: "Their names?", history: [], req: { headers: { "x-access-token": "current-token" } }, conversationContext: null, conversationId: "new-chat" });
    expect(result.conversationContext).toBeNull();
    expect(generateAssistantText).not.toHaveBeenCalled();
  });
});
