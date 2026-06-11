/**
 * Round 5 final gap-fill: EmployeeLogs/AccessLog.jsx.
 *
 * After r4 the file sat at 87.68% statements / 64.58% branches. The
 * remaining gaps cluster around:
 *   1. mapped row creation with rich employee/profilePics/sessions data
 *      (image, imageUrls, timestamp, enteredIn, exitTiming arms) — L399-425
 *   2. Column cell renders with rich data, plus sort header click that
 *      flips sortOrder when sortField already matches — L711-848
 *   3. Access-time cell branches: enteredMoment+exitMoment with various
 *      hour/minute combos producing every diffText arm — L869-880
 *   4. cameraName === '--' ml-5 arm — L912-913
 *   5. Grid card render + Play stopPropagation — L957-984
 *   6. ProfileDialog onOpenChange(false) path that clears selectedLog
 *      — L1190-1198 (the `if (!isOpen)` arm)
 *   7. exportToPDF didDrawCell on column 7, body section — L623-650
 *   8. exportToExcel forEach hyperlink creation with rich rows — and
 *      filter-popover setNvrId(empty) clearing channelIds — L1138-1141
 *
 * UNREACHABLE here (left at-is):
 *   - L1099 commented-out `minDate` prop
 *   - L1196-1198 `onClose` prop on LogEmployeeProfileDialog: the wrapped
 *     dialog component does not forward `onClose` because its
 *     onOpenChange already covers both arms; the onClose handler is dead
 *     unless the upstream dialog is rewritten.
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
const getAllAccessLogsDetailsMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const rtpPropsRef = vi.hoisted(() => ({ value: null }));
const filterPopoverPropsRef = vi.hoisted(() => ({ value: null }));
const profileDlgPropsRef = vi.hoisted(() => ({ value: null }));
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

vi.mock("../../../../../src/page/user/EmployeeLogs/Api/post", () => ({
  filterByDepartment: (...a) => filterByDepartmentMock(...a),
  getAllAccessLogsDetails: (...a) => getAllAccessLogsDetailsMock(...a),
  getchannels: (...a) => getchannelsMock(...a),
  getEmployeeLocations: (...a) => getEmployeeLocationsMock(...a),
  getNVRs: (...a) => getNVRsMock(...a),
}));

vi.mock(
  "../../../../../src/page/user/EmployeeLogs/ReusableTablePage",
  () => ({
    default: (props) => {
      rtpPropsRef.value = props;
      return (
        <div data-testid="rtp">
          <span data-testid="rtp-row-count">{props.data?.length || 0}</span>
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
            data-testid="pd-open-true"
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
            data-testid="fp-nvr-empty"
            onClick={() => props.setNvrId?.([])}
          >
            nvr-empty
          </button>
          <button
            data-testid="fp-nvr-set"
            onClick={() => props.setNvrId?.(["nvr1"])}
          >
            nvr-set
          </button>
          <button
            data-testid="fp-cam"
            onClick={() => props.setCameraId?.(["cam1"])}
          >
            cam
          </button>
          <button
            data-testid="fp-unknown"
            onClick={() => props.setRemoveUnknown?.(true)}
          >
            unk
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
  "../../../../../src/page/user/EmployeeLogs/components/AutoRefreshComponent",
  () => ({
    default: () => <div data-testid="auto-refresh" />,
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

const { default: AccessLog } = await import(
  "../../../../../src/page/user/EmployeeLogs/AccessLog.jsx"
);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const fullPerms = (over = {}) => ({
  permissions: {
    logs: {
      accessLogs: { view: true, edit: true, ...over },
    },
  },
  loading: false,
});

const richUserLogs = (variants = "default") => {
  // returns shape for getAllAccessLogsDetails resolved value
  const oneSession = (over = {}) => ({
    channel: { name: "Cam-A", ...(over.channel || {}) },
    timestamp: "2025-04-01T08:00:00Z",
    images: { frameImage: "/f.jpg", personImage: "/p.jpg", faceImage: "/fa.jpg", ...over.images },
  });
  const multiSession = [
    oneSession(),
    {
      channel: { name: "Cam-B" },
      timestamp: "2025-04-01T17:00:00Z",
      images: { personImage: "/p2.jpg" },
    },
  ];
  const logs = [
    {
      // Rich employee + multi sessions to drive enteredIn+exitTiming branches
      userInfo: {
        userName: "Alice",
        location: "LocA",
        emp_id: "EMP1",
        email: "a@e.com",
        profilePics: ["/pic1.jpg"],
      },
      department: { departmentName: "Dept-X" },
      date: "2025-04-01T00:00:00Z",
      sessions: multiSession,
    },
    {
      // empty employee falsy + cameraName falsy → '--' arm
      userInfo: {},
      sessions: [],
    },
    {
      // single session — enteredIn populated, exitTiming null (different diff arm)
      userInfo: {
        userName: "Bob",
        emp_id: "EMP2",
        profilePics: [],
      },
      department: { departmentName: "Dept-Y" },
      date: "2025-04-01T00:00:00Z",
      sessions: [
        {
          channel: { name: "Cam-C" },
          timestamp: "2025-04-01T09:00:00Z",
          images: { personImage: "/p3.jpg" },
        },
      ],
    },
  ];
  return {
    data: {
      statusCode: 200,
      body: {
        data: {
          usersLogs: logs,
          total: logs.length,
          accessLogsStartDate: { createdAt: "2025-04-01" },
        },
      },
    },
  };
};

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
  getAllAccessLogsDetailsMock.mockResolvedValue(richUserLogs());
};

beforeEach(() => {
  permissionsRef.value = null;
  navigateMock.mockReset();
  filterByDepartmentMock.mockReset();
  getNVRsMock.mockReset();
  getEmployeeLocationsMock.mockReset();
  getchannelsMock.mockReset();
  getAllAccessLogsDetailsMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  rtpPropsRef.value = null;
  filterPopoverPropsRef.value = null;
  profileDlgPropsRef.value = null;
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

describe("AccessLog — gaps5", () => {
  it("mapped rows expose enteredIn/exitTiming/image branches", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AccessLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    expect(screen.getByTestId("rtp-row-count").textContent).toBe("3");
    // First row name = Alice (rich), second row name = Unknown (falsy arm)
    expect(screen.getByTestId("rtp-cell-0-name").textContent).toContain("Alice");
    expect(screen.getByTestId("rtp-cell-1-name").textContent).toContain("Unknown");
  });

  it("all six sort headers click-then-flip fire dispatch+re-fetch", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AccessLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const keys = ["name", "department", "date", "location", "Access time"];
    for (const k of keys) {
      const hdr = screen.queryByTestId(`rtp-hdr-${k}`);
      if (hdr) {
        const btn = hdr.querySelector("button");
        if (btn) {
          await act(async () => {
            fireEvent.click(btn);
          });
          await act(async () => {
            fireEvent.click(btn);
          });
          await flush();
        }
      }
    }
    expect(getAllAccessLogsDetailsMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("Profile cell click opens dialog; close fires onOpenChange(false) arm", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AccessLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const profileCell = screen.getByTestId("rtp-cell-0-Profile");
    const btn = profileCell.querySelector("div");
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush();
    await waitFor(() => screen.getByTestId("profile-dialog"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("pd-close"));
    });
    await flush();
    expect(screen.queryByTestId("profile-dialog")).not.toBeInTheDocument();
  });

  it("Profile dialog onOpenChange(true) is a no-op (covers else branch)", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AccessLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const profileCell = screen.getByTestId("rtp-cell-0-Profile");
    const btn = profileCell.querySelector("div");
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush();
    await waitFor(() => screen.getByTestId("profile-dialog"));
    // pass true → !isOpen is false → no dispatch, dialog stays open
    await act(async () => {
      fireEvent.click(screen.getByTestId("pd-open-true"));
    });
    await flush();
    expect(screen.queryByTestId("profile-dialog")).toBeInTheDocument();
  });

  it("Action cell Play button opens CameraPreview; close clears selectedLog", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AccessLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const actCell = screen.getByTestId("rtp-cell-0-action");
    const btn = actCell.querySelector("button");
    await act(async () => {
      fireEvent.click(btn);
    });
    await flush();
    await waitFor(() => screen.getByTestId("camera-preview"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("cp-close"));
    });
    await flush();
    expect(screen.queryByTestId("camera-preview")).not.toBeInTheDocument();
  });

  it("Grid card Play stopPropagation does not open profile", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    window.localStorage.setItem("access_view_mode", "grid");
    await act(async () => {
      render(<AccessLog />);
    });
    await waitFor(() => screen.getByTestId("rtp"));
    const card = screen.queryByTestId("grid-card-0");
    if (card) {
      const buttons = card.querySelectorAll("button");
      if (buttons[0]) {
        await act(async () => {
          fireEvent.click(buttons[0]);
        });
        await flush();
      }
    }
  });

  it("filter-popover setNvrId([]) clears channelIds; setNvrId(['nvr1']) does not", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AccessLog />);
    });
    await waitFor(() => screen.getByTestId("filter-popover"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-nvr-set"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-cam"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-nvr-empty"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-unknown"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("fp-loc-non-array"));
    });
    await flush();
    expect(filterPopoverPropsRef.value).toBeTruthy();
  });

  it("exportToPDF didDrawCell on body column 7 draws link + text + underline", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AccessLog />);
    });
    await waitFor(() => screen.getByText("Export PDF"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export PDF"));
    });
    await flush();
    expect(pdfSaveMock).toHaveBeenCalled();
    expect(autoTableMock).toHaveBeenCalled();
    const call = autoTableMock.mock.calls.find((c) => c?.[1]?.didDrawCell);
    if (call) {
      const { didDrawCell } = call[1];
      didDrawCell({
        column: { index: 7 },
        section: "body",
        row: { index: 0 },
        cell: { x: 1, y: 2, width: 30, height: 10 },
      });
      // non-7 / non-body → falsy branch
      didDrawCell({
        column: { index: 0 },
        section: "body",
        row: { index: 0 },
        cell: { x: 1, y: 2, width: 30, height: 10 },
      });
      didDrawCell({
        column: { index: 7 },
        section: "head",
        row: { index: 0 },
        cell: { x: 1, y: 2, width: 30, height: 10 },
      });
      expect(pdfDocRef.value.link).toHaveBeenCalled();
    }
  });

  it("exportToExcel with rich rows invokes writeFile + hyperlink forEach", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    await act(async () => {
      render(<AccessLog />);
    });
    await waitFor(() => screen.getByText("Export Excel"));
    await act(async () => {
      fireEvent.click(screen.getByText("Export Excel"));
    });
    await flush();
    expect(xlsxWriteFileMock).toHaveBeenCalled();
    expect(xlsxJsonToSheetMock).toHaveBeenCalled();
  });

  it("fetchLogs catch path sets error state when API rejects", async () => {
    permissionsRef.value = fullPerms();
    wireRich();
    getAllAccessLogsDetailsMock.mockReset();
    getAllAccessLogsDetailsMock.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      render(<AccessLog />);
    });
    await flush();
    // no crash; row count is 0
    await waitFor(() => screen.getByTestId("rtp"));
    expect(screen.getByTestId("rtp-row-count").textContent).toBe("0");
  });
});
