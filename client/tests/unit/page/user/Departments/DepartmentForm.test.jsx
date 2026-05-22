/**
 * src/page/user/Departments/DepartmentForm.jsx — Formik-driven dialog for
 * Create vs Edit department. Uses Yup for validation (departmentName required,
 * max 100; description max 255). Submits via createDepartment / updateDepartment
 * and toasts on success/failure.
 *
 * Real bits we keep: formik + Yup + the actual schema.
 * Mocks (3):
 *   1. @/components/ui/dialog  - inline passthrough (always-open).
 *   2. sonner                  - capture toast.success/error.
 *   3. ./Api                   - stub createDepartment/updateDepartment.
 *  Button and Input are pure presentational; left intact.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }) => <div data-mock="dialog">{children}</div>,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
  DialogTrigger: ({ children }) => <div data-testid="trigger">{children}</div>,
}));

const toastRef = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastRef }));

const apiRef = vi.hoisted(() => ({
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
}));
vi.mock(
  "../../../../../src/page/user/Departments/Api",
  () => apiRef
);

const { default: DepartmentForm } = await import(
  "../../../../../src/page/user/Departments/DepartmentForm.jsx"
);

beforeEach(() => {
  toastRef.success.mockReset();
  toastRef.error.mockReset();
  apiRef.createDepartment.mockReset();
  apiRef.updateDepartment.mockReset();
});

describe("DepartmentForm", () => {
  it("renders the Add New Department title and Add Department submit button by default", () => {
    render(<DepartmentForm trigger={<button>Open</button>} />);
    expect(screen.getByText("Add New Department")).toBeInTheDocument();
    expect(
      screen.getByText(/Enter details for the new department/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add Department/i })
    ).toBeInTheDocument();
  });

  it("renders Edit Department title when mode='edit'", () => {
    render(
      <DepartmentForm
        trigger={<button>Open</button>}
        mode="edit"
        initialValues={{ _id: "d1", departmentName: "HR", description: "x" }}
      />
    );
    expect(screen.getByText("Edit Department")).toBeInTheDocument();
    expect(screen.getByText(/Update department details/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Update Department/i })
    ).toBeInTheDocument();
  });

  it("populates initial values from props in edit mode", () => {
    render(
      <DepartmentForm
        trigger={<button>Open</button>}
        mode="edit"
        initialValues={{ _id: "d1", departmentName: "Finance", description: "Money" }}
      />
    );
    expect(screen.getByPlaceholderText(/Human Resources/)).toHaveValue("Finance");
    expect(screen.getByPlaceholderText(/Handles employee/)).toHaveValue("Money");
  });

  it("shows validation error when departmentName is empty on submit", async () => {
    render(<DepartmentForm trigger={<button>Open</button>} />);
    fireEvent.click(screen.getByRole("button", { name: /Add Department/i }));
    await waitFor(() =>
      expect(screen.getByText(/Department name is required/i)).toBeInTheDocument()
    );
    expect(apiRef.createDepartment).not.toHaveBeenCalled();
  });

  it("shows the max-length error when departmentName exceeds 100 chars", async () => {
    render(<DepartmentForm trigger={<button>Open</button>} />);
    const input = screen.getByPlaceholderText(/Human Resources/);
    fireEvent.change(input, { target: { value: "x".repeat(101) } });
    fireEvent.click(screen.getByRole("button", { name: /Add Department/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Department name cannot exceed 100 characters/i)
      ).toBeInTheDocument()
    );
  });

  it("shows the description max-length error when description > 255", async () => {
    render(<DepartmentForm trigger={<button>Open</button>} />);
    fireEvent.change(screen.getByPlaceholderText(/Human Resources/), {
      target: { value: "Valid Name" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Handles employee/), {
      target: { value: "x".repeat(256) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Department/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Description cannot exceed 255 characters/i)
      ).toBeInTheDocument()
    );
  });

  it("submits in create mode: calls createDepartment, toasts success, calls onSave", async () => {
    apiRef.createDepartment.mockResolvedValue({
      data: { statusCode: 200, body: { message: "Saved" } },
    });
    const onSave = vi.fn();
    render(
      <DepartmentForm trigger={<button>Open</button>} onSave={onSave} />
    );
    fireEvent.change(screen.getByPlaceholderText(/Human Resources/), {
      target: { value: "Engineering" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Department/i }));
    await waitFor(() => expect(apiRef.createDepartment).toHaveBeenCalled());
    const payload = apiRef.createDepartment.mock.calls[0][0];
    expect(payload.departmentName).toBe("Engineering");
    expect(payload.empDepartmentId).toBeNull(); // empty string falsy -> null
    expect(toastRef.success).toHaveBeenCalledWith("Saved");
    expect(onSave).toHaveBeenCalled();
  });

  it("submits in create mode: toasts error on non-200 status", async () => {
    apiRef.createDepartment.mockResolvedValue({
      data: { statusCode: 400, body: { message: "Bad input" } },
    });
    render(<DepartmentForm trigger={<button>Open</button>} />);
    fireEvent.change(screen.getByPlaceholderText(/Human Resources/), {
      target: { value: "DeptX" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Department/i }));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Bad input")
    );
    expect(toastRef.success).not.toHaveBeenCalled();
  });

  it("submits in edit mode: calls updateDepartment with id + payload", async () => {
    apiRef.updateDepartment.mockResolvedValue({
      data: { statusCode: 200, body: { message: "Updated" } },
    });
    const onSave = vi.fn();
    render(
      <DepartmentForm
        trigger={<button>Open</button>}
        mode="edit"
        onSave={onSave}
        initialValues={{ _id: "d99", departmentName: "Old", description: "" }}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/Human Resources/), {
      target: { value: "New" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Update Department/i }));
    await waitFor(() => expect(apiRef.updateDepartment).toHaveBeenCalled());
    expect(apiRef.updateDepartment.mock.calls[0][0]).toBe("d99");
    expect(apiRef.updateDepartment.mock.calls[0][1].departmentName).toBe("New");
    expect(toastRef.success).toHaveBeenCalledWith("Updated");
    expect(onSave).toHaveBeenCalled();
  });

  it("on API rejection: toasts the server message when present", async () => {
    apiRef.createDepartment.mockRejectedValue({
      response: { data: { body: { message: "Conflict from server" } } },
    });
    render(<DepartmentForm trigger={<button>Open</button>} />);
    fireEvent.change(screen.getByPlaceholderText(/Human Resources/), {
      target: { value: "Dept" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Department/i }));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Conflict from server")
    );
  });

  it("on API rejection without a message: falls back to 'Something went wrong'", async () => {
    apiRef.createDepartment.mockRejectedValue(new Error("net"));
    render(<DepartmentForm trigger={<button>Open</button>} />);
    fireEvent.change(screen.getByPlaceholderText(/Human Resources/), {
      target: { value: "Dept" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Department/i }));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Something went wrong")
    );
  });

  it("renders the supplied trigger via DialogTrigger", () => {
    render(
      <DepartmentForm
        trigger={<button data-testid="my-trigger">Open Form</button>}
      />
    );
    expect(screen.getByTestId("my-trigger")).toBeInTheDocument();
  });
});
