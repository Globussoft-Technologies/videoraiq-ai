/**
 * src/page/user/Locations/LocationForm.jsx — Formik + Yup Radix dialog used
 * for both Create and Edit location flows. Schema: locationName required +
 * max 100; empLocationId optional. Submits via createLocation / updateLocation
 * and toasts success / error.
 *
 * Real bits we keep: formik + Yup + the actual schema.
 * Mocks (3):
 *   1. @/components/ui/dialog  - inline passthrough (always-open).
 *   2. sonner                  - capture toast.success / toast.error.
 *   3. ./Api                   - stub createLocation / updateLocation.
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
  createLocation: vi.fn(),
  updateLocation: vi.fn(),
}));
vi.mock("../../../../../src/page/user/Locations/Api", () => apiRef);

const { default: LocationForm } = await import(
  "../../../../../src/page/user/Locations/LocationForm.jsx"
);

beforeEach(() => {
  toastRef.success.mockReset();
  toastRef.error.mockReset();
  apiRef.createLocation.mockReset();
  apiRef.updateLocation.mockReset();
});

describe("LocationForm", () => {
  it("renders the Add New Location title and Add Location submit button by default", () => {
    render(<LocationForm trigger={<button>Open</button>} />);
    expect(screen.getByText("Add New Location")).toBeInTheDocument();
    expect(
      screen.getByText(/Enter details for the new location/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add Location/i })
    ).toBeInTheDocument();
  });

  it("renders Edit Location title and Update Location button when mode='edit'", () => {
    render(
      <LocationForm
        trigger={<button>Open</button>}
        mode="edit"
        initialValues={{
          _id: "loc1",
          locationName: "Bangalore",
          empLocationId: "BLR001",
        }}
      />
    );
    expect(screen.getByText("Edit Location")).toBeInTheDocument();
    expect(screen.getByText(/Update location details/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Update Location/i })
    ).toBeInTheDocument();
  });

  it("populates initial values from props in edit mode", () => {
    render(
      <LocationForm
        trigger={<button>Open</button>}
        mode="edit"
        initialValues={{
          _id: "loc1",
          locationName: "Mumbai",
          empLocationId: "BOM042",
        }}
      />
    );
    expect(screen.getByPlaceholderText(/Banglore/)).toHaveValue("Mumbai");
    expect(screen.getByPlaceholderText(/BLR001/)).toHaveValue("BOM042");
  });

  it("shows validation error when locationName is empty on submit", async () => {
    render(<LocationForm trigger={<button>Open</button>} />);
    fireEvent.click(screen.getByRole("button", { name: /Add Location/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Location name is required/i)
      ).toBeInTheDocument()
    );
    expect(apiRef.createLocation).not.toHaveBeenCalled();
  });

  it("shows the max-length error when locationName exceeds 100 chars", async () => {
    render(<LocationForm trigger={<button>Open</button>} />);
    const input = screen.getByPlaceholderText(/Banglore/);
    fireEvent.change(input, { target: { value: "x".repeat(101) } });
    fireEvent.click(screen.getByRole("button", { name: /Add Location/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Location name cannot exceed 100 characters/i)
      ).toBeInTheDocument()
    );
    expect(apiRef.createLocation).not.toHaveBeenCalled();
  });

  it("submits in create mode: calls createLocation, toasts success, calls onSave", async () => {
    apiRef.createLocation.mockResolvedValue({
      data: { statusCode: 200, body: { message: "Created" } },
    });
    const onSave = vi.fn();
    render(<LocationForm trigger={<button>Open</button>} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText(/Banglore/), {
      target: { value: "Chennai" },
    });
    fireEvent.change(screen.getByPlaceholderText(/BLR001/), {
      target: { value: "MAA-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Location/i }));
    await waitFor(() => expect(apiRef.createLocation).toHaveBeenCalled());
    const payload = apiRef.createLocation.mock.calls[0][0];
    expect(payload.locationName).toBe("Chennai");
    expect(payload.empLocationId).toBe("MAA-1");
    expect(toastRef.success).toHaveBeenCalledWith("Created");
    expect(onSave).toHaveBeenCalled();
  });

  it("submits in create mode: falls back to default success message when API omits one", async () => {
    apiRef.createLocation.mockResolvedValue({
      data: { statusCode: 200, body: {} },
    });
    render(<LocationForm trigger={<button>Open</button>} />);
    fireEvent.change(screen.getByPlaceholderText(/Banglore/), {
      target: { value: "Delhi" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Location/i }));
    await waitFor(() =>
      expect(toastRef.success).toHaveBeenCalledWith(
        "Location created successfully"
      )
    );
  });

  it("submits in edit mode: calls updateLocation with id + payload", async () => {
    apiRef.updateLocation.mockResolvedValue({
      data: { statusCode: 200, body: { message: "Updated" } },
    });
    const onSave = vi.fn();
    render(
      <LocationForm
        trigger={<button>Open</button>}
        mode="edit"
        onSave={onSave}
        initialValues={{
          _id: "loc-99",
          locationName: "Old",
          empLocationId: "OLD",
        }}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/Banglore/), {
      target: { value: "New" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Update Location/i }));
    await waitFor(() => expect(apiRef.updateLocation).toHaveBeenCalled());
    expect(apiRef.updateLocation.mock.calls[0][0]).toBe("loc-99");
    expect(apiRef.updateLocation.mock.calls[0][1].locationName).toBe("New");
    expect(apiRef.updateLocation.mock.calls[0][1].empLocationId).toBe("OLD");
    expect(toastRef.success).toHaveBeenCalledWith("Updated");
    expect(onSave).toHaveBeenCalled();
  });

  it("on API rejection: toasts the server message when present", async () => {
    apiRef.createLocation.mockRejectedValue({
      response: { data: { body: { message: "Duplicate location" } } },
    });
    render(<LocationForm trigger={<button>Open</button>} />);
    fireEvent.change(screen.getByPlaceholderText(/Banglore/), {
      target: { value: "Loc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Location/i }));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Duplicate location")
    );
    expect(toastRef.success).not.toHaveBeenCalled();
  });

  it("on API rejection without a message: falls back to 'Something went wrong'", async () => {
    apiRef.createLocation.mockRejectedValue(new Error("net"));
    render(<LocationForm trigger={<button>Open</button>} />);
    fireEvent.change(screen.getByPlaceholderText(/Banglore/), {
      target: { value: "Loc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Location/i }));
    await waitFor(() =>
      expect(toastRef.error).toHaveBeenCalledWith("Something went wrong")
    );
  });

  it("renders the supplied trigger via DialogTrigger", () => {
    render(
      <LocationForm
        trigger={<button data-testid="my-trigger">Open Form</button>}
      />
    );
    expect(screen.getByTestId("my-trigger")).toBeInTheDocument();
  });
});
