/**
 * Round 3 gap-fill for src/page/user/NotificationRecipients/NotificationRecipients.jsx
 *
 * Base spec only covers the permission gates. This adds full happy-path
 * coverage with view+create+edit+delete permissions: mount fetches both
 * email + phone recipients (or just email when phone is disabled), wires
 * search / filter Apply / filter Clear, drives the AddRecipientModal
 * callback, and exercises handleDirectVerify's success and failure branches.
 *
 * Heavy children (RecipientList, AddRecipientModal, sonner) are stubbed
 * to thin observable shells; Api modules stubbed so no network.
 *
 * Mock budget: lifted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---- Permission context ----------------------------------------------
const permissionsRef = vi.hoisted(() => ({ value: null }));
vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permissionsRef.value,
}));

vi.mock("@/components/AccessDenied", () => ({
  default: () => <div data-testid="access-denied" />,
}));
vi.mock("@/components/PageLoader", () => ({
  default: () => <div data-testid="page-loader" />,
}));

// ---- Auth -------------------------------------------------------------
const authRef = vi.hoisted(() => ({ user: { enablePhoneRecipients: false } }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => authRef,
}));

// ---- Settings Api -----------------------------------------------------
const apiGetRef = vi.hoisted(() => ({
  getRecipients: vi.fn(),
  getDetectionTypes: vi.fn(),
}));
vi.mock("@/page/user/Settings/Api/get", () => apiGetRef);

const apiPostRef = vi.hoisted(() => ({ resendMailOrSMS: vi.fn() }));
vi.mock("@/page/user/Settings/Api/post", () => apiPostRef);

// ---- recipientUtils ---------------------------------------------------
const handleAddRecipientRef = vi.hoisted(() => vi.fn());
vi.mock("@/utils/recipientUtils", () => ({
  handleAddRecipient: (...args) => handleAddRecipientRef(...args),
}));

// ---- sonner -----------------------------------------------------------
const toastRef = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastRef }));

// ---- RecipientList / AddRecipientModal stubs --------------------------
const recipientListSpy = vi.fn();
vi.mock("../../../../../src/page/user/NotificationRecipients/RecipientList", () => ({
  default: (props) => {
    recipientListSpy(props);
    return (
      <div data-testid="recipient-list">
        <span data-testid="rl-loading">{props.loading ? "y" : "n"}</span>
        <span data-testid="rl-count">{props.recipients?.length || 0}</span>
        <span data-testid="rl-empty">{props.emptyMessage}</span>
        <button
          data-testid="rl-verify"
          onClick={() =>
            props.handleDirectVerify?.("id-1", "email", "u@example.com")
          }
        />
        <button
          data-testid="rl-add-new"
          onClick={() => props.onAddNew?.()}
        />
      </div>
    );
  },
}));

const addRecipientModalSpy = vi.fn();
vi.mock("@/components/NotificationRecipientModal/AddRecipientModal", () => ({
  default: (props) => {
    addRecipientModalSpy(props);
    return (
      <div data-testid="add-recipient-modal" data-open={props.open}>
        <button
          data-testid="modal-trigger-add"
          onClick={() =>
            props.onAddRecipient?.(
              "email",
              "new@x.com",
              "New User",
              ["fire"],
              vi.fn()
            )
          }
        />
      </div>
    );
  },
}));

const { default: NotificationRecipients } = await import(
  "../../../../../src/page/user/NotificationRecipients/NotificationRecipients.jsx"
);

const fullPerms = {
  permissions: {
    recipients: { view: true, create: true, edit: true, delete: true },
  },
  loading: false,
};

beforeEach(() => {
  permissionsRef.value = fullPerms;
  authRef.user = { enablePhoneRecipients: false };
  apiGetRef.getRecipients.mockReset();
  apiGetRef.getDetectionTypes.mockReset();
  apiPostRef.resendMailOrSMS.mockReset();
  handleAddRecipientRef.mockReset();
  toastRef.success.mockReset();
  toastRef.error.mockReset();
  recipientListSpy.mockReset();
  addRecipientModalSpy.mockReset();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <NotificationRecipients />
    </MemoryRouter>
  );

describe("NotificationRecipients — full happy path (round 3 gaps)", () => {
  it("fetches email recipients (phone disabled) and detection types on mount", async () => {
    apiGetRef.getRecipients.mockResolvedValue([
      { _id: "r-1", email: "a@x.com" },
      { _id: "r-2", email: "b@x.com" },
    ]);
    apiGetRef.getDetectionTypes.mockResolvedValue({ fire: true, gun: true });

    renderPage();

    await waitFor(() =>
      expect(apiGetRef.getDetectionTypes).toHaveBeenCalled()
    );
    await waitFor(() =>
      expect(apiGetRef.getRecipients).toHaveBeenCalledWith("email", "", "All")
    );
    // Phone disabled -> no phone fetch
    expect(
      apiGetRef.getRecipients.mock.calls.find((c) => c[0] === "phone")
    ).toBeUndefined();

    await waitFor(() =>
      expect(screen.getByTestId("rl-count").textContent).toBe("2")
    );
  });

  it("phone recipients fetched when authUser.enablePhoneRecipients is true", async () => {
    authRef.user = { enablePhoneRecipients: true };
    apiGetRef.getDetectionTypes.mockResolvedValue({});
    apiGetRef.getRecipients
      .mockResolvedValueOnce([{ _id: "e-1" }]) // email
      .mockResolvedValueOnce([{ _id: "p-1" }]); // phone

    renderPage();

    await waitFor(() =>
      expect(
        apiGetRef.getRecipients.mock.calls.some((c) => c[0] === "phone")
      ).toBe(true)
    );
  });

  it("typing in the search input causes debounced fetch with new search term", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiGetRef.getDetectionTypes.mockResolvedValue({});
    apiGetRef.getRecipients.mockResolvedValue([]);

    renderPage();
    await vi.advanceTimersByTimeAsync(0);

    const search = screen.getByPlaceholderText("Search");
    fireEvent.change(search, { target: { value: "alpha" } });

    // useDebounce timeout
    await vi.advanceTimersByTimeAsync(600);

    await waitFor(() =>
      expect(
        apiGetRef.getRecipients.mock.calls.some((c) => c[1] === "alpha")
      ).toBe(true)
    );
    vi.useRealTimers();
  });

  it("opens the filter popover, selects 'verified', clicks Apply -> refetches with filterValue=verified", async () => {
    apiGetRef.getDetectionTypes.mockResolvedValue({});
    apiGetRef.getRecipients.mockResolvedValue([]);

    renderPage();
    await waitFor(() =>
      expect(apiGetRef.getRecipients).toHaveBeenCalled()
    );

    // Open Filter popover
    fireEvent.click(screen.getByText("Filter"));
    // Click the "Verified Recipients" label which is associated with the
    // radio input
    fireEvent.click(screen.getByLabelText("Verified Recipients"));
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() =>
      expect(
        apiGetRef.getRecipients.mock.calls.some((c) => c[2] === "verified")
      ).toBe(true)
    );
  });

  it("clicking the Clear filter (FilterX) icon resets filter back to 'All' and refetches", async () => {
    apiGetRef.getDetectionTypes.mockResolvedValue({});
    apiGetRef.getRecipients.mockResolvedValue([]);

    renderPage();
    await waitFor(() =>
      expect(apiGetRef.getRecipients).toHaveBeenCalled()
    );

    // Open popover, pick verified, apply
    fireEvent.click(screen.getByText("Filter"));
    fireEvent.click(screen.getByLabelText("Verified Recipients"));
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() =>
      expect(
        apiGetRef.getRecipients.mock.calls.some((c) => c[2] === "verified")
      ).toBe(true)
    );

    // Open popover again and click the sr-only Clear Filter button
    fireEvent.click(screen.getByText("Filter"));
    fireEvent.click(screen.getByTitle("Clear Filter"));

    await waitFor(() => {
      const last =
        apiGetRef.getRecipients.mock.calls[apiGetRef.getRecipients.mock.calls.length - 1];
      expect(last[2]).toBe("All");
    });
  });

  it("RecipientList onAddNew opens the AddRecipientModal (showModal=true)", async () => {
    apiGetRef.getDetectionTypes.mockResolvedValue({});
    apiGetRef.getRecipients.mockResolvedValue([]);
    renderPage();
    await waitFor(() =>
      expect(apiGetRef.getRecipients).toHaveBeenCalled()
    );

    fireEvent.click(screen.getByTestId("rl-add-new"));

    // The most recent AddRecipientModal call should now have open=true
    await waitFor(() => {
      const lastProps = addRecipientModalSpy.mock.calls.at(-1)[0];
      expect(lastProps.open).toBe(true);
    });
  });

  it("AddRecipientModal onAddRecipient prop forwards to handleAddRecipient util with setShowModal + fetchAllRecipients", async () => {
    apiGetRef.getDetectionTypes.mockResolvedValue({});
    apiGetRef.getRecipients.mockResolvedValue([]);
    renderPage();
    await waitFor(() =>
      expect(apiGetRef.getRecipients).toHaveBeenCalled()
    );

    fireEvent.click(screen.getByTestId("modal-trigger-add"));

    expect(handleAddRecipientRef).toHaveBeenCalledWith(
      "email",
      "new@x.com",
      "New User",
      ["fire"],
      expect.any(Function), // resetForm
      expect.any(Function), // setShowModal
      expect.any(Function) // fetchAllRecipients
    );
  });

  it("handleDirectVerify success -> toast.success, isSuccess=true", async () => {
    apiGetRef.getDetectionTypes.mockResolvedValue({});
    apiGetRef.getRecipients.mockResolvedValue([]);
    apiPostRef.resendMailOrSMS.mockResolvedValue({
      status: "success",
      message: "Link sent",
    });

    renderPage();
    await waitFor(() =>
      expect(apiGetRef.getRecipients).toHaveBeenCalled()
    );

    fireEvent.click(screen.getByTestId("rl-verify"));

    await waitFor(() =>
      expect(toastRef.success).toHaveBeenCalledWith("Link sent")
    );
  });

  it("handleDirectVerify failure -> toast.error fallback message", async () => {
    apiGetRef.getDetectionTypes.mockResolvedValue({});
    apiGetRef.getRecipients.mockResolvedValue([]);
    apiPostRef.resendMailOrSMS.mockResolvedValue({
      status: "fail",
      message: null,
    });

    renderPage();
    await waitFor(() =>
      expect(apiGetRef.getRecipients).toHaveBeenCalled()
    );

    fireEvent.click(screen.getByTestId("rl-verify"));

    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Fail to send Link")
    );
  });

  it("fetchAllRecipients rejection -> caught, logged, loading toggles off", async () => {
    apiGetRef.getDetectionTypes.mockResolvedValue({});
    apiGetRef.getRecipients.mockRejectedValueOnce(new Error("oops"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderPage();
    await waitFor(() =>
      expect(errSpy).toHaveBeenCalledWith(
        "Error fetching recipients:",
        expect.any(Error)
      )
    );
    await waitFor(() =>
      expect(screen.getByTestId("rl-loading").textContent).toBe("n")
    );
    errSpy.mockRestore();
  });

  it("emptyMessage reflects the live searchTerm (sync from state, not debounced)", async () => {
    apiGetRef.getDetectionTypes.mockResolvedValue({});
    apiGetRef.getRecipients.mockResolvedValue([]);

    renderPage();
    await waitFor(() =>
      expect(apiGetRef.getRecipients).toHaveBeenCalled()
    );

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "qq" },
    });

    await waitFor(() =>
      expect(screen.getByTestId("rl-empty").textContent).toContain(
        'No results found for "qq"'
      )
    );
  });
});
