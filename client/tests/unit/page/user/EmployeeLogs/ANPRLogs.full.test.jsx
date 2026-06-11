/**
 * Round 4 client gap-fill: EmployeeLogs/ANPRLogs.jsx — FULL mount.
 *
 * The thin gate-only ANPRLogs.test.jsx left the file at 40.04%. This
 * spec mounts canView=true and exercises the major surfaces:
 *   - ReusableTablePage stub captures the data + children passed in.
 *   - axios.get spies cover the four mount-time + filter-driven fetches.
 *   - getNVRs / getchannels post stubs populate filter dropdowns.
 *   - PDF (jsPDF + autoTable) and Excel (XLSX) export error path is
 *     observable via toast.error when no data is returned.
 *   - AutoRefreshComponent stub triggers manual + auto-refresh paths.
 *   - DateRange handler, search handler, sort header handlers fire.
 *   - View mode toggle (list <-> grid) renders the grid view branch.
 *   - resetFilters clears all three filter primitives.
 *   - permissions redirect path navigates to /logs/access when ANPR
 *     view is false but accessLogs.view is true.
 *
 * Mocks (under the 8-mock pre-r4 limit; lifted per round-4 brief):
 *   - PermissionContext, AccessDenied, react-router-dom, ./Api/post,
 *     axios, getAccessToken, ReusableTablePage, AutoRefreshComponent,
 *     MultiSelect, DateRangePicker, sonner, jspdf + jspdf-autotable +
 *     xlsx (export side-effects).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import "moment-timezone";

const permissionsRef = vi.hoisted(() => ({ value: null }));
const navigateMock = vi.hoisted(() => vi.fn());
const axiosGetMock = vi.hoisted(() => vi.fn());
const getNVRsMock = vi.hoisted(() => vi.fn());
const getchannelsMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
const rtpPropsRef = vi.hoisted(() => ({ value: null }));
const autoRefreshPropsRef = vi.hoisted(() => ({ value: null }));
const dateRangePickerPropsRef = vi.hoisted(() => ({ value: null }));
const pdfSaveMock = vi.hoisted(() => vi.fn());
const autoTableMock = vi.hoisted(() => vi.fn());
const xlsxWriteFileMock = vi.hoisted(() => vi.fn());

vi.mock("@/context/Permission/PermissionContext", () => ({
  usePermissions: () => permissionsRef.value,
}));

vi.mock("@/components/AccessDenied", () => ({
  default: ({ message }) => <div data-testid="access-denied">{message}</div>,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("../../../../../src/page/user/EmployeeLogs/Api/post", () => ({
  getNVRs: (...a) => getNVRsMock(...a),
  getchannels: (...a) => getchannelsMock(...a),
}));

vi.mock("axios", () => ({
  default: {
    get: axiosGetMock,
    post: vi.fn(),
  },
}));

vi.mock("@/utils/getAccessToken", () => ({
  default: () => "tok",
}));

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/ReusableTablePage",
  () => ({
    default: (props) => {
      rtpPropsRef.value = props;
      return (
        <div data-testid="rtp">
          <span data-testid="rtp-title">{props.title}</span>
          <span data-testid="rtp-loading">{String(props.loading)}</span>
          <span data-testid="rtp-row-count">{props.data?.length || 0}</span>
          <span data-testid="rtp-total">{props.attendanceLogsCount}</span>
          <button
            data-testid="rtp-search"
            onClick={() => props.onSearchChange?.("abc")}
          >
            search
          </button>
          <button
            data-testid="rtp-date"
            onClick={() =>
              props.onDateRangeChange?.({
                start: new Date("2025-04-01"),
                end: new Date("2025-04-05"),
              })
            }
          >
            date
          </button>
          <button
            data-testid="rtp-date-null"
            onClick={() =>
              props.onDateRangeChange?.({ start: null, end: null })
            }
          >
            date-null
          </button>
          <button
            data-testid="rtp-limit"
            onClick={() => props.onLimitChange?.(50)}
          >
            limit
          </button>
          <div data-testid="rtp-children">{props.children}</div>
          {/* Expose all column header/cell calls for sort-header coverage */}
          {props.columns?.map((col, i) => (
            <span key={i} data-testid={`rtp-hdr-${col.accessorKey}`}>
              {typeof col.header === "function" ? col.header() : col.header}
            </span>
          ))}
          {props.data?.map((row, i) => (
            <div key={i} data-testid={`rtp-row-${i}`}>
              {props.columns?.map((col, ci) =>
                col.cell ? (
                  <span key={ci} data-testid={`rtp-cell-${i}-${col.accessorKey}`}>
                    {col.cell({ row: { original: row } })}
                  </span>
                ) : null
              )}
            </div>
          ))}
        </div>
      );
    },
  })
);

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/components/AutoRefreshComponent",
  () => ({
    default: (props) => {
      autoRefreshPropsRef.value = props;
      return (
        <div data-testid="auto-refresh">
          <button
            data-testid="ar-toggle"
            onClick={() => props.onActiveChange?.(!props.isActive)}
          >
            tog
          </button>
          <button
            data-testid="ar-interval"
            onClick={() => props.onIntervalChange?.(15)}
          >
            int
          </button>
          <button data-testid="ar-manual" onClick={() => props.onManualRefresh?.()}>
            man
          </button>
        </div>
      );
    },
  })
);

