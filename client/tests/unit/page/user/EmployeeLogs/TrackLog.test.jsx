/**
 * Round 89: cover EmployeeLogs/TrackLog.jsx — the two-tab Users/Vehicles
 * tracking page. The component:
 *   - Defaults activeTab to "user" and fires getTrackUsers(search) on mount,
 *     auto-selects users[0] when present.
 *   - Switches the list fetch to getVehicleList(search) when activeTab
 *     flips to "vehicle".
 *   - On selectedItem._id present, fires getTrackLogs(_id, startDate) for
 *     the user tab or getVehicleLogs(_id, startDate) for the vehicle tab,
 *     reads response.data.body.data.entries[0].events, and runs each event
 *     through convertToTrackFormat (which builds {step, title, timestamp,
 *     images, cameraId, location} rows). title === "Check-In Detected"
 *     when channel.checkType === "checkin" else "Activity Detected".
 *   - handleTabChange resets selectedItem / trackData / activeFeed /
 *     search / dropdownOpen.
 *   - The main view shows the active feed image (user tab falls through
 *     face -> person -> frame; vehicle tab uses the vehicle image) and
 *     an Event Details card with title / camera / location / timestamp.
 *   - Empty trackData -> "No Activity Detected" placeholder + no
 *     thumbnail strip.
 *   - The dropdown opens/closes via setDropdownOpen toggle; mousedown
 *     outside the dropdown wrapper closes it.
 *
 * Mocks (1 — well under 8):
 *   1. ./Api/get — getTrackUsers / getTrackLogs / getVehicleList /
 *                  getVehicleLogs are vi.fn() the spec drives manually.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";

const getTrackUsersMock = vi.hoisted(() => vi.fn());
const getTrackLogsMock = vi.hoisted(() => vi.fn());
const getVehicleListMock = vi.hoisted(() => vi.fn());
const getVehicleLogsMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../../src/page/user/EmployeeLogs/Api/get", () => ({
  getTrackUsers: getTrackUsersMock,
  getTrackLogs: getTrackLogsMock,
  getVehicleList: getVehicleListMock,
  getVehicleLogs: getVehicleLogsMock,
}));

const { default: TrackLog } = await import(
  "../../../../../src/page/user/EmployeeLogs/TrackLog.jsx"
);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const emptyUsers = { data: { body: { data: { users: [] } } } };
const emptyVehicles = { data: { body: { data: { vehicles: [] } } } };
const emptyLogs = { data: { body: { data: { entries: [] } } } };

beforeEach(() => {
  getTrackUsersMock.mockReset();
  getTrackLogsMock.mockReset();
  getVehicleListMock.mockReset();
  getVehicleLogsMock.mockReset();
});

describe("TrackLog", () => {
  it("mounts on Users tab, fires getTrackUsers with empty search, and shows the Users tab as active", async () => {
    getTrackUsersMock.mockResolvedValueOnce(emptyUsers);
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    expect(getTrackUsersMock).toHaveBeenCalledTimes(1);
    expect(getTrackUsersMock).toHaveBeenCalledWith("");
    expect(getVehicleListMock).not.toHaveBeenCalled();
    // Users tab button is active (gets the active class)
    const usersBtn = screen.getByText(/Users/);
    expect(usersBtn.className).toMatch(/bg-white/);
  });

  it("with no users fetched, dropdown trigger shows 'Loading...' and no fetch logs fires", async () => {
    getTrackUsersMock.mockResolvedValueOnce(emptyUsers);
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(getTrackLogsMock).not.toHaveBeenCalled();
  });

  it("auto-selects users[0] when fetched, and fires getTrackLogs(id, startDate)", async () => {
    getTrackUsersMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            users: [
              { _id: "u1", firstName: "Eleanor", lastName: "Pena" },
              { _id: "u2", firstName: "Bob", lastName: "Lee" },
            ],
          },
        },
      },
    });
    getTrackLogsMock.mockResolvedValueOnce(emptyLogs);
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    expect(getTrackLogsMock).toHaveBeenCalledTimes(1);
    expect(getTrackLogsMock).toHaveBeenCalledWith(
      "u1",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    );
    // Trigger shows the selected user's name.
    expect(screen.getByText(/Eleanor Pena/)).toBeInTheDocument();
  });

  it("formats events into track rows with timestamp + title + camera + location + face image src", async () => {
    getTrackUsersMock.mockResolvedValueOnce({
      data: { body: { data: { users: [{ _id: "u1", firstName: "A", lastName: "B" }] } } },
    });
    getTrackLogsMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            entries: [
              {
                events: [
                  {
                    _id: "e1",
                    timestamp: "2025-01-02T10:30:45Z",
                    channel: {
                      checkType: "checkin",
                      customName: "Front Door",
                      name: "Cam-1",
                    },
                    nvr: { location: "Lobby" },
                    images: {
                      face: "/f.jpg",
                      person: "/p.jpg",
                      frame: "/fr.jpg",
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    });
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    // Active feed image rendered.
    const img = screen.getByAltText("Live");
    expect(img.getAttribute("src")).toContain("/f.jpg");
    // Event Details card content.
    expect(screen.getByText("Check-In Detected")).toBeInTheDocument();
    expect(screen.getByText("Front Door")).toBeInTheDocument();
    expect(screen.getByText("Lobby")).toBeInTheDocument();
    expect(screen.getByText(/2025-01-02 10:30:45/)).toBeInTheDocument();
  });

  it("non-checkin events show 'Activity Detected' title", async () => {
    getTrackUsersMock.mockResolvedValueOnce({
      data: { body: { data: { users: [{ _id: "u1", firstName: "A", lastName: "B" }] } } },
    });
    getTrackLogsMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            entries: [
              {
                events: [
                  {
                    _id: "e1",
                    timestamp: "2025-01-02T10:30:45Z",
                    channel: { name: "Cam-1" },
                    nvr: { location: "Lobby" },
                    images: { face: "/f.jpg" },
                  },
                ],
              },
            ],
          },
        },
      },
    });
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    expect(screen.getByText("Activity Detected")).toBeInTheDocument();
    // Fallback camera label when no customName.
    expect(screen.getByText("Cam-1")).toBeInTheDocument();
  });

  it("shows 'No Activity Detected' when entries is empty and no thumbnail strip renders", async () => {
    getTrackUsersMock.mockResolvedValueOnce({
      data: { body: { data: { users: [{ _id: "u1", firstName: "A", lastName: "B" }] } } },
    });
    getTrackLogsMock.mockResolvedValueOnce(emptyLogs);
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    expect(screen.getByText("No Activity Detected")).toBeInTheDocument();
    expect(screen.queryByAltText("Live")).toBeNull();
  });

  it("switching to Vehicles tab fires getVehicleList, clears selection, and resets to vehicle copy", async () => {
    getTrackUsersMock.mockResolvedValueOnce(emptyUsers);
    getVehicleListMock.mockResolvedValueOnce({
      data: {
        body: {
          data: { vehicles: [{ _id: "v1", vehicleNumber: "KA-01-XYZ" }] },
        },
      },
    });
    getVehicleLogsMock.mockResolvedValueOnce(emptyLogs);
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Vehicles/));
    });
    await flush();
    expect(getVehicleListMock).toHaveBeenCalledTimes(1);
    expect(getVehicleListMock).toHaveBeenCalledWith("");
    // After fetch, auto-selected vehicleNumber appears in the trigger.
    expect(screen.getByText("KA-01-XYZ")).toBeInTheDocument();
    expect(screen.getByText(/Select Vehicle/)).toBeInTheDocument();
  });

  it("vehicle row uses vehicle image source and 'Unnamed' label fallback when vehicleNumber missing", async () => {
    getTrackUsersMock.mockResolvedValueOnce(emptyUsers);
    getVehicleListMock.mockResolvedValueOnce({
      data: { body: { data: { vehicles: [{ _id: "v1" }] } } },
    });
    getVehicleLogsMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            entries: [
              {
                events: [
                  {
                    _id: "ev1",
                    timestamp: "2025-01-02T10:30:45Z",
                    channel: { name: "Cam-Veh" },
                    nvr: { location: "Gate" },
                    images: { vehicle: "/v.jpg" },
                  },
                ],
              },
            ],
          },
        },
      },
    });
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Vehicles/));
    });
    await flush();
    expect(screen.getAllByText("Unnamed").length).toBeGreaterThan(0);
    const img = screen.getByAltText("Live");
    expect(img.getAttribute("src")).toContain("/v.jpg");
  });

  it("vehicle list payload as bare data.body.data array is still accepted", async () => {
    getTrackUsersMock.mockResolvedValueOnce(emptyUsers);
    // body.data is the array itself (no vehicles wrapper).
    getVehicleListMock.mockResolvedValueOnce({
      data: { body: { data: [{ _id: "v1", vehicleNumber: "KA-99-AAA" }] } },
    });
    getVehicleLogsMock.mockResolvedValueOnce(emptyLogs);
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText(/Vehicles/));
    });
    await flush();
    expect(screen.getByText("KA-99-AAA")).toBeInTheDocument();
  });

  it("dropdown toggle: click trigger opens, click on a list item selects + closes", async () => {
    getTrackUsersMock.mockResolvedValue({
      data: {
        body: {
          data: {
            users: [
              { _id: "u1", firstName: "Alice", lastName: "One" },
              { _id: "u2", firstName: "Bob", lastName: "Two" },
            ],
          },
        },
      },
    });
    getTrackLogsMock.mockResolvedValue(emptyLogs);
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    // u1 auto-selected -> trigger label is "Alice One"
    expect(screen.getByText("Alice One")).toBeInTheDocument();
    // Click trigger to open
    await act(async () => {
      fireEvent.click(screen.getByText("Alice One"));
    });
    // Search input appears once open.
    const searchInput = document.querySelector('input[placeholder="Search..."]');
    expect(searchInput).not.toBeNull();
    // Click u2 from list (use getAllByText[0] since u1 is also visible).
    await act(async () => {
      fireEvent.click(screen.getByText("Bob Two"));
    });
    await flush();
    // Dropdown closes -> search input gone.
    expect(
      document.querySelector('input[placeholder="Search..."]')
    ).toBeNull();
    // u2 logs fired
    expect(getTrackLogsMock).toHaveBeenCalledWith(
      "u2",
      expect.any(String)
    );
  });

  it("typing in the dropdown search input re-fires the list fetch with the new search string", async () => {
    getTrackUsersMock.mockResolvedValue({
      data: { body: { data: { users: [{ _id: "u1", firstName: "A", lastName: "B" }] } } },
    });
    getTrackLogsMock.mockResolvedValue(emptyLogs);
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByText("A B"));
    });
    const searchInput = document.querySelector('input[placeholder="Search..."]');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "ali" } });
    });
    await flush();
    const last =
      getTrackUsersMock.mock.calls[getTrackUsersMock.mock.calls.length - 1];
    expect(last[0]).toBe("ali");
  });

  it("date input change refetches logs with new startDate", async () => {
    getTrackUsersMock.mockResolvedValue({
      data: { body: { data: { users: [{ _id: "u1", firstName: "A", lastName: "B" }] } } },
    });
    getTrackLogsMock.mockResolvedValue(emptyLogs);
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(1);
    await act(async () => {
      fireEvent.change(dateInputs[0], { target: { value: "2025-03-15" } });
    });
    await flush();
    const last =
      getTrackLogsMock.mock.calls[getTrackLogsMock.mock.calls.length - 1];
    expect(last[1]).toBe("2025-03-15");
  });

  it("getTrackUsers rejection logs error and renders Loading placeholder (no crash)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getTrackUsersMock.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("getTrackLogs rejection sets trackData=[]/activeFeed=null without crashing", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getTrackUsersMock.mockResolvedValueOnce({
      data: { body: { data: { users: [{ _id: "u1", firstName: "A", lastName: "B" }] } } },
    });
    getTrackLogsMock.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    expect(screen.getByText("No Activity Detected")).toBeInTheDocument();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("thumbnail click on a face thumb updates activeFeed and selectedImageType", async () => {
    getTrackUsersMock.mockResolvedValueOnce({
      data: { body: { data: { users: [{ _id: "u1", firstName: "A", lastName: "B" }] } } },
    });
    getTrackLogsMock.mockResolvedValueOnce({
      data: {
        body: {
          data: {
            entries: [
              {
                events: [
                  {
                    _id: "e1",
                    timestamp: "2025-01-02T10:30:45Z",
                    channel: { name: "Cam-1" },
                    nvr: { location: "Lobby" },
                    images: {
                      face: "/f1.jpg",
                      person: "/p1.jpg",
                      frame: "/fr1.jpg",
                    },
                  },
                  {
                    _id: "e2",
                    timestamp: "2025-01-02T11:30:45Z",
                    channel: { name: "Cam-2" },
                    nvr: { location: "Lobby" },
                    images: {
                      face: "/f2.jpg",
                      person: "/p2.jpg",
                      frame: "/fr2.jpg",
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    });
    await act(async () => {
      render(<TrackLog />);
    });
    await flush();
    // Click on e2's person thumb. Find the second event's person image.
    const personImgs = Array.from(document.querySelectorAll("img")).filter(
      (i) => i.getAttribute("src") === "/p2.jpg"
    );
    expect(personImgs.length).toBe(1);
    await act(async () => {
      fireEvent.click(personImgs[0].parentElement);
    });
    // Live feed src should now be e2's person image.
    const live = screen.getByAltText("Live");
    expect(live.getAttribute("src")).toContain("/p2.jpg");
    // Camera card now shows Cam-2.
    expect(screen.getByText("Cam-2")).toBeInTheDocument();
  });
});
