/**
 * DashboardFiltersContext fetches departments + locations on mount and
 * exposes setters + refetchers. The two API calls are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const getDepartments = vi.hoisted(() => vi.fn());
const getLocations = vi.hoisted(() => vi.fn());
vi.mock("../../../src/page/user/Dashboard/Api/get", () => ({
  getDepartments,
  getLocations,
}));

const {
  DashboardFiltersProvider,
  useDashboardFiltersContext,
} = await import(
  "../../../src/context/UserContext/DashboardFiltersContext.jsx"
);

const wrapper = ({ children }) => (
  <DashboardFiltersProvider>{children}</DashboardFiltersProvider>
);

beforeEach(() => {
  getDepartments.mockReset();
  getLocations.mockReset();
});

describe("DashboardFiltersContext", () => {
  it("populates departments + locations from successful API responses", async () => {
    getDepartments.mockResolvedValue({
      status: "success",
      data: [
        { _id: "d1", departmentName: "HR" },
        { _id: "d2", departmentName: "IT" },
      ],
    });
    getLocations.mockResolvedValue({
      status: "success",
      data: ["HQ", "Branch"],
    });

    const { result } = renderHook(() => useDashboardFiltersContext(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.departments).toHaveLength(2));
    expect(result.current.departments[0]).toEqual({ id: "d1", label: "HR" });
    await waitFor(() => expect(result.current.locations).toHaveLength(2));
    expect(result.current.locations[0]).toEqual({ id: 0, label: "HQ" });
    expect(result.current.loading).toBe(false);
  });

  it("starts with empty selections", async () => {
    getDepartments.mockResolvedValue({ status: "success", data: [] });
    getLocations.mockResolvedValue({ status: "success", data: [] });
    const { result } = renderHook(() => useDashboardFiltersContext(), {
      wrapper,
    });
    await waitFor(() => expect(getDepartments).toHaveBeenCalled());
    expect(result.current.selectedDepartment).toEqual([]);
    expect(result.current.selectedLocation).toEqual([]);
  });

  it("ignores a non-success API response (state stays empty)", async () => {
    getDepartments.mockResolvedValue({ status: "failed" });
    getLocations.mockResolvedValue({ status: "failed" });
    const { result } = renderHook(() => useDashboardFiltersContext(), {
      wrapper,
    });
    await waitFor(() => expect(getLocations).toHaveBeenCalled());
    expect(result.current.departments).toEqual([]);
    expect(result.current.locations).toEqual([]);
  });

  it("swallows API errors and stops loading", async () => {
    getDepartments.mockRejectedValue(new Error("dept boom"));
    getLocations.mockRejectedValue(new Error("loc boom"));
    const { result } = renderHook(() => useDashboardFiltersContext(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.departments).toEqual([]);
    expect(result.current.locations).toEqual([]);
  });

  it("exposes setters for the current selections", async () => {
    getDepartments.mockResolvedValue({ status: "success", data: [] });
    getLocations.mockResolvedValue({ status: "success", data: [] });
    const { result } = renderHook(() => useDashboardFiltersContext(), {
      wrapper,
    });
    await waitFor(() => expect(getDepartments).toHaveBeenCalled());
    act(() => result.current.setSelectedDepartment(["d1"]));
    expect(result.current.selectedDepartment).toEqual(["d1"]);
    act(() => result.current.setSelectedLocation(["HQ"]));
    expect(result.current.selectedLocation).toEqual(["HQ"]);
  });
});
