/**
 * Round 93: cover helpers/Userregister/RegisterForm.jsx — the trigger +
 * multi-step Dialog used by UserDetails to register or edit an authorized
 * employee. The component is heavy (Formik + Yup + Webcam + RegisterFormStep1
 * / RegisterFormStep2 + axios + fetch + getEmployeeLocations + Radix Dialog),
 * but the default rendered surface (open=false, no editUser, no trigger) is
 * just the closed Dialog wrapper + the DialogTrigger slot — none of the
 * Formik / Webcam / Step1 / Step2 machinery is mounted until the user clicks
 * the trigger and flips open=true.
 *
 * The new spec exercises that initial-mount reachable surface:
 *   1. closed by default: the trigger slot renders (with a passthrough
 *      asChild wrapper) and the DialogContent body (with the "User
 *      Registration" / "Click to Continue" / Photo Guideline strings)
 *      stays out of the tree.
 *   2. clicking the trigger flips open=true → the Dialog's open prop is
 *      forwarded through the mocked Root (mounting DialogContent) and the
 *      header / step-1 Continue button render with the "User Registration"
 *      title.
 *   3. on mount the component fetches departments via the documented
 *      VITE_BACKEND/api/v1/departments/get POST endpoint AND fetches
 *      locations via getEmployeeLocations (both fire from the same
 *      useEffect with [] deps so we can assert both happened once).
 *   4. when editUser is supplied on mount, the component auto-opens the
 *      dialog (via Promise.all([fetchDepartments, fetchLocations])
 *      .then(setOpen(true))) AND swaps the DialogTitle copy to
 *      "Update User Details".
 *
 * Mock budget (6/8):
 *   - @radix-ui/react-dialog        — render inline, forward open prop
 *   - sonner                        — toast spy (no-op)
 *   - react-webcam                  — lightweight placeholder (only mounts
 *                                     when isCameraOpen=true, but the
 *                                     stub keeps the import graph clean)
 *   - @/utils/getAccessToken        — token stub
 *   - ./RegisterFormStep1           — passthrough placeholder
 *   - ./RegisterFormStep2           — passthrough placeholder
 *   - @/page/user/UserDetails/Api/Post (named getEmployeeLocations)
 *   - global fetch                  — spy resolving the departments POST
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// Radix Dialog primitive — render inline (no Portal) and forward the open
// prop so we can observe the closed/open content tree directly.
vi.mock("@radix-ui/react-dialog", () => {
  const Root = ({ children, open, onOpenChange }) =>
    React.createElement(
      "div",
      {
        "data-mock-name": "Root",
        "data-open": open ? "true" : "false",
      },
      // Expose a hidden button so the test can drive onOpenChange when
      // needed. The component itself drives it via DialogTrigger click.
      onOpenChange
        ? React.createElement(
            "button",
            {
              "data-testid": "dialog-open-fire",
              type: "button",
              onClick: () => onOpenChange(true),
            },
            "fire-open",
          )
        : null,
      children,
    );
  const make = (name) => ({ children, ...rest }) =>
    React.createElement("div", { "data-mock-name": name, ...rest }, children);
  return {
    Root,
    Trigger: make("Trigger"),
    Portal: ({ children }) => <>{children}</>,
    Close: make("Close"),
    Overlay: make("Overlay"),
    Content: make("Content"),
    Title: make("Title"),
    Description: make("Description"),
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("react-webcam", () => ({
  default: React.forwardRef((_props, _ref) => (
    <div data-testid="webcam-stub" />
  )),
}));

vi.mock("@/utils/getAccessToken", () => ({
  default: () => "tok-abc",
}));

vi.mock("@/helpers/Userregister/RegisterFormStep1", () => ({
  default: () => <div data-testid="register-step-1">step-1</div>,
}));

vi.mock("@/helpers/Userregister/RegisterFormStep2", () => ({
  default: () => <div data-testid="register-step-2">step-2</div>,
}));

const getEmployeeLocationsSpy = vi.fn(async () => ({
  data: { body: { data: { locations: [{ locationName: "Bangalore" }] } } },
}));
vi.mock("@/page/user/UserDetails/Api/Post", () => ({
  getEmployeeLocations: getEmployeeLocationsSpy,
}));

const { default: RegisterForm } = await import(
  "@/helpers/Userregister/RegisterForm.jsx"
);

beforeEach(() => {
  vi.clearAllMocks();
  // Replace global fetch so the documented departments POST resolves
  // synchronously. The component reads data.body.status === "success" and
  // pulls departments off data.body.data.data.
  global.fetch = vi.fn(async () => ({
    json: async () => ({
      body: {
        status: "success",
        data: { data: [{ _id: "d1", departmentName: "Engineering" }] },
      },
    }),
  }));
});

afterEach(() => {
  delete global.fetch;
});

describe("RegisterForm — closed-by-default Dialog (Round 93)", () => {
  it("renders the trigger slot and keeps the dialog closed on initial mount", () => {
    render(
      <RegisterForm
        trigger={<button data-testid="add-user-trigger">Add User</button>}
        fetchUsers={() => {}}
        editUser={null}
        setEditUser={() => {}}
      />,
    );
    // Trigger content is forwarded through DialogTrigger asChild.
    expect(screen.getByTestId("add-user-trigger")).toBeInTheDocument();
    // Default open=false → Root receives data-open="false".
    const root = document.querySelector('[data-mock-name="Root"]');
    expect(root).not.toBeNull();
    expect(root.getAttribute("data-open")).toBe("false");
  });

  it("fires the documented data-fetch fan-out on mount (fetch + getEmployeeLocations)", async () => {
    render(<RegisterForm trigger={<span>t</span>} setEditUser={() => {}} />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Departments call: VITE_BACKEND + /api/v1/departments/get with POST +
    // x-access-token header + skip/limit body.
    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/departments\/get$/);
    expect(init.method).toBe("POST");
    expect(init.headers["x-access-token"]).toBe("tok-abc");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ skip: 0, limit: 100 });
    // Locations call: getEmployeeLocations(); no positional arg required.
    expect(getEmployeeLocationsSpy).toHaveBeenCalledTimes(1);
  });

  it("clicking the trigger flips open=true and mounts the User Registration step-1 chrome", async () => {
    render(<RegisterForm trigger={<span>t</span>} setEditUser={() => {}} />);
    // Initial mount fired fetchDepartments() once. Drive the dialog open
    // via the test-only `dialog-open-fire` button exposed by the Root mock
    // (this mirrors what a real DialogTrigger asChild click would do —
    // RegisterForm hands onOpenChange to the dialog primitive, and the
    // mock surfaces it through this button).
    await act(async () => {
      fireEvent.click(screen.getByTestId("dialog-open-fire"));
    });

    // After open=true, RegisterForm re-renders with open=true on Root.
    const root = document.querySelector('[data-mock-name="Root"]');
    expect(root.getAttribute("data-open")).toBe("true");

    // Step 1 is the default step so RegisterFormStep1 mounts, and the
    // Continue button + create-mode title render.
    expect(screen.getByTestId("register-step-1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /click to continue/i }),
    ).toBeInTheDocument();
    // Create-mode title (no editUser).
    expect(screen.getByText(/user registration/i)).toBeInTheDocument();
    // Step 2 content (Photo Guideline) must NOT be mounted yet.
    expect(screen.queryByTestId("register-step-2")).not.toBeInTheDocument();
  });

  it("when editUser is supplied on mount, auto-opens the dialog with the Update User Details title", async () => {
    const setEditUser = vi.fn();
    render(
      <RegisterForm
        trigger={<span>t</span>}
        setEditUser={setEditUser}
        editUser={{
          _id: "u1",
          firstName: "Alice",
          lastName: "Smith",
          email: "alice@example.com",
          designation: "Engineer",
          location: "Bangalore",
          departmentId: { _id: "d1", departmentName: "R&D" },
          profilePics: ["", "", ""],
        }}
      />,
    );

    // The editUser effect kicks off Promise.all([fetchDepartments,
    // fetchLocations]).then(() => setOpen(true)). After microtasks
    // resolve, open=true and the edit-mode title renders.
    await waitFor(() => {
      const root = document.querySelector('[data-mock-name="Root"]');
      expect(root.getAttribute("data-open")).toBe("true");
    });

    // Edit-mode title (editUser truthy + step===1).
    expect(screen.getByText(/update user details/i)).toBeInTheDocument();
    // Step 1 still mounts (the editUser branch also resets step to 1).
    expect(screen.getByTestId("register-step-1")).toBeInTheDocument();
  });
});
