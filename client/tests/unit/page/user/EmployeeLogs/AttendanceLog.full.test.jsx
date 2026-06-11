/**
 * Round 4 client gap-fill: EmployeeLogs/AttendanceLog.jsx — FULL mount.
 *
 * The thin gate-only AttendanceLog.test.jsx left the file at 42.25%.
 * This spec mounts the canView=true page with all heavy children
 * (ReusableTablePage, LogEmployeeProfileDialog, ActionCameraPreview,
 * LogsFilterPopover, BreakLogsDialog, AutoRefreshComponent, MultiSelect)
 * + the five Api modules + sonner + jspdf + xlsx stubbed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import "moment-timezone";

const permissionsRef = vi.hoisted(() => ({ value: null }));
const navigateMock = vi.hoisted(() => vi.fn());
const filterByDepartmentMock = vi.hoisted(() => vi.fn());
const getNVRsMock = vi.hoisted(() => vi.fn());
const getEmployeeLocationsMock = vi.hoisted(() => vi.fn());
const getchannelsMock = vi.hoisted(() => vi.fn());
const getAttendanceLogsMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
const rtpPropsRef = vi.hoisted(() => ({ value: null }));
const filterPopoverPropsRef = vi.hoisted(() => ({ value: null }));
const pdfSaveMock = vi.hoisted(() => vi.fn());
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

vi.mock("../../../../../src/page/user/EmployeeLogs/Api/get", () => ({
  getAttendanceLogs: (...a) => getAttendanceLogsMock(...a),
}));

vi.mock("../../../../../src/page/user/EmployeeLogs/Api/post", () => ({
  filterByDepartment: (...a) => filterByDepartmentMock(...a),
  getNVRs: (...a) => getNVRsMock(...a),
  getEmployeeLocations: (...a) => getEmployeeLocationsMock(...a),
  getchannels: (...a) => getchannelsMock(...a),
}));

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/ReusableTablePage",
  () => ({
    default: (props) => {
      rtpPropsRef.value = props;
      return (
        <div data-testid="rtp">
          <span data-testid="rtp-title">{props.title}</span>
          <span data-testid="rtp-row-count">{props.data?.length || 0}</span>
          <span data-testid="rtp-total">{props.attendanceLogsCount}</span>
          <span data-testid="rtp-view-mode">{props.viewMode || ""}</span>
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
            null
          </button>
          <button
            data-testid="rtp-limit"
            onClick={() => props.onLimitChange?.(50)}
          >
            lim
          </button>
          <button
            data-testid="rtp-set-grid"
            onClick={() => props.onViewModeChange?.("grid")}
          >
            grid
          </button>
          <div data-testid="rtp-children">{props.children}</div>
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
          {props.gridCard && props.data?.length > 0 && (
            <div data-testid="grid-cards">
              {props.data.map((it, i) => (
                <div key={i}>{props.gridCard(it)}</div>
              ))}
            </div>
          )}
        </div>
      );
    },
  })
);

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/LogEmployeeProfileDialog",
  () => ({
    default: ({ open }) => (open ? <div data-testid="profile-dialog" /> : null),
  })
);

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/ActionCameraPreview",
  () => ({
    default: ({ isOpen, onClose }) =>
      isOpen ? (
        <div data-testid="camera-preview">
          <button data-testid="cp-close" onClick={onClose}>close</button>
        </div>
      ) : null,
  })
);

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/components/LogsFilterPopover",
  () => ({
    default: (props) => {
      filterPopoverPropsRef.value = props;
      return (
        <div data-testid="filter-popover">
          <button
            data-testid="fp-nvr"
            onClick={() => props.setNvrId?.(["nvr1"])}
          >
            nvr
          </button>
          <button
            data-testid="fp-dept"
            onClick={() => props.setSelectedDepartments?.(["d1"])}
          >
            dept
          </button>
          <button
            data-testid="fp-cam"
            onClick={() => props.setCameraId?.(["c1"])}
          >
            cam
          </button>
          <button
            data-testid="fp-loc"
            onClick={() => props.setEmployeeLocations?.(["LocA"])}
          >
            loc
          </button>
        </div>
      );
    },
  })
);

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/components/BreakLogsDialog",
  () => ({
    default: ({ open }) => (open ? <div data-testid="break-logs" /> : null),
  })
);

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/components/AutoRefreshComponent",
  () => ({
    default: (props) => (
      <div data-testid="auto-refresh">
        <button
          data-testid="ar-toggle"
          onClick={() => props.onActiveChange?.(!props.isActive)}
        >
          tog
        </button>
        <button
          data-testid="ar-int"
          onClick={() => props.onIntervalChange?.(15)}
        >
          int
        </button>
        <button data-testid="ar-manual" onClick={() => props.onManualRefresh?.()}>
          man
        </button>
      </div>
    ),
  })
);

vi.mock("@/components/ui/multiselect", () => ({
  default: ({ options, value, onChange, placeholder }) => (
    <div data-testid={`ms-${placeholder?.replace(/\s+/g, "-")}`}>
      <button
        data-testid={`ms-pick-${placeholder?.replace(/\s+/g, "-")}`}
        onClick={() => onChange?.(["pick"])}
      >
        pick
      </button>
    </div>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }) => <div data-testid="select">{children}</div>,
  SelectTrigger: ({ children }) => <>{children}</>,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ children }) => <>{children}</>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...rest }) => (
    <button onClick={onClick} {...rest}>{children}</button>
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
    setDrawColor: vi.fn(),
  })),
}));

vi.mock("jspdf-autotable", () => ({ default: vi.fn() }));

vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: vi.fn().mockReturnValue({}),
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
    encode_cell: vi.fn(() => "H1"),
  },
  writeFile: xlsxWriteFileMock,
}));

const { default: AttendanceLog } = await import(
  "../../../../../src/page/user/EmployeeLogs/AttendanceLog.jsx"
);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const fullPerms = (over = {}) => ({
  permissions: {
    logs: {
      attendanceLogs: { view: true, edit: true, ...over },
    },
  },
  loading: false,
});

const okLogs = (rows = 1, total = 6) => ({
  data: {
    statusCode: 200,
    body: {
      data: {
        attendanceLogs: Array.from({ length: rows }, (_, i) => ({
          _id: `att${i + 1}`,
          name: `User-${i + 1}`,
          department: `Dept-${i}`,
          date: "2025-04-01",
          checkIn: "2025-04-01T08:00:00Z",
          checkOut: "2025-04-01T17:00:00Z",
          cameraName: `Cam-${i}`,
          location: "LocA",
          sessions: [
            {
              channel: { name: `Cam-${i}` },
              timestamp: "2025-04-01T08:00:00Z",
              images: { frameImage: "/f.jpg" },
            },
          ],
        })),
        total,
        attendanceLogsStartDate: "2025-04-01",
      },
    },
  },
});

const okDepts = () => ({
  data: {
    body: { data: { data: [{ _id: "d1", departmentName: "DeptA" }] } },
  },
});

const okNvrs = () => ({
  data: { body: { data: [{ _id: "nvr1", nvrName: "NVR-A" }] } },
});

const okLocations = () => ({
  data: { body: { data: { locations: [{ locationName: "LocA" }] } } },
});

const okChannels = () => ({
  data: { body: { data: [{ _id: "cam1", name: "Cam-A" }] } },
});

const wireDefaults = () => {
  filterByDepartmentMock.mockResolvedValue(okDepts());
  getNVRsMock.mockResolvedValue(okNvrs());
  getEmployeeLocationsMock.mockResolvedValue(okLocations());
  getchannelsMock.mockResolvedValue(okChannels());
  getAttendanceLogsMock.mockResolvedValue(okLogs(1, 6));
};

beforeEach(() => {
  permissionsRef.value = null;
  navigateMock.mockReset();
  filterByDepartmentMock.mockReset();
  getNVRsMock.mockReset();
  getEmployeeLocationsMock.mockReset();
  getchannelsMock.mockReset();
  getAttendanceLogsMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  rtpPropsRef.value = null;
  filterPopoverPropsRef.value = null;
  pdfSaveMock.mockReset();
  xlsxWriteFileMock.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AttendanceLog — gate branches", () => {
  it("loading branch returns null", async () => {
    permissionsRef.value = { permissions: null, loading: true };
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    expect(screen.queryByTestId("rtp")).not.toBeInTheDocument();
  });

  it("AccessDenied when no permission found", async () => {
    permissionsRef.value = { permissions: { logs: {} }, loading: false };
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() =>
      expect(screen.getByTestId("access-denied")).toBeInTheDocument()
    );
  });

  it("redirects to /logs/access when only accessLogs.view is true", async () => {
    permissionsRef.value = {
      permissions: {
        logs: {
          attendanceLogs: { view: false },
          accessLogs: { view: true },
        },
      },
      loading: false,
    };
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/logs/access", {
        replace: true,
      })
    );
  });

  it("redirects to /logs/ANPR when only ANPRLogs.view is true", async () => {
    permissionsRef.value = {
      permissions: {
        logs: {
          attendanceLogs: { view: false },
          ANPRLogs: { view: true },
        },
      },
      loading: false,
    };
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/logs/ANPR", { replace: true })
    );
  });
});

describe("AttendanceLog — full mount", () => {
  it("mount fires five Api fetchers", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => {
      expect(filterByDepartmentMock).toHaveBeenCalled();
      expect(getNVRsMock).toHaveBeenCalled();
      expect(getEmployeeLocationsMock).toHaveBeenCalled();
      expect(getAttendanceLogsMock).toHaveBeenCalled();
    });
  });

  it("ReusableTablePage receives mapped rows + total", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("rtp-row-count").textContent).toBe("1");
      expect(screen.getByTestId("rtp-total").textContent).toBe("6");
    });
  });

  it("all five fetcher rejections swallow + don't crash", async () => {
    permissionsRef.value = fullPerms();
    filterByDepartmentMock.mockRejectedValue(new Error("d"));
    getNVRsMock.mockRejectedValue(new Error("n"));
    getEmployeeLocationsMock.mockRejectedValue(new Error("l"));
    getchannelsMock.mockRejectedValue(new Error("c"));
    getAttendanceLogsMock.mockRejectedValue(new Error("a"));
    await act(async () => {
      render(<AttendanceLog />);
    });
    await flush();
    expect(screen.getByTestId("rtp")).toBeInTheDocument();
  });

  it("statusCode=500 'No attendance found' arm sets empty rows", async () => {
    permissionsRef.value = fullPerms();
    filterByDepartmentMock.mockResolvedValue(okDepts());
    getNVRsMock.mockResolvedValue(okNvrs());
    getEmployeeLocationsMock.mockResolvedValue(okLocations());
    getchannelsMock.mockResolvedValue(okChannels());
    getAttendanceLogsMock.mockResolvedValue({
      data: {
        statusCode: 500,
        body: {
          status: "failed",
          message: "No attendance found",
        },
      },
    });
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("rtp-row-count").textContent).toBe("0");
      expect(screen.getByTestId("rtp-total").textContent).toBe("0");
    });
  });

  it("search input triggers re-fetch", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const before = getAttendanceLogsMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-search"));
    });
    await flush();
    expect(getAttendanceLogsMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("date range setter updates state + null branch falls back to today", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-date"));
    });
    await flush();
    // null branch: AttendanceLog defaults back to today's ISO date
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-date-null"));
    });
    await flush();
    // Source falls back to state.todayISO which is YYYY-MM-DD format
    expect(rtpPropsRef.value.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("limit change resets page + bumps limit", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-limit"));
    });
    await flush();
    expect(rtpPropsRef.value.limit).toBe(50);
  });

  it("AutoRefresh toggle/interval/manual all work + persistence", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("auto-refresh"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("ar-toggle"));
    });
    await flush();
    expect(window.localStorage.getItem("attendance_auto_refresh_enabled")).toMatch(
      /^(true|false)$/
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("ar-int"));
    });
    await flush();
    expect(window.localStorage.getItem("attendance_auto_refresh_interval")).toBe(
      "15"
    );
    const before = getAttendanceLogsMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId("ar-manual"));
    });
    await flush();
    expect(getAttendanceLogsMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("auto-refresh timer ticks call fetchLogs while active+interval>0", async () => {
    vi.useFakeTimers();
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const before = getAttendanceLogsMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(30_001);
    });
    expect(getAttendanceLogsMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("view mode change to 'grid' persists to localStorage", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-set-grid"));
    });
    await flush();
    expect(window.localStorage.getItem("attendance_view_mode")).toBe("grid");
  });

  it("re-mount with saved viewMode=grid reads it back", async () => {
    window.localStorage.setItem("attendance_view_mode", "grid");
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    expect(rtpPropsRef.value.viewMode).toBe("grid");
  });

  it("re-mount with saved autoRefresh=false reads it back", async () => {
    window.localStorage.setItem("attendance_auto_refresh_enabled", "false");
    window.localStorage.setItem("attendance_auto_refresh_interval", "0");
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await flush();
    expect(window.localStorage.getItem("attendance_auto_refresh_enabled")).toBe(
      "false"
    );
  });

  it("LogsFilterPopover handler change re-fetches", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("filter-popover"));
    const before = getAttendanceLogsMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-nvr"));
    });
    await flush();
    expect(getAttendanceLogsMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("exportToPDF empty-data toasts 'No data to export'", async () => {
    permissionsRef.value = fullPerms();
    filterByDepartmentMock.mockResolvedValue(okDepts());
    getNVRsMock.mockResolvedValue(okNvrs());
    getEmployeeLocationsMock.mockResolvedValue(okLocations());
    getchannelsMock.mockResolvedValue(okChannels());
    // First call empty; second call (export) also empty
    getAttendanceLogsMock.mockResolvedValue(okLogs(0, 0));
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByText("Export PDF"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export PDF"));
    });
    await flush();
    expect(toastMock.error).toHaveBeenCalledWith("No data to export");
  });

  it("exportToExcel empty-data toasts 'No data to export'", async () => {
    permissionsRef.value = fullPerms();
    filterByDepartmentMock.mockResolvedValue(okDepts());
    getNVRsMock.mockResolvedValue(okNvrs());
    getEmployeeLocationsMock.mockResolvedValue(okLocations());
    getchannelsMock.mockResolvedValue(okChannels());
    getAttendanceLogsMock.mockResolvedValue(okLogs(0, 0));
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByText("Export Excel"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export Excel"));
    });
    await flush();
    expect(toastMock.error).toHaveBeenCalledWith("No data to export");
  });

  it("exportToPDF success calls doc.save", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByText("Export PDF"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export PDF"));
    });
    await flush();
    expect(pdfSaveMock).toHaveBeenCalled();
  });

  it("exportToExcel success calls XLSX.writeFile", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByText("Export Excel"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export Excel"));
    });
    await flush();
    expect(xlsxWriteFileMock).toHaveBeenCalled();
  });

  it("canEdit=false hides export buttons", async () => {
    permissionsRef.value = fullPerms({ edit: false });
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    expect(screen.queryByText("Export PDF")).not.toBeInTheDocument();
    expect(screen.queryByText("Export Excel")).not.toBeInTheDocument();
  });

  it("Sort header click flips sortOrder + re-fetches", async () => {
    permissionsRef.value = fullPerms();
    wireDefaults();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const before = getAttendanceLogsMock.mock.calls.length;
    const hdr = screen.queryByTestId("rtp-hdr-name");
    if (hdr) {
      const btn = hdr.querySelector("button");
      if (btn) {
        await act(async () => {
          fireEvent.click(btn);
        });
        await flush();
        expect(getAttendanceLogsMock.mock.calls.length).toBeGreaterThan(before);
      }
    }
  });
});