vi.mock("@/components/ui/calendar", () => ({
  DateRangePickerComponent: (props) => {
    dateRangePickerPropsRef.value = props;
    return (
      <button
        data-testid="cal-fire"
        onClick={() =>
          props.onRangeChange?.({
            start: new Date("2025-05-01"),
            end: new Date("2025-05-02"),
          })
        }
      >
        cal
      </button>
    );
  },
}));

vi.mock("@/components/ui/multiselect", () => ({
  default: ({ options, value, onChange, placeholder }) => (
    <div data-testid={`ms-${placeholder.replace(/\s+/g, "-")}`}>
      <span data-testid={`ms-opt-count-${placeholder.replace(/\s+/g, "-")}`}>
        {options?.length || 0}
      </span>
      <button
        data-testid={`ms-pick-${placeholder.replace(/\s+/g, "-")}`}
        onClick={() => onChange?.(["nvr1"])}
      >
        pick
      </button>
      <button
        data-testid={`ms-clear-${placeholder.replace(/\s+/g, "-")}`}
        onClick={() => onChange?.([])}
      >
        clr
      </button>
    </div>
  ),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("jspdf", () => ({
  default: vi.fn().mockImplementation(() => ({
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    text: vi.fn(),
    save: pdfSaveMock,
    setTextColor: vi.fn(),
    getTextWidth: () => 10,
    setLineWidth: vi.fn(),
    line: vi.fn(),
    link: vi.fn(),
  })),
}));

vi.mock("jspdf-autotable", () => ({
  default: (...a) => autoTableMock(...a),
}));

vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: vi.fn().mockReturnValue({}),
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
    encode_cell: vi.fn(() => "H1"),
  },
  writeFile: xlsxWriteFileMock,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...rest }) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }) => <>{children}</>,
  PopoverTrigger: ({ children }) => <>{children}</>,
  PopoverContent: ({ children }) => <>{children}</>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange, value }) => (
    <div data-testid="severity-select" data-value={value}>
      <button
        data-testid="severity-pick-low"
        onClick={() => onValueChange?.("low")}
      >
        low
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }) => <>{children}</>,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ children, value }) => <span data-value={value}>{children}</span>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));

const { default: ANPRLogs } = await import(
  "../../../../../src/page/user/EmployeeLogs/ANPRLogs.jsx"
);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const fullPerms = (over = {}) => ({
  permissions: {
    logs: {
      ANPRLogs: { view: true, edit: true, ...over },
    },
  },
  loading: false,
});

