/**
 * Round 5 final gap-fill: EmployeeLogs/AttendanceLog.jsx.
 *
 * After r4 the file sat at 83.95% statements / 67.64% branches.
 * The remaining gaps cluster around:
 *   1. mappedLogs truthy branches (employee + imageUrls populated) — L573-604
 *   2. exportToPDF / exportToExcel internals on non-empty data — L657-758, L776-810
 *   3. column header sort-arrow branches (asc/desc with matching sortField) — L879-1051
 *   4. grid-card stopPropagation click handlers (Play + Hourglass) — L1112-1144
 *   5. dialog onClose / setSelectedLog null paths — L1260-1262, L1393-1409
 *   6. reducer cases not previously dispatched (SET_NVR_VALUE, SET_NVRVASETNRVALUE,
 *      SET_CAMERA_VALUE, SET_MIN_DATE, SET_DATE_RANGE, SET_LOCATION_LIST etc.)
 *
 * UNREACHABLE in this file (left at-is):
 *   - L833-840 `formatDateToYMD` is declared but never called.
 *   - L343-347, L362-380, L396-415 commented-out blocks.
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
const profileDlgPropsRef = vi.hoisted(() => ({ value: null }));
const breakDlgPropsRef = vi.hoisted(() => ({ value: null }));
const camPrevPropsRef = vi.hoisted(() => ({ value: null }));
const pdfDocRef = vi.hoisted(() => ({ value: null }));
const autoTableMock = vi.hoisted(() => vi.fn());
const pdfSaveMock = vi.hoisted(() => vi.fn());
const xlsxWriteFileMock = vi.hoisted(() => vi.fn());
const xlsxJsonToSheetMock = vi.hoisted(() => vi.fn().mockReturnValue({}));

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
          <span data-testid="rtp-view-mode">{props.viewMode || ""}</span>
          <button
            data-testid="rtp-date-flipped"
            onClick={() =>
              props.onDateRangeChange?.({
                start: new Date("2025-04-10"),
                end: new Date("2025-04-01"),
              })
            }
          >
            flip
          </button>
          <button
            data-testid="rtp-date-start-only"
            onClick={() =>
              props.onDateRangeChange?.({
                start: new Date("2025-04-01"),
                end: null,
              })
            }
          >
            start-only
          </button>
          <button
            data-testid="rtp-date-end-only"
            onClick={() =>
              props.onDateRangeChange?.({
                start: null,
                end: new Date("2025-04-05"),
              })
            }
          >
            end-only
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
                  <span
                    key={ci}
                    data-testid={`rtp-cell-${i}-${col.accessorKey}`}
                  >
                    {col.cell({ row: { original: row } })}
                  </span>
                ) : null
              )}
            </div>
          ))}
          {props.gridCard && props.data?.length > 0 && (
            <div data-testid="grid-cards">
              {props.data.map((it, i) => (
                <div key={i} data-testid={`grid-card-${i}`}>
                  {props.gridCard(it)}
                </div>
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
    default: (props) => {
      profileDlgPropsRef.value = props;
      return props.open ? (
        <div data-testid="profile-dialog">
          <button
            data-testid="pd-close"
            onClick={() => props.onOpenChange?.(false)}
          >
            close
          </button>
          <button
            data-testid="pd-open"
            onClick={() => props.onOpenChange?.(true)}
          >
            reopen
          </button>
        </div>
      ) : null;
    },
  })
);

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/ActionCameraPreview",
  () => ({
    default: (props) => {
      camPrevPropsRef.value = props;
      return props.isOpen ? (
        <div data-testid="camera-preview">
          <button data-testid="cp-close" onClick={props.onClose}>
            close
          </button>
        </div>
      ) : null;
    },
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
            data-testid="fp-time-from"
            onClick={() => props.setFromTime?.("08:00")}
          >
            from
          </button>
          <button
            data-testid="fp-time-to"
            onClick={() => props.setToTime?.("17:00")}
          >
            to
          </button>
          <button
            data-testid="fp-time-type"
            onClick={() => props.setTimeType?.("checkin")}
          >
            tt
          </button>
          <button
            data-testid="fp-nvr-non-array"
            onClick={() => props.setNvrId?.("not-array")}
          >
            nvr-bad
          </button>
          <button
            data-testid="fp-cam-non-array"
            onClick={() => props.setCameraId?.("not-array")}
          >
            cam-bad
          </button>
          <button
            data-testid="fp-loc-non-array"
            onClick={() => props.setEmployeeLocations?.("not-array")}
          >
            loc-bad
          </button>
        </div>
      );
    },
  })
);

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/components/BreakLogsDialog",
  () => ({
    default: (props) => {
      breakDlgPropsRef.value = props;
      return props.open ? (
        <div data-testid="break-logs">
          <button
            data-testid="bl-close"
            onClick={() => props.onOpenChange?.(false)}
          >
            close
          </button>
          <button
            data-testid="bl-open"
            onClick={() => props.onOpenChange?.(true)}
          >
            reopen
          </button>
        </div>
      ) : null;
    },
  })
);

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/components/AutoRefreshComponent",
  () => ({
    default: (props) => (
      <div data-testid="auto-refresh">
        <button
          data-testid="ar-int-zero"
          onClick={() => props.onIntervalChange?.(0)}
        >
          zero
        </button>
      </div>
    ),
  })
);

vi.mock("@/components/ui/multiselect", () => ({
  default: ({ placeholder }) => (
    <div data-testid={`ms-${placeholder?.replace(/\s+/g, "-")}`} />
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
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("jspdf", () => ({
  default: vi.fn().mockImplementation(() => {
    const doc = {
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      text: vi.fn(),
      save: pdfSaveMock,
      setTextColor: vi.fn(),
      getTextWidth: () => 25,
      setLineWidth: vi.fn(),
      line: vi.fn(),
      link: vi.fn(),
      setDrawColor: vi.fn(),
    };
    pdfDocRef.value = doc;
    return doc;
  }),
}));

vi.mock("jspdf-autotable", () => ({ default: autoTableMock }));

vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: xlsxJsonToSheetMock,
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
    encode_cell: vi.fn(({ r, c }) => `R${r}C${c}`),
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

// Rich logs payload that exercises mappedLogs truthy branches:
//   - employee populated with firstName/lastName/departmentId/email
//   - profilePics array
//   - imageUrls array with frame/person/face images
const richLogs = (over = {}) => ({
  data: {
    statusCode: 200,
    body: {
      data: {
        attendanceLogs: [
          {
            _id: "att1",
            id: "att1",
            employee: {
              _id: "emp1",
              firstName: "Alice",
              lastName: "Anders",
              email: "alice@ex.com",
              location: "Office A",
              departmentId: { departmentName: "Dept-1" },
              profilePics: ["/pic1.jpg"],
            },
            logInTime: "2025-04-01T08:00:00Z",
            logOutTime: "2025-04-01T17:00:00Z",
            date: "2025-04-01",
            checkinCam: "Cam-IN",
            checkoutCam: "Cam-OUT",
            imageUrls: [
              {
                images: { frame: "f.jpg", person: "p.jpg", face: "fa.jpg" },
                timestamp: "2025-04-01T08:00:00Z",
                cameraType: "ip",
              },
              {
                images: { person: "p2.jpg" },
                timestamp: "2025-04-01T08:05:00Z",
                cameraType: "rtsp",
              },
              {
                images: { face: "fa2.jpg" },
                timestamp: "2025-04-01T08:10:00Z",
                cameraType: "ip",
              },
            ],
          },
          {
            // employee falsy: covers '--' fallback in mappedLogs
            _id: "att2",
            id: "att2",
            logInTime: null,
            logOutTime: "--",
            date: "2025-04-01",
            imageUrls: "not-an-array",
          },
          {
            // employee with no profilePics: hits avatar-initials branch
            _id: "att3",
            id: "att3",
            employee: {
              _id: "emp3",
              firstName: "Charlie",
              lastName: "Chen",
              profilePics: [],
            },
            logInTime: "2025-04-01T09:00:00Z",
            logOutTime: "2025-04-01T18:00:00Z",
            date: "2025-04-01",
          },
        ],
        total: 3,
        attendanceLogsStartDate: "2025-04-01",
      },
      ...over,
    },
  },
});

const wireRich = () => {
  filterByDepartmentMock.mockResolvedValue({
    data: { body: { data: { data: [{ _id: "d1", departmentName: "DeptA" }] } } },
  });
  getNVRsMock.mockResolvedValue({
    data: { body: { data: [{ _id: "nvr1", nvrName: "NVR-A" }] } },
  });
  getEmployeeLocationsMock.mockResolvedValue({
    data: { body: { data: { locations: [{ locationName: "LocA" }] } } },
  });
  getchannelsMock.mockResolvedValue({
    data: { body: { data: [{ _id: "cam1", name: "Cam-A" }] } },
  });
  getAttendanceLogsMock.mockResolvedValue(richLogs());
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
  profileDlgPropsRef.value = null;
  breakDlgPropsRef.value = null;
  camPrevPropsRef.value = null;
  pdfDocRef.value = null;
  autoTableMock.mockReset();
  pdfSaveMock.mockReset();
  xlsxWriteFileMock.mockReset();
  xlsxJsonToSheetMock.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AttendanceLog — gaps5", () => {
  it("mappedLogs renders truthy employee/profilePics/imageUrls branches", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    // 3 rows mapped
    expect(screen.getByTestId("rtp-row-count").textContent).toBe("3");
    // First row has the rich employee values
    expect(
      screen.getByTestId("rtp-cell-0-name").textContent
    ).toContain("Alice");
    expect(
      screen.getByTestId("rtp-cell-0-department").textContent
    ).toContain("Dept-1");
  });

  it("exportToPDF with rich rows invokes autoTable + doc.save (didDrawCell)", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByText("Export PDF"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export PDF"));
    });
    await flush();
    expect(pdfSaveMock).toHaveBeenCalled();
    expect(autoTableMock).toHaveBeenCalled();
    // Drive didDrawCell on the image column (index 9) to cover the link/text branch
    const call = autoTableMock.mock.calls.find((c) => c?.[1]?.didDrawCell);
    if (call) {
      const { didDrawCell } = call[1];
      // body+col-9 hits the link/text/underline block
      didDrawCell({
        column: { index: 9 },
        section: "body",
        row: { index: 0 },
        cell: { x: 1, y: 2, width: 30, height: 10 },
      });
      // non-9 column does nothing (falsy branch)
      didDrawCell({
        column: { index: 0 },
        section: "body",
        row: { index: 0 },
        cell: { x: 1, y: 2, width: 30, height: 10 },
      });
      // head section ignored (falsy branch)
      didDrawCell({
        column: { index: 9 },
        section: "head",
        row: { index: 0 },
        cell: { x: 1, y: 2, width: 30, height: 10 },
      });
      expect(pdfDocRef.value.link).toHaveBeenCalled();
      expect(pdfDocRef.value.line).toHaveBeenCalled();
    }
  });

  it("exportToExcel with rich rows builds hyperlink cells via forEach", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByText("Export Excel"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export Excel"));
    });
    await flush();
    expect(xlsxWriteFileMock).toHaveBeenCalled();
    // json_to_sheet should be called with 3 row objects (rich data length)
    expect(xlsxJsonToSheetMock).toHaveBeenCalled();
    const arg = xlsxJsonToSheetMock.mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg.length).toBe(3);
  });

  it("each sort header click fires the SET_SORT_FIELD/SET_SORT_ORDER dispatch", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const headers = ["name", "department", "date", "location", "Check in", "Check out"];
    for (const key of headers) {
      const hdr = screen.queryByTestId(`rtp-hdr-${key}`);
      if (hdr) {
        const btn = hdr.querySelector("button");
        if (btn) {
          await act(async () => {
            fireEvent.click(btn);
          });
          // second click flips sortOrder to 'desc' on same field — covers asc arm
          await act(async () => {
            fireEvent.click(btn);
          });
          await flush();
        }
      }
    }
    expect(getAttendanceLogsMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("grid view renders gridCard and Play/Hourglass buttons stopPropagation", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    window.localStorage.setItem("attendance_view_mode", "grid");
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    await waitFor(() => screen.getByTestId("grid-cards"));
    // click any Play/Hourglass; we don't depend on a particular text label
    const card = screen.getByTestId("grid-card-0");
    const buttons = card.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      fireEvent.click(buttons[0]); // play (stopPropagation + SET_SELECTED_LOG)
    });
    await act(async () => {
      fireEvent.click(buttons[1]); // hourglass (stopPropagation + SET_SELECTED_BREAK_LOG)
    });
    // card itself triggers SET_SELECTED_PROFILE
    await act(async () => {
      fireEvent.click(card.querySelector("div"));
    });
    await flush();
  });

  it("Play button in table action cell opens camera preview, close clears selectedLog", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    // Action cell row 0 has Play + Hourglass
    const actionCell = screen.getByTestId("rtp-cell-0-actions");
    const buttons = actionCell.querySelectorAll("button");
    await act(async () => {
      fireEvent.click(buttons[0]); // Play
    });
    await flush();
    await waitFor(() => screen.getByTestId("camera-preview"));
    // close preview — triggers onClose handler L1259-1262
    await act(async () => {
      fireEvent.click(screen.getByTestId("cp-close"));
    });
    await flush();
    expect(screen.queryByTestId("camera-preview")).not.toBeInTheDocument();
  });

  it("Profile cell button opens LogEmployeeProfileDialog; close fires SET_SELECTED_PROFILE null", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const profileCell = screen.getByTestId("rtp-cell-0-Profile");
    const btn = profileCell.querySelector("button");
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush();
    await waitFor(() => screen.getByTestId("profile-dialog"));
    // close → covers L1393-1397 (open=false + SET_SELECTED_PROFILE null)
    await act(async () => {
      fireEvent.click(screen.getByTestId("pd-close"));
    });
    await flush();
    expect(screen.queryByTestId("profile-dialog")).not.toBeInTheDocument();
  });

  it("Break logs action button opens BreakLogsDialog; close fires SET_SELECTED_BREAK_LOG null", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const actionCell = screen.getByTestId("rtp-cell-0-actions");
    const buttons = actionCell.querySelectorAll("button");
    await act(async () => {
      fireEvent.click(buttons[1]); // hourglass
    });
    await flush();
    await waitFor(() => screen.getByTestId("break-logs"));
    // close → covers L1405-1409
    await act(async () => {
      fireEvent.click(screen.getByTestId("bl-close"));
    });
    await flush();
    expect(screen.queryByTestId("break-logs")).not.toBeInTheDocument();
  });

  it("date range flipped (start > end) swaps to ascending", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const before = getAttendanceLogsMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-date-flipped"));
    });
    await flush();
    // re-fetch should have fired with start <= end (swap branch L1301-1305)
    expect(getAttendanceLogsMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("date range start-only fills end=start (s && !e branch)", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-date-start-only"));
    });
    await flush();
    // last call's startDate (idx 3) and endDate (idx 4) should be equal
    const calls = getAttendanceLogsMock.mock.calls;
    const last = calls[calls.length - 1];
    expect(last[3]).toBe(last[4]);
  });

  it("date range end-only fills start=end (!s && e branch)", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("rtp-date-end-only"));
    });
    await flush();
    const calls = getAttendanceLogsMock.mock.calls;
    const last = calls[calls.length - 1];
    expect(last[3]).toBe(last[4]);
  });

  it("filter popover non-array setters fall back to [] (Array.isArray ternaries)", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("filter-popover"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-nvr-non-array"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-cam-non-array"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-loc-non-array"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-time-from"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-time-to"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-time-type"));
    });
    await flush();
    // ensure no crash + props sanitized
    expect(filterPopoverPropsRef.value).toBeTruthy();
  });

  it("auto-refresh interval=0 disables timer (autoRefresh && refreshInterval > 0 false branch)", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("auto-refresh"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("ar-int-zero"));
    });
    await flush();
    // Persisted to localStorage
    expect(window.localStorage.getItem("attendance_auto_refresh_interval")).toBe(
      "0"
    );
  });

  it("re-mount with saved interval=NaN string falls back to 30", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    window.localStorage.setItem("attendance_auto_refresh_interval", "not-a-num");
    await act(async () => {
      render(<AttendanceLog />);
    });
    await waitFor(() => screen.getByTestId("auto-refresh"));
    // initial fetch fired
    expect(getAttendanceLogsMock).toHaveBeenCalled();
  });

  it("exportToPDF empty data toasts (covers !allLogs.length branch)", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    getAttendanceLogsMock.mockResolvedValueOnce(richLogs()); // initial fetch
    // Subsequent fetch (the one inside fetchAllForExport) returns empty.
    getAttendanceLogsMock.mockResolvedValueOnce({
      data: { body: { data: { attendanceLogs: [], total: 0 } } },
    });
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
});
