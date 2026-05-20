/**
 * `handleAddRecipient` posts a create-alert request and threads success +
 * failure into toast + callback side effects. `createAlert` and `toast` are
 * mocked; we assert the surface contract.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const createAlert = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Settings/Api/post", () => ({ createAlert }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const { handleAddRecipient } = await import(
  "../../../src/utils/recipientUtils.js"
);

beforeEach(() => {
  createAlert.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("handleAddRecipient", () => {
  it("throws when required params are missing", async () => {
    await expect(handleAddRecipient(null, "v", "n")).rejects.toThrow(
      /required parameters/
    );
    await expect(handleAddRecipient("email", null, "n")).rejects.toThrow();
    await expect(handleAddRecipient("email", "v", null)).rejects.toThrow();
  });

  it("calls the success callbacks on a 200 response", async () => {
    createAlert.mockResolvedValue({
      statusCode: 200,
      body: { message: "ok" },
    });
    const setShowModal = vi.fn();
    const resetForm = vi.fn();
    const fetchAllRecipients = vi.fn();

    await handleAddRecipient(
      "email",
      "a@b.com",
      "Alice",
      ["fire"],
      resetForm,
      setShowModal,
      fetchAllRecipients
    );

    expect(createAlert).toHaveBeenCalledWith({
      type: "email",
      value: "a@b.com",
      fullName: "Alice",
      incidentTypes: ["fire"],
    });
    expect(setShowModal).toHaveBeenCalledWith(false);
    expect(resetForm).toHaveBeenCalled();
    expect(fetchAllRecipients).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("ok");
  });

  it("shows an error toast for a non-200 response", async () => {
    createAlert.mockResolvedValue({
      statusCode: 400,
      body: { message: "duplicate" },
    });
    await handleAddRecipient("email", "a@b.com", "Alice");
    expect(toast.error).toHaveBeenCalledWith("duplicate");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows an error toast when the API rejects", async () => {
    createAlert.mockRejectedValue(new Error("network down"));
    await handleAddRecipient("email", "a@b.com", "Alice");
    expect(toast.error).toHaveBeenCalledWith("Error adding recipient");
  });

  it("does not require the optional callback args", async () => {
    createAlert.mockResolvedValue({ statusCode: 200, body: {} });
    await expect(
      handleAddRecipient("phoneNumber", "+1", "X")
    ).resolves.toBeUndefined();
    expect(toast.success).toHaveBeenCalled();
  });
});