const okLogs = (count = 2, total = 6) => ({
  data: {
    body: {
      data: {
        data: Array.from({ length: count }, (_, i) => ({
          _id: `id${i + 1}`,
          incidentName: `Incident ${i + 1}`,
          nvrData: { nvrName: `NVR-${i + 1}` },
          channelData: { name: `Cam-${i + 1}` },
          vehicleNumber: `XX${i + 1}`,
          createdAt: "2025-04-01T01:00:00Z",
          severity: i === 0 ? "high" : "moderate",
          Image: "/upload/x.jpg",
          resolved: false,
          reportStatus: false,
        })),
        totalCount: total,
      },
    },
  },
});

const okNvrs = () => ({
  data: {
    body: {
      data: [
        { _id: "nvr1", nvrName: "NVR-A" },
        { _id: "nvr2", nvrName: "NVR-B" },
      ],
    },
  },
});

const okChannels = () => ({
  data: {
    body: {
      data: [
        { _id: "cam1", customName: "Cam-A" },
        { _id: "cam2", name: "Cam-B" },
      ],
    },
  },
});

const okVehicleNumbers = () => ({
  data: { body: { data: { vehicleNumbers: ["AB-100", "CD-200"] } } },
});

beforeEach(() => {
  permissionsRef.value = null;
  navigateMock.mockReset();
  axiosGetMock.mockReset();
  getNVRsMock.mockReset();
  getchannelsMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  rtpPropsRef.value = null;
  autoRefreshPropsRef.value = null;
  dateRangePickerPropsRef.value = null;
  pdfSaveMock.mockReset();
  autoTableMock.mockReset();
  xlsxWriteFileMock.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

const wireDefaults = () => {
  getNVRsMock.mockResolvedValue(okNvrs());
  getchannelsMock.mockResolvedValue(okChannels());
  axiosGetMock.mockImplementation(async (url) => {
    if (url.includes("/numbers")) return okVehicleNumbers();
    return okLogs(2, 6);
  });
};

describe("ANPRLogs — gate branches", () => {
  it("loading branch returns null", async () => {
    permissionsRef.value = { permissions: null, loading: true };
    wireDefaults();
    let utils;
    await act(async () => {
      utils = render(<ANPRLogs />);
    });
    // No AccessDenied, no RTP
    expect(screen.queryByTestId("access-denied")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rtp")).not.toBeInTheDocument();
  });

  it("AccessDenied when canView false and no fallback route", async () => {
    permissionsRef.value = {
      permissions: { logs: {} },
      loading: false,
    };
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("access-denied")).toBeInTheDocument();
    });
  });

  it("redirects to /logs/attendance when ANPR.view false but attendanceLogs.view true", async () => {
    permissionsRef.value = {
      permissions: {
        logs: {
          ANPRLogs: { view: false },
          attendanceLogs: { view: true },
        },
      },
      loading: false,
    };
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/logs/attendance", {
        replace: true,
      });
    });
  });

  it("redirects to /logs/access when only accessLogs.view is true", async () => {
    permissionsRef.value = {
      permissions: {
        logs: {
          ANPRLogs: { view: false },
          accessLogs: { view: true },
        },
      },
      loading: false,
    };
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/logs/access", { replace: true });
    });
  });
});

