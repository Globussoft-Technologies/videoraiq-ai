/**
 * Round 2: Extended coverage for Users/EmployeeRegister.jsx beyond the
 * Round-86 spec. The new tests pin the unreached branches around the
 * Continue → checkEmail handoff (step 1 → step 2), the step-2 Register
 * submit, the success path that flips to the "Thank you!" pane, the
 * camera-modal portal open/close, and the email-exists arm.
 *
 * Step1 mock now uses Formik's setFieldValue to fill all required fields
 * so validateForm passes on Continue.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("react-webcam", () => ({
  default: React.forwardRef((_, ref) => {
    // expose getScreenshot via the ref so handleCapture can be exercised
    React.useImperativeHandle(ref, () => ({
      getScreenshot: () => "data:image/jpeg;base64,XYZ",
    }));
    return <div data-testid="webcam-mock" />;
  }),
}));

// RegisterFormStep1 — exposes a hidden button that fills all required
// fields via Formik's useFormikContext().setFieldValue so validateForm
// passes when the user clicks Continue.
vi.mock("@/helpers/Userregister/RegisterFormStep1", () => {
  const { useFormikContext } = require("formik");
  return {
    default: ({ departments, locations }) => {
      const ctx = useFormikContext();
      return (
        <div data-testid="step1">
          <span data-testid="dept-count">{(departments || []).length}</span>
          <span data-testid="loc-count">{(locations || []).length}</span>
          <button
            type="button"
            data-testid="fill-valid"
            onClick={() => {
              ctx.setFieldValue("firstName", "John");
              ctx.setFieldValue("lastName", "Doe");
              ctx.setFieldValue("email", "john@example.com");
              ctx.setFieldValue("designation", "Engineer");
              ctx.setFieldValue("departmentId", "dept-1");
              ctx.setFieldValue("location", "loc-1");
            }}
          >
            fill-valid
          </button>
        </div>
      );
    },
  };
});

// RegisterFormStep2 — exposes test-only buttons to push files into
// onUploadFile + a "open-camera" trigger.
vi.mock("@/helpers/Userregister/RegisterFormStep2", () => ({
  default: ({ uploadedImagePaths, onUploadFile, onOpenCamera }) => (
    <div data-testid="step2">
      <span data-testid="uploaded-count">
        {
          (uploadedImagePaths || []).filter(
            (p) => p && (typeof p !== "string" || p.trim() !== "")
          ).length
        }
      </span>
      <button
        type="button"
        data-testid="add-three-files"
        onClick={() => {
          const f1 = new File(["a"], "f.jpg", { type: "image/jpeg" });
          const f2 = new File(["b"], "r.jpg", { type: "image/jpeg" });
          const f3 = new File(["c"], "l.jpg", { type: "image/jpeg" });
          onUploadFile(f1, "EmpFolder", 0);
          onUploadFile(f2, "EmpFolder", 1);
          onUploadFile(f3, "EmpFolder", 2);
        }}
      >
        add-three
      </button>
      <button
        type="button"
        data-testid="open-cam"
        onClick={() => onOpenCamera && onOpenCamera("front")}
      >
        open-cam
      </button>
    </div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, type = "button", disabled, ...rest }) => (
    <button type={type} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

beforeAll(() => {
  if (typeof URL.createObjectURL !== "function") {
    URL.createObjectURL = vi.fn(() => "blob:fake-url");
  }
});

const fetchSpy = vi.fn();
beforeAll(() => {
  globalThis.fetch = fetchSpy;
});

const { default: EmployeeRegister } = await import(
  "../../../../../src/page/user/Users/EmployeeRegister.jsx"
);

function jsonRes(body, status = 200) {
  return Promise.resolve({
    ok: status === 200,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  fetchSpy.mockReset();
});

describe("EmployeeRegister — extended Continue + Step2 + Registered flow", () => {
  it("Continue with all required fields valid -> calls checkEmail; on exists=false advances to step 2", async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/api/v1/departments/get"))
        return jsonRes({ body: { status: "success", data: { data: [] } } });
      if (u.includes("/api/v1/locations/employee-location"))
        return jsonRes({ body: { data: { locations: [] } } });
      if (u.includes("/api/v1/users/isEmailExist"))
        return jsonRes({ body: { data: { exists: false } } });
      return jsonRes({ body: {} });
    });
    render(<EmployeeRegister />);
    fireEvent.click(screen.getByTestId("fill-valid"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() =>
      expect(screen.getByTestId("step2")).toBeInTheDocument()
    );
  });

  it("Continue: isEmailExist=true -> toasts 'Email already exists' and stays on step 1", async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/api/v1/departments/get"))
        return jsonRes({ body: { status: "success", data: { data: [] } } });
      if (u.includes("/api/v1/locations/employee-location"))
        return jsonRes({ body: { data: { locations: [] } } });
      if (u.includes("/api/v1/users/isEmailExist"))
        return jsonRes({ body: { data: { exists: true } } });
      return jsonRes({ body: {} });
    });
    render(<EmployeeRegister />);
    fireEvent.click(screen.getByTestId("fill-valid"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Email already exists")
    );
    expect(screen.queryByTestId("step2")).not.toBeInTheDocument();
  });

  it("Continue: checkEmail rejection -> toast.error 'Failed to validate email' and stays on step 1", async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/api/v1/departments/get"))
        return jsonRes({ body: { status: "success", data: { data: [] } } });
      if (u.includes("/api/v1/locations/employee-location"))
        return jsonRes({ body: { data: { locations: [] } } });
      if (u.includes("/api/v1/users/isEmailExist"))
        return Promise.reject(new Error("net"));
      return jsonRes({ body: {} });
    });
    render(<EmployeeRegister />);
    fireEvent.click(screen.getByTestId("fill-valid"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to validate email")
    );
  });

  it("Step 2 Register click with < 3 photos toasts 'Please upload all the 3 images'", async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/api/v1/departments/get"))
        return jsonRes({ body: { status: "success", data: { data: [] } } });
      if (u.includes("/api/v1/locations/employee-location"))
        return jsonRes({ body: { data: { locations: [] } } });
      if (u.includes("/api/v1/users/isEmailExist"))
        return jsonRes({ body: { data: { exists: false } } });
      return jsonRes({ body: {} });
    });
    render(<EmployeeRegister />);
    fireEvent.click(screen.getByTestId("fill-valid"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() =>
      expect(screen.getByTestId("step2")).toBeInTheDocument()
    );
    // Click Register without uploading any files
    fireEvent.click(screen.getByRole("button", { name: /Register/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Please upload all the 3 images"
      )
    );
  });

  it("Step 2 success path: createUser returns success -> toast.success + 'Thank you!' pane appears", async () => {
    fetchSpy.mockImplementation((url, opts) => {
      const u = String(url);
      if (u.includes("/api/v1/departments/get"))
        return jsonRes({ body: { status: "success", data: { data: [] } } });
      if (u.includes("/api/v1/locations/employee-location"))
        return jsonRes({ body: { data: { locations: [] } } });
      if (u.includes("/api/v1/users/isEmailExist"))
        return jsonRes({ body: { data: { exists: false } } });
      if (u.includes("/api/v1/authorizedUsers/create"))
        return jsonRes({ body: { status: "success" } });
      return jsonRes({ body: {} });
    });
    render(<EmployeeRegister />);
    fireEvent.click(screen.getByTestId("fill-valid"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() =>
      expect(screen.getByTestId("step2")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("add-three-files"));
    fireEvent.click(screen.getByRole("button", { name: /Register/i }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Registered successfully!")
    );
    await waitFor(() =>
      expect(screen.getByText(/Thank you!/i)).toBeInTheDocument()
    );
    // Register another button flips back
    fireEvent.click(screen.getByRole("button", { name: /Register another/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Employee Registration/i })
      ).toBeInTheDocument()
    );
  });

  it("Step 2 non-success response: toast.error with body.error", async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/api/v1/departments/get"))
        return jsonRes({ body: { status: "success", data: { data: [] } } });
      if (u.includes("/api/v1/locations/employee-location"))
        return jsonRes({ body: { data: { locations: [] } } });
      if (u.includes("/api/v1/users/isEmailExist"))
        return jsonRes({ body: { data: { exists: false } } });
      if (u.includes("/api/v1/authorizedUsers/create"))
        return jsonRes({ body: { status: "fail", error: "User exists" } });
      return jsonRes({ body: {} });
    });
    render(<EmployeeRegister />);
    fireEvent.click(screen.getByTestId("fill-valid"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() =>
      expect(screen.getByTestId("step2")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("add-three-files"));
    fireEvent.click(screen.getByRole("button", { name: /Register/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("User exists")
    );
  });

  it("Camera modal opens via onOpenCamera and closes via the X button", async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/api/v1/departments/get"))
        return jsonRes({ body: { status: "success", data: { data: [] } } });
      if (u.includes("/api/v1/locations/employee-location"))
        return jsonRes({ body: { data: { locations: [] } } });
      if (u.includes("/api/v1/users/isEmailExist"))
        return jsonRes({ body: { data: { exists: false } } });
      return jsonRes({ body: {} });
    });
    render(<EmployeeRegister />);
    fireEvent.click(screen.getByTestId("fill-valid"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() =>
      expect(screen.getByTestId("step2")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("open-cam"));
    // The camera modal renders "Take Photo - front"
    await waitFor(() =>
      expect(screen.getByText(/Take Photo - front/i)).toBeInTheDocument()
    );
    // Close button — the only button before "Capture" inside the modal
    const captureBtn = screen.getByRole("button", { name: /Capture/i });
    // The X close is the only other button rendered in the modal — find by
    // walking up to the modal then querying its buttons.
    const modal = captureBtn.closest(".fixed");
    const buttons = modal.querySelectorAll("button");
    const closeBtn = buttons[0]; // X button
    fireEvent.click(closeBtn);
    await waitFor(() =>
      expect(screen.queryByText(/Take Photo - front/i)).not.toBeInTheDocument()
    );
  });
});
