import React, { useState, useEffect, useRef } from "react";
import {
  getTrackLogs,
  getTrackUsers,
  getVehicleList,
  getVehicleLogs
} from "./Api/get";

const TrackLog = () => {
  const [activeTab, setActiveTab] = useState("user");

  const [listData, setListData] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);

  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  const [trackData, setTrackData] = useState([]);
  const [activeFeed, setActiveFeed] = useState(null);
  const [selectedImageType, setSelectedImageType] = useState("face");

  const dropdownRef = useRef(null);

  /* ================= CLICK OUTSIDE ================= */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ================= HELPER ================= */
  const convertToTrackFormat = (data, mediaBaseUrl = "") => {
    if (!Array.isArray(data)) return [];

    return data.map((item, index) => ({
      _id: item._id,
      step: index + 1,
      title:
        item?.channel?.checkType === "checkin"
          ? "Check-In Detected"
          : "Activity Detected",
      timestamp: new Date(item.timestamp)
        .toISOString()
        .replace("T", " ")
        .substring(0, 19),

      images:
        activeTab === "user"
          ? {
              face: item?.images?.face
                ? mediaBaseUrl + item.images.face
                : null,
              person: item?.images?.person
                ? mediaBaseUrl + item.images.person
                : null,
              frame: item?.images?.frame
                ? mediaBaseUrl + item.images.frame
                : null
            }
          : {
              vehicle: item?.images?.vehicle
                ? mediaBaseUrl + item.images.vehicle
                : null
            },

      cameraId:
        item?.channel?.customName ||
        item?.channel?.name ||
        "Unknown Camera",

      location: item?.nvr?.location || "Unknown Location"
    }));
  };

  /* ================= FETCH LIST ================= */
  useEffect(() => {
    const fetchList = async () => {
      try {
        let response;

        if (activeTab === "user") {
          response = await getTrackUsers(search);
          const users = response?.data?.body?.data?.users || [];
          setListData(users);
          if (users.length > 0) setSelectedItem(users[0]);
        } else {
          response = await getVehicleList(search);
          const vehicles =
            response?.data?.body?.data?.vehicles ||
            response?.data?.body?.data ||
            [];
          setListData(Array.isArray(vehicles) ? vehicles : []);
          if (vehicles.length > 0) setSelectedItem(vehicles[0]);
        }
      } catch (error) {
        console.error("Error fetching list:", error);
      }
    };

    fetchList();
  }, [activeTab, search]);

  /* ================= FETCH LOGS ================= */
  useEffect(() => {
    if (!selectedItem?._id) return;

    const fetchLogs = async () => {
      try {
        let response;

        if (activeTab === "user") {
          response = await getTrackLogs(selectedItem._id, startDate);
        } else {
          response = await getVehicleLogs(selectedItem._id, startDate);
        }

        const logs =
          response?.data?.body?.data?.entries?.[0]?.events || [];

        const formattedLogs = convertToTrackFormat(
          logs,
          import.meta.env.VITE_INCIDENT_URL
        );

        setTrackData(formattedLogs);
        setActiveFeed(formattedLogs[0] || null);
        setSelectedImageType("face");
      } catch (error) {
        console.error("Error fetching logs:", error);
        setTrackData([]);
        setActiveFeed(null);
      }
    };

    fetchLogs();
  }, [selectedItem, startDate, activeTab]);

  /* ================= TAB RESET ================= */
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedItem(null);
    setTrackData([]);
    setActiveFeed(null);
    setSearch("");
    setDropdownOpen(false);
  };

  return (
    <div className="bg-white min-h-screen text-gray-900 p-4 sm:p-6">

      {/* ================= TABS ================= */}
      <div className="mb-6 flex justify-center">
        <div className="bg-gray-100 p-1 rounded-full flex w-fit">
          <button
            onClick={() => handleTabChange("user")}
            className={`px-6 py-2 text-sm font-medium rounded-full transition ${
              activeTab === "user"
                ? "bg-white shadow text-blue-600"
                : "text-gray-600"
            }`}
          >
            👤 Users
          </button>

          <button
            onClick={() => handleTabChange("vehicle")}
            className={`px-6 py-2 text-sm font-medium rounded-full transition ${
              activeTab === "vehicle"
                ? "bg-white shadow text-blue-600"
                : "text-gray-600"
            }`}
          >
            🚗 Vehicles
          </button>
        </div>
      </div>

      {/* ================= FILTERS ================= */}
      <div className="bg-gray-50 p-3 rounded-lg mb-4 flex flex-col md:flex-row gap-3">

        <div className="relative w-full md:w-52" ref={dropdownRef}>
          <label className="text-xs text-gray-600 block mb-1">
            {activeTab === "user" ? "Select User" : "Select Vehicle"}
          </label>

          <div
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full px-3 py-1.5 rounded-md bg-white text-xs cursor-pointer flex justify-between items-center border"
          >
            <span className="truncate">
              {selectedItem
                ? activeTab === "user"
                  ? `${selectedItem.firstName} ${selectedItem.lastName}`
                  : selectedItem?.vehicleNumber || "Unnamed"
                : "Loading..."}
            </span>
            <span>▾</span>
          </div>

          {dropdownOpen && (
            <div className="absolute left-0 mt-1 w-full bg-white border rounded-md shadow-md z-50">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-50 text-xs border-b outline-none"
              />

              <div className="max-h-40 overflow-y-auto">
                {listData.map((item) => (
                  <div
                    key={item._id}
                    onClick={() => {
                      setSelectedItem(item);
                      setDropdownOpen(false);
                    }}
                    className="px-3 py-1.5 cursor-pointer text-xs hover:bg-gray-100"
                  >
                    {activeTab === "user"
                      ? `${item.firstName} ${item.lastName}`
                      : item?.vehicleNumber || "Unnamed"}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-full md:w-40">
          <label className="text-xs text-gray-600 block mb-1">
            Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-1.5 rounded-md bg-white text-xs border"
          />
        </div>
      </div>

      {/* ================= MAIN VIEW ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 bg-black rounded-xl overflow-hidden shadow-lg relative">
          {activeFeed ? (
            <>
              <img
                src={
                  activeTab === "user"
                    ? activeFeed.images[selectedImageType] ||
                      activeFeed.images.face ||
                      activeFeed.images.person ||
                      activeFeed.images.frame
                    : activeFeed.images.vehicle
                }
                alt="Live"
                className="w-full h-[350px] sm:h-[450px] object-contain"
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-gray-400">
              No Activity Detected
            </div>
          )}
        </div>

       {activeFeed && (
  <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-5 h-fit">

    <h3 className="text-base font-semibold text-gray-800 mb-4">
      📋 Event Details
    </h3>

    <div className="space-y-3 text-sm">

      <div className="flex justify-between border-b pb-2">
        <span className="text-gray-500">Title</span>
        <span className="font-medium text-gray-800 text-right">
          {activeFeed.title}
        </span>
      </div>

      <div className="flex justify-between border-b pb-2">
        <span className="text-gray-500">Camera</span>
        <span className="font-medium text-gray-800 text-right">
          {activeFeed.cameraId}
        </span>
      </div>

      <div className="flex justify-between border-b pb-2">
        <span className="text-gray-500">Location</span>
        <span className="font-medium text-gray-800 text-right">
          {activeFeed.location}
        </span>
      </div>

      <div className="flex justify-between">
        <span className="text-gray-500">Timestamp</span>
        <span className="font-medium text-gray-800 text-right">
          {activeFeed.timestamp}
        </span>
      </div>

    </div>
  </div>
)}
      </div>

      {/* ================= THUMBNAILS ================= */}
      {trackData.length > 0 && (
        <div className="mt-8 flex gap-4 overflow-x-auto pb-2">
          {trackData.map((item) => (
            <div key={item._id} className="w-40 flex-shrink-0">

              {activeTab === "user" ? (
                <div className="flex h-24 border rounded-lg overflow-hidden">
                  {["face", "person", "frame"].map(
                    (type) =>
                      item.images?.[type] && (
                        <div
                          key={type}
                          onClick={() => {
                            setActiveFeed(item);
                            setSelectedImageType(type);
                          }}
                          className="relative flex-1 cursor-pointer group"
                        >
                          <img
                            src={item.images[type]}
                            alt={type}
                            className="w-full h-full object-cover object-top"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] transition">
                            {type.toUpperCase()}
                          </div>
                        </div>
                      )
                  )}
                </div>
              ) : (
                <div
                  onClick={() => setActiveFeed(item)}
                  className="cursor-pointer border rounded-lg overflow-hidden"
                >
                  <img
                    src={item.images.vehicle}
                    alt="vehicle"
                    className="w-full h-24 object-cover object-top"
                  />
                </div>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrackLog;