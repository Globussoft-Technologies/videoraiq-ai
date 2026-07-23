import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, User, Car, Loader2 } from 'lucide-react';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import { getTrackLogs, getTrackUsers, getVehicleList, getVehicleLogs } from './Api';

const TrackLog = () => {
  const navigate = useNavigate();
  const { permissions, loading: permissionsLoading } = usePermissions();

  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.trackLogs?.[action] === 'boolean') return logs.trackLogs[action];
    if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
    if (typeof logs[action] === 'boolean') return logs[action];
    return false;
  };
  const canView = resolveLogPerm('view');

  const [activeTab, setActiveTab] = useState('user');
  const [listData, setListData] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [trackData, setTrackData] = useState([]);
  const [activeFeed, setActiveFeed] = useState(null);
  const [selectedImageType, setSelectedImageType] = useState('face');
  const [listLoading, setListLoading] = useState(false);

  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const convertToTrackFormat = (data, mediaBaseUrl = '') => {
    if (!Array.isArray(data)) return [];
    return data.map((item, index) => ({
      _id: item._id,
      step: index + 1,
      title: item?.channel?.checkType === 'checkin' ? 'Check-In Detected' : 'Activity Detected',
      timestamp: new Date(item.timestamp).toISOString().replace('T', ' ').substring(0, 19),
      images:
        activeTab === 'user'
          ? {
              face: item?.images?.face ? mediaBaseUrl + item.images.face : null,
              person: item?.images?.person ? mediaBaseUrl + item.images.person : null,
              frame: item?.images?.frame ? mediaBaseUrl + item.images.frame : null,
            }
          : { vehicle: item?.images?.vehicle ? mediaBaseUrl + item.images.vehicle : null },
      cameraId: item?.channel?.customName || item?.channel?.name || 'Unknown Camera',
      location: item?.nvr?.location || 'Unknown Location',
    }));
  };

  useEffect(() => {
    if (!canView) return;
    const fetchList = async () => {
      setListLoading(true);
      try {
        let response;
        if (activeTab === 'user') {
          response = await getTrackUsers(search);
          const users = response?.data?.body?.data?.users || [];
          setListData(users);
          if (users.length > 0) setSelectedItem(users[0]);
        } else {
          response = await getVehicleList(search);
          const vehicles = response?.data?.body?.data?.vehicles || response?.data?.body?.data || [];
          setListData(Array.isArray(vehicles) ? vehicles : []);
          if (vehicles.length > 0) setSelectedItem(vehicles[0]);
        }
      } catch (error) {
        console.error('Error fetching list:', error);
      } finally {
        setListLoading(false);
      }
    };

    fetchList();
  }, [activeTab, search, canView]);

  useEffect(() => {
    if (!selectedItem?._id) return;

    const fetchLogs = async () => {
      try {
        const response =
          activeTab === 'user'
            ? await getTrackLogs(selectedItem._id, startDate)
            : await getVehicleLogs(selectedItem._id, startDate);

        const logs = response?.data?.body?.data?.entries?.[0]?.events || [];
        const formattedLogs = convertToTrackFormat(logs, import.meta.env.VITE_INCIDENT_URL);

        setTrackData(formattedLogs);
        setActiveFeed(formattedLogs[0] || null);
        setSelectedImageType('face');
      } catch (error) {
        console.error('Error fetching logs:', error);
        setTrackData([]);
        setActiveFeed(null);
      }
    };

    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem, startDate, activeTab]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedItem(null);
    setTrackData([]);
    setActiveFeed(null);
    setSearch('');
    setDropdownOpen(false);
  };

  if (permissionsLoading) return null;
  if (!canView) {
    return (
      <AccessDenied
        message="You don't have permission to view Track Logs."
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      <div className="w-full flex flex-1 flex-col bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] p-4 sm:p-5 space-y-4">
        {/* Tabs */}
        <div className="flex justify-center">
          <div className="bg-[var(--bg2)] p-1 rounded-full flex w-fit border border-[var(--bd)]">
            <button
              onClick={() => handleTabChange('user')}
              className={`flex items-center gap-1.5 px-6 py-2 text-sm font-medium rounded-full transition cursor-pointer ${
                activeTab === 'user'
                  ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white shadow-sm'
                  : 'text-[var(--tx2)]'
              }`}
            >
              <User className="w-4 h-4" />
              Users
            </button>
            <button
              onClick={() => handleTabChange('vehicle')}
              className={`flex items-center gap-1.5 px-6 py-2 text-sm font-medium rounded-full transition cursor-pointer ${
                activeTab === 'vehicle'
                  ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white shadow-sm'
                  : 'text-[var(--tx2)]'
              }`}
            >
              <Car className="w-4 h-4" />
              Vehicles
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[var(--bg2)] border border-[var(--bd)] p-3 rounded-lg flex flex-col md:flex-row gap-3">
          <div className="relative w-full md:w-60" ref={dropdownRef}>
            <label className="text-xs text-[var(--tx3)] block mb-1">
              {activeTab === 'user' ? 'Select User' : 'Select Vehicle'}
            </label>
            <div
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full h-10 px-3 rounded-md bg-[var(--bg1solid)] border border-[var(--bd)] text-xs cursor-pointer flex justify-between items-center text-[var(--tx)]"
            >
              <span className="truncate">
                {listLoading
                  ? 'Loading...'
                  : selectedItem
                    ? activeTab === 'user'
                      ? `${selectedItem.firstName} ${selectedItem.lastName}`
                      : selectedItem?.vehicleNumber || 'Unnamed'
                    : 'No results'}
              </span>
              <ChevronDown className={`w-4 h-4 text-[var(--tx3)] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {dropdownOpen && (
              <div className="absolute left-0 mt-1 w-full bg-[var(--bg1solid)] border border-[var(--bd)] rounded-md shadow-lg z-50">
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[var(--bg2)] text-xs border-b border-[var(--bd)] outline-none text-[var(--tx)]"
                />
                <div className="max-h-40 overflow-y-auto customscrollbar">
                  {listData.map((item) => (
                    <div
                      key={item._id}
                      onClick={() => {
                        setSelectedItem(item);
                        setDropdownOpen(false);
                      }}
                      className="px-3 py-1.5 cursor-pointer text-xs text-[var(--tx)] hover:bg-[var(--bg2)]"
                    >
                      {activeTab === 'user' ? `${item.firstName} ${item.lastName}` : item?.vehicleNumber || 'Unnamed'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-full md:w-44">
            <label className="text-xs text-[var(--tx3)] block mb-1">Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-10 px-3 rounded-md bg-[var(--bg1solid)] border border-[var(--bd)] text-xs text-[var(--tx)]"
            />
          </div>
        </div>

        {/* Main view */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-black rounded-xl overflow-hidden shadow-lg relative">
            {activeFeed ? (
              <img
                src={
                  activeTab === 'user'
                    ? activeFeed.images[selectedImageType] ||
                      activeFeed.images.face ||
                      activeFeed.images.person ||
                      activeFeed.images.frame
                    : activeFeed.images.vehicle
                }
                alt="Live"
                className="w-full h-[350px] sm:h-[450px] object-contain"
              />
            ) : (
              <div className="flex items-center justify-center h-[350px] text-[var(--tx3)]">
                No Activity Detected
              </div>
            )}
          </div>

          {activeFeed && (
            <div className="bg-[var(--bg1)] rounded-xl shadow-lg border border-[var(--bd)] p-5 h-fit">
              <h3 className="text-base font-semibold text-[var(--tx)] mb-4">Event Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-[var(--bd)] pb-2">
                  <span className="text-[var(--tx3)]">Title</span>
                  <span className="font-medium text-[var(--tx)] text-right">{activeFeed.title}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--bd)] pb-2">
                  <span className="text-[var(--tx3)]">Camera</span>
                  <span className="font-medium text-[var(--tx)] text-right">{activeFeed.cameraId}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--bd)] pb-2">
                  <span className="text-[var(--tx3)]">Location</span>
                  <span className="font-medium text-[var(--tx)] text-right">{activeFeed.location}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--tx3)]">Timestamp</span>
                  <span className="font-medium text-[var(--tx)] text-right">{activeFeed.timestamp}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Thumbnails */}
        {trackData.length > 0 && (
          <div className="flex gap-4 overflow-x-auto pb-2 customscrollbar">
            {trackData.map((item) => (
              <div key={item._id} className="w-40 flex-shrink-0">
                {activeTab === 'user' ? (
                  <div className="flex h-24 border border-[var(--bd)] rounded-lg overflow-hidden">
                    {['face', 'person', 'frame'].map(
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
                            <img src={item.images[type]} alt={type} className="w-full h-full object-cover object-top" />
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
                    className="cursor-pointer border border-[var(--bd)] rounded-lg overflow-hidden"
                  >
                    <img src={item.images.vehicle} alt="vehicle" className="w-full h-24 object-cover object-top" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {listLoading && trackData.length === 0 && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-8 h-8 text-[var(--brand)] animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackLog;