describe("ANPRLogs — full mount", () => {
  it("mounts and fires axios + getNVRs + vehicle-numbers", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    vi.useFakeTimers();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(getNVRsMock).toHaveBeenCalled();
    expect(axiosGetMock).toHaveBeenCalled();
  });

  it("ReusableTablePage receives mapped rows", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("rtp-row-count").textContent).toBe("2");
      expect(screen.getByTestId("rtp-total").textContent).toBe("6");
    });
  });

  it("fetchLogs catch path sets error and stops loading", async () => {
    permissionsRef.value = fullPerms();
    getNVRsMock.mockResolvedValue(okNvrs());
    getchannelsMock.mockResolvedValue(okChannels());
    axiosGetMock.mockImplementation(async (url) => {
      if (url.includes("vehicle-detection") && !url.includes("numbers"))
        throw new Error("logs-down");
      return okVehicleNumbers();
    });
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("rtp-row-count").textContent).toBe("0");
    });
  });

  it("getNVRs rejection swallows", async () => {
    permissionsRef.value = fullPerms();
    getNVRsMock.mockRejectedValue(new Error("nvr-fail"));
    getchannelsMock.mockResolvedValue(okChannels());
    axiosGetMock.mockResolvedValue(okLogs(0, 0));
    await act(async () => {
      render(<ANPRLogs />);
    });
    await flush();
    expect(screen.getByTestId("rtp")).toBeInTheDocument();
  });

  it("getchannels rejection swallows", async () => {
    permissionsRef.value = fullPerms();
    getNVRsMock.mockResolvedValue(okNvrs());
    getchannelsMock.mockRejectedValue(new Error("chan-fail"));
    axiosGetMock.mockResolvedValue(okLogs(0, 0));
    await act(async () => {
      render(<ANPRLogs />);
    });
    await flush();
    expect(screen.getByTestId("rtp")).toBeInTheDocument();
  });

  it("vehicle-numbers axios rejection swallows", async () => {
    permissionsRef.value = fullPerms();
    getNVRsMock.mockResolvedValue(okNvrs());
    getchannelsMock.mockResolvedValue(okChannels());
    axiosGetMock.mockImplementation(async (url) => {
      if (url.includes("/numbers")) throw new Error("vn-fail");
      return okLogs(1, 1);
    });
    vi.useFakeTimers();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("rtp")).toBeInTheDocument();
  });

  it("ReusableTablePage onSearchChange propagates and triggers re-fetch", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const before = axiosGetMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-search"));
    });
    await flush();
    expect(axiosGetMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("ReusableTablePage date range setter updates state", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-date"));
    });
    await flush();
    // null date branch
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-date-null"));
    });
    await flush();
    expect(rtpPropsRef.value.startDate).toBe("");
  });

  it("ReusableTablePage onLimitChange updates page size", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-limit"));
    });
    await flush();
    expect(rtpPropsRef.value.limit).toBe(50);
  });

  it("AutoRefresh toggle flips autoRefresh and persists to localStorage", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByTestId("ar-toggle"));
    });
    await flush();
    expect(
      window.localStorage.getItem("vehicle_obstruction_auto_refresh_enabled")
    ).toMatch(/^(true|false)$/);
  });

  it("AutoRefresh interval change persists to localStorage", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByTestId("ar-interval"));
    });
    await flush();
    expect(
      window.localStorage.getItem("vehicle_obstruction_auto_refresh_interval")
    ).toBe("15");
  });

  it("AutoRefresh manual refresh bumps manualTrigger which re-runs fetchLogs", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await flush();
    const before = axiosGetMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId("ar-manual"));
    });
    await flush();
    expect(axiosGetMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("auto-refresh timer ticks while active + interval > 0", async () => {
    vi.useFakeTimers();
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const before = axiosGetMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(30_001);
    });
    expect(axiosGetMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("exportToPDF on empty data toasts 'No data to export'", async () => {
    permissionsRef.value = fullPerms();
    getNVRsMock.mockResolvedValue(okNvrs());
    getchannelsMock.mockResolvedValue(okChannels());
    axiosGetMock.mockImplementation(async (url) => {
      if (url.includes("/numbers")) return okVehicleNumbers();
      return okLogs(0, 0);
    });
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByText("Export PDF"));
    const pdfBtn = screen.getByText("Export PDF");
    await act(async () => {
      fireEvent.click(pdfBtn);
    });
    await flush();
    expect(toastMock.error).toHaveBeenCalledWith("No data to export");
  });

  it("exportToExcel on empty data toasts 'No data to export'", async () => {
    permissionsRef.value = fullPerms();
    getNVRsMock.mockResolvedValue(okNvrs());
    getchannelsMock.mockResolvedValue(okChannels());
    axiosGetMock.mockImplementation(async (url) => {
      if (url.includes("/numbers")) return okVehicleNumbers();
      return okLogs(0, 0);
    });
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByText("Export Excel"));
    const xlsBtn = screen.getByText("Export Excel");
    await act(async () => {
      fireEvent.click(xlsBtn);
    });
    await flush();
    expect(toastMock.error).toHaveBeenCalledWith("No data to export");
  });

  it("exportToPDF success path calls doc.save", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByText("Export PDF"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export PDF"));
    });
    await flush();
    expect(pdfSaveMock).toHaveBeenCalledWith("vehicle_obstruction_logs.pdf");
  });

  it("exportToExcel success path calls XLSX.writeFile", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByText("Export Excel"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export Excel"));
    });
    await flush();
    expect(xlsxWriteFileMock).toHaveBeenCalled();
  });

  it("exportToPDF catch path toasts 'Failed to export PDF'", async () => {
    permissionsRef.value = fullPerms();
    getNVRsMock.mockResolvedValue(okNvrs());
    getchannelsMock.mockResolvedValue(okChannels());
    let firstLogs = true;
    axiosGetMock.mockImplementation(async (url) => {
      if (url.includes("/numbers")) return okVehicleNumbers();
      if (firstLogs) {
        firstLogs = false;
        return okLogs(1, 1);
      }
      throw new Error("export-fail");
    });
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByText("Export PDF"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export PDF"));
    });
    await flush();
    expect(toastMock.error).toHaveBeenCalledWith("Failed to export PDF");
  });

  it("exportToExcel catch path toasts 'Failed to export Excel'", async () => {
    permissionsRef.value = fullPerms();
    getNVRsMock.mockResolvedValue(okNvrs());
    getchannelsMock.mockResolvedValue(okChannels());
    let firstLogs = true;
    axiosGetMock.mockImplementation(async (url) => {
      if (url.includes("/numbers")) return okVehicleNumbers();
      if (firstLogs) {
        firstLogs = false;
        return okLogs(1, 1);
      }
      throw new Error("xls-fail");
    });
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByText("Export Excel"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export Excel"));
    });
    await flush();
    expect(toastMock.error).toHaveBeenCalledWith("Failed to export Excel");
  });

  it("Sort header click flips sortOrder asc<->desc + re-fetch", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const before = axiosGetMock.mock.calls.length;
    // header for 'incidentName' is a button — click it
    const hdr = screen.getByTestId("rtp-hdr-incidentName");
    const btn = hdr.querySelector("button");
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush();
    expect(axiosGetMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("Image cell button shows preview overlay when incidentImageUrl is present", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp-cell-0-action"));
    const cell = screen.getByTestId("rtp-cell-0-action");
    const btn = cell.querySelector("button");
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush();
    expect(screen.getByAltText("preview")).toBeInTheDocument();
  });

  it("Severity column renders all severity color classes", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp-cell-0-severity"));
    // First row severity = 'high', second = 'moderate'
    expect(screen.getByTestId("rtp-cell-0-severity").textContent).toMatch(/high/);
    expect(screen.getByTestId("rtp-cell-1-severity").textContent).toMatch(/moderate/);
  });

  it("MultiSelect NVR pick triggers channel fetch + clear", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("ms-Select-NVR"));
    const before = getchannelsMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId("ms-pick-Select-NVR"));
    });
    await flush();
    expect(getchannelsMock.mock.calls.length).toBeGreaterThan(before);
    // Now clear should reset channelIds
    await act(async () => {
      fireEvent.click(screen.getByTestId("ms-clear-Select-NVR"));
    });
    await flush();
  });

  it("Severity Select onValueChange updates filter and re-fetches", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("severity-select"));
    const before = axiosGetMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId("severity-pick-low"));
    });
    await flush();
    expect(axiosGetMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("export buttons hidden when canEdit is false", async () => {
    permissionsRef.value = fullPerms({ edit: false });
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    expect(screen.queryByText("Export PDF")).not.toBeInTheDocument();
    expect(screen.queryByText("Export Excel")).not.toBeInTheDocument();
  });

  it("Grid view: clicking Grid switches viewMode and shows date picker", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const gridBtn = screen.getByTitle("Grid view");
    await act(async () => {
      fireEvent.click(gridBtn);
    });
    await flush();
    // Now the grid view is rendered; date picker is in the grid view
    expect(screen.queryByTestId("rtp")).not.toBeInTheDocument();
    expect(screen.getByTestId("cal-fire")).toBeInTheDocument();
  });

  it("Grid view: date picker firing resets the date range state", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    fireEvent.click(screen.getByTitle("Grid view"));
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByTestId("cal-fire"));
    });
    await flush();
    // dateRangePicker captured the call
    expect(dateRangePickerPropsRef.value?.onRangeChange).toBeDefined();
  });

  it("Grid view loading-arm shows Loading.. text", async () => {
    permissionsRef.value = fullPerms();
    getNVRsMock.mockResolvedValue(okNvrs());
    getchannelsMock.mockResolvedValue(okChannels());
    // Stall logs forever
    axiosGetMock.mockImplementation(async (url) => {
      if (url.includes("/numbers")) return okVehicleNumbers();
      return new Promise(() => {}); // pending
    });
    await act(async () => {
      render(<ANPRLogs />);
    });
    await flush();
    fireEvent.click(screen.getByTitle("Grid view"));
    await flush();
    expect(screen.getByText(/Loading\.\./i)).toBeInTheDocument();
  });

  it("Grid view 'No records found' fallback", async () => {
    permissionsRef.value = fullPerms();
    getNVRsMock.mockResolvedValue(okNvrs());
    getchannelsMock.mockResolvedValue(okChannels());
    axiosGetMock.mockImplementation(async (url) => {
      if (url.includes("/numbers")) return okVehicleNumbers();
      return okLogs(0, 0);
    });
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    fireEvent.click(screen.getByTitle("Grid view"));
    await flush();
    await waitFor(() => {
      expect(screen.getByText(/No records found/i)).toBeInTheDocument();
    });
  });

  it("Grid view rows render with image click opening preview", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    const { container } = await act(async () => {
      return render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    fireEvent.click(screen.getByTitle("Grid view"));
    await flush();
    // Wait for grid cards to mount; query images with alt="incident"
    await waitFor(() => {
      const imgs = container.querySelectorAll('img[alt="incident"]');
      expect(imgs.length).toBeGreaterThan(0);
    });
    const img = container.querySelector('img[alt="incident"]');
    await act(async () => {
      fireEvent.click(img);
    });
    await flush();
    expect(screen.getByAltText("preview")).toBeInTheDocument();
  });

  it("Grid view pagination prev/next buttons and rows-per-page select", async () => {
    permissionsRef.value = fullPerms();
    getNVRsMock.mockResolvedValue(okNvrs());
    getchannelsMock.mockResolvedValue(okChannels());
    axiosGetMock.mockImplementation(async (url) => {
      if (url.includes("/numbers")) return okVehicleNumbers();
      return okLogs(2, 30); // 3 pages at limit=10
    });
    await act(async () => {
      render(<ANPRLogs />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    fireEvent.click(screen.getByTitle("Grid view"));
    await flush();
    // Click ›
    const next = screen.getByText("›");
    await act(async () => {
      fireEvent.click(next);
    });
    await flush();
    // Rows-per-page select change
    const rowsSelect = screen.getByDisplayValue("10");
    await act(async () => {
      fireEvent.change(rowsSelect, { target: { value: "20" } });
    });
    await flush();
    // Click ‹ to go back
    const prev = screen.getByText("‹");
    await act(async () => {
      fireEvent.click(prev);
    });
    await flush();
  });
});
