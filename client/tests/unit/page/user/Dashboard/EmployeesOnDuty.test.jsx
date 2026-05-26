/**
 * Round 88: src/page/user/Dashboard/EmployeesOnDuty.jsx — the "Authorized
 * Employees" search + scroll-paginated list card rendered on the right
 * side of the dashboard. Its behaviour:
 *   - useEffect on debouncedSearch / isAccessLogVisible / limit resets
 *     skip+employees+hasMore and calls authorizedUsers(0, limit, debouncedSearch);
 *     fetch result with body.status==='success' stores result.body.data.users
 *     into `employees` (or appends on subsequent skip>0 calls) and
 *     setTotalUsers from totalCount + hasMore from newUsers.length === limit.
 *   - Loading state with no employees renders 20 EmployeeSkeleton tiles.
 *   - Empty array after load => "No Employees Found" copy.
 *   - Populated state renders one row per employee with userName / dept name
 *     / email (truncated, title attr) plus profile-pic <img> (with onLoad/
 *     onError swapping in the rendered photo via imageLoaded[]). When
 *     `profilePics[0]` is missing, falls back to the initials avatar
 *     (USER_AVTAR_INITIALS env URL + encoded first+last name).
 *   - isAccessLogVisible=false uses the grid layout (col-span variants);
 *     true uses the inline-row layout.
 *   - Row click sets selectedEmployee + employeeId + originalFirst/LastName/
 *     Email + opens the Edit Dialog.
 *   - Inside the Dialog, the Formik form submits via handleUpdateSubmit:
 *     no-change values toast.warning and skip the API; differing values call
 *     updateAuthorizedUsers and on 200 toast.success + close + refetch from
 *     skip=0; on non-200 toast.error.
 *   - The canEdit prop guards both the SquarePen edit-toggle clicks (cursor-
 *     not-allowed) and the Save Profile button's disabled state.
 *
 * Spec focuses on the high-leverage branches with a tight mock budget.
 *
 * Mocks (5 — well under the 8 cap):
 *   1. ./Api/get  -> authorizedUsers (controllable resolved value)
 *   2. ./Api/put  -> updateAuthorizedUsers (controllable resolved value)
 *   3. sonner -> toast (.success/.warning/.error/.info)
 *   4. @/hooks/useDebounce -> passthrough (delay -> 0 effectively)
 *   5. react-loading-skeleton -> tiny div passthrough + SkeletonTheme.
 *      formik / @/components/ui/* are real implementations — Formik works
 *      cleanly in jsdom, and the dialog/input/button shadcn components
 *      render as native elements under the testing env.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
  within,
  waitFor,
} from "@testing-library/react";

const authorizedUsersMock = vi.hoisted(() => vi.fn());
const updateAuthorizedUsersMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("../../../../../src/page/user/Dashboard/Api/get/index.jsx", () => ({
  authorizedUsers: (...args) => authorizedUsersMock(...args),
}));

vi.mock("../../../../../src/page/user/Dashboard/Api/put/index.jsx", () => ({
  updateAuthorizedUsers: (...args) => updateAuthorizedUsersMock(...args),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/hooks/useDebounce", () => ({
  // Pass the value through immediately so the debounced useEffect fires on
  // the same render rather than after a 500ms timer.
  default: (value) => value,
}));

vi.mock("react-loading-skeleton", () => ({
  default: (props) => (
    <span data-testid="skeleton" data-height={props?.height} />
  ),
  SkeletonTheme: ({ children }) => <>{children}</>,
}));

const { default: EmployeesOnDuty } = await import(
  "../../../../../src/page/user/Dashboard/EmployeesOnDuty.jsx"
);

const mountAndFlush = async (ui) => {
  let utils;
  await act(async () => {
    utils = render(ui);
    // Allow the mount-time fetch + setState to flush.
    await Promise.resolve();
    await Promise.resolve();
  });
  return utils;
};

const makeUser = (overrides = {}) => ({
  _id: "u1",
  userName: "Alice",
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@example.com",
  departmentId: { _id: "d1", departmentName: "Ops" },
  profilePics: ["alice.jpg"],
  ...overrides,
});

beforeEach(() => {
  cleanup();
  authorizedUsersMock.mockReset();
  updateAuthorizedUsersMock.mockReset();
  toastMock.success.mockReset();
  toastMock.warning.mockReset();
  toastMock.error.mockReset();
  toastMock.info.mockReset();
});

describe("Dashboard/EmployeesOnDuty", () => {
  it("renders the header strip with totalUsers badge starting at 0", async () => {
    authorizedUsersMock.mockResolvedValue({
      body: { status: "success", data: { users: [], totalCount: 0 } },
    });
    await mountAndFlush(<EmployeesOnDuty canEdit isAccessLogVisible />);

    expect(screen.getByText(/Authorized Employees/i)).toBeInTheDocument();
    // 0 badge after load (totalCount === 0).
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Search Employees/i),
    ).toBeInTheDocument();
  });

  it("calls authorizedUsers(0, 20, '') on mount and populates rows on success", async () => {
    authorizedUsersMock.mockResolvedValue({
      body: {
        status: "success",
        data: {
          users: [makeUser({ _id: "u1", userName: "Alice" }), makeUser({ _id: "u2", userName: "Bob", email: "bob@x.com" })],
          totalCount: 2,
        },
      },
    });
    await mountAndFlush(<EmployeesOnDuty canEdit isAccessLogVisible />);

    expect(authorizedUsersMock).toHaveBeenCalledTimes(1);
    expect(authorizedUsersMock).toHaveBeenCalledWith(0, 20, "");

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@x.com")).toBeInTheDocument();
    // department names render (one shared in this fixture).
    expect(screen.getAllByText("Ops")).toHaveLength(2);
    // totalUsers badge updates to 2.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the 'No Employees Found' empty pane after the load resolves with zero users", async () => {
    authorizedUsersMock.mockResolvedValue({
      body: { status: "success", data: { users: [], totalCount: 0 } },
    });
    await mountAndFlush(<EmployeesOnDuty canEdit isAccessLogVisible />);

    expect(screen.getByText(/No Employees Found/i)).toBeInTheDocument();
  });

  it("falls back to the initials-avatar <img> when an employee has no profilePics", async () => {
    authorizedUsersMock.mockResolvedValue({
      body: {
        status: "success",
        data: {
          users: [
            makeUser({
              _id: "no-pic",
              userName: "Cara",
              firstName: "Cara",
              lastName: "Doe",
              profilePics: [],
            }),
          ],
          totalCount: 1,
        },
      },
    });
    await mountAndFlush(<EmployeesOnDuty canEdit isAccessLogVisible />);

    const avatar = screen.getByAltText("Cara");
    expect(avatar.tagName).toBe("IMG");
    // VITE_INITIALS_URL is unset in the test env, so the src starts with
    // 'undefined=' followed by the URI-encoded name. Either way we should
    // see the encoded "Cara Doe".
    expect(avatar.getAttribute("src")).toContain(encodeURIComponent("Cara Doe"));
  });

  it("clicking a row opens the Employee Profile dialog with the pre-filled fields", async () => {
    authorizedUsersMock.mockResolvedValue({
      body: {
        status: "success",
        data: {
          users: [
            makeUser({
              _id: "u1",
              userName: "Alice",
              firstName: "Alice",
              lastName: "Smith",
              email: "alice@example.com",
            }),
          ],
          totalCount: 1,
        },
      },
    });
    await mountAndFlush(<EmployeesOnDuty canEdit isAccessLogVisible />);

    // The dialog is closed by default — its content is not in the DOM.
    expect(screen.queryByText(/Employee Profile/i)).not.toBeInTheDocument();

    // Click the row (use the userName as the entry point).
    await act(async () => {
      fireEvent.click(screen.getByText("Alice").closest("div"));
      await Promise.resolve();
    });

    expect(screen.getByText(/Employee Profile/i)).toBeInTheDocument();
    // Pre-filled values flow through Formik. Two First/Last Name inputs +
    // the email input render readonly until canEdit toggles a field.
    const firstNameInput = screen
      .getByText("First Name")
      .parentElement.querySelector("input[name='firstName']");
    const lastNameInput = screen
      .getByText("Last Name")
      .parentElement.querySelector("input[name='lastName']");
    const emailInput = screen
      .getByText("Email ID")
      .parentElement.querySelector("input[name='email']");

    expect(firstNameInput.value).toBe("Alice");
    expect(lastNameInput.value).toBe("Smith");
    expect(emailInput.value).toBe("alice@example.com");
  });

  it("submitting the dialog with no changes surfaces a warning toast and skips updateAuthorizedUsers", async () => {
    authorizedUsersMock.mockResolvedValue({
      body: {
        status: "success",
        data: {
          users: [
            makeUser({
              _id: "u1",
              userName: "Alice",
              firstName: "Alice",
              lastName: "Smith",
              email: "alice@example.com",
            }),
          ],
          totalCount: 1,
        },
      },
    });
    await mountAndFlush(<EmployeesOnDuty canEdit isAccessLogVisible />);

    await act(async () => {
      fireEvent.click(screen.getByText("Alice").closest("div"));
      await Promise.resolve();
    });

    // Save Profile submits the form with the same values => no-change path.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastMock.warning).toHaveBeenCalledWith("No Changes Made");
    expect(updateAuthorizedUsersMock).not.toHaveBeenCalled();
  });

  it("dialog Close button dismisses the dialog without calling updateAuthorizedUsers", async () => {
    authorizedUsersMock.mockResolvedValue({
      body: {
        status: "success",
        data: {
          users: [makeUser({ _id: "u1", userName: "Alice" })],
          totalCount: 1,
        },
      },
    });
    await mountAndFlush(<EmployeesOnDuty canEdit isAccessLogVisible />);

    await act(async () => {
      fireEvent.click(screen.getByText("Alice").closest("div"));
      await Promise.resolve();
    });
    expect(screen.getByText(/Employee Profile/i)).toBeInTheDocument();

    // Radix dialog also renders its own X button with sr-only text "Close"; the
    // in-form Close button is the explicit type=button. Filter to that one.
    const closeButtons = screen.getAllByRole("button", { name: /Close/i });
    // The form's Close button is the one with type="button" and visible label.
    const formCloseBtn = closeButtons.find(
      (btn) => btn.textContent.trim() === "Close",
    );
    expect(formCloseBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(formCloseBtn);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText(/Employee Profile/i)).not.toBeInTheDocument();
    });
    expect(updateAuthorizedUsersMock).not.toHaveBeenCalled();
  });

  it("Save Profile is disabled when canEdit=false (opacity-50 + cursor-not-allowed class)", async () => {
    authorizedUsersMock.mockResolvedValue({
      body: {
        status: "success",
        data: {
          users: [makeUser({ _id: "u1", userName: "Alice" })],
          totalCount: 1,
        },
      },
    });
    await mountAndFlush(<EmployeesOnDuty canEdit={false} isAccessLogVisible />);

    await act(async () => {
      fireEvent.click(screen.getByText("Alice").closest("div"));
      await Promise.resolve();
    });

    const saveBtn = screen.getByRole("button", { name: /Save Profile/i });
    expect(saveBtn).toBeDisabled();
    expect(saveBtn.className).toMatch(/opacity-50/);
    expect(saveBtn.className).toMatch(/cursor-not-allowed/);
  });

  it("does not refetch if the result body.status is not 'success' (rejection path)", async () => {
    authorizedUsersMock.mockResolvedValue({
      body: { status: "failure", data: { users: [], totalCount: 0 } },
    });
    await mountAndFlush(<EmployeesOnDuty canEdit isAccessLogVisible />);

    // On failure status the component does not push users into state.
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    // totalUsers stays at the initial 0.
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("triggers a refetch when the search input changes (debounced via the passthrough hook)", async () => {
    authorizedUsersMock.mockResolvedValue({
      body: { status: "success", data: { users: [], totalCount: 0 } },
    });
    await mountAndFlush(<EmployeesOnDuty canEdit isAccessLogVisible />);

    expect(authorizedUsersMock).toHaveBeenCalledTimes(1);
    expect(authorizedUsersMock).toHaveBeenLastCalledWith(0, 20, "");

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Search Employees/i), {
        target: { value: "ali" },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The debounced effect fires on the next render with the new term.
    expect(authorizedUsersMock).toHaveBeenLastCalledWith(0, 20, "ali");
  });
});
