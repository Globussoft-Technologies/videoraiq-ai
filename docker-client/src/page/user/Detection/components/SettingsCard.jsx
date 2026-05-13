import React, { useState, useRef, useEffect } from 'react';
import { InnerSettingsProvider, useInnerSettings } from './InnerSettingsContext';
import AppliedProfile from './AppliedProfile';
import BasicSettings from './BasicSettings';
import NotificationSettings from './NotificationSettings';
import EvidenceSeverity from './EvidenceSeverity';
import DefaultDetectionSettings from './DefaultDetectionSettings';
import { getVerifiedRecipients } from '../Api/get';
import { updateCameraSettingById } from '../../Streams/Api/pacth';
import { toast } from 'sonner';

const SettingsCard = () => {
  const { selectedDays, appliedProfileData, channelData, fetchAppliedProfile } = useInnerSettings();

  const getAlertIds = (alerts = []) =>
    alerts.map((a) => (typeof a === "string" ? a : a._id));

  useEffect(() => {
    if (appliedProfileData?.alerts?.length) {
      setSelectedRecipients(getAlertIds(appliedProfileData.alerts));
    } else if (channelData?.alerts?.length) {
      setSelectedRecipients(getAlertIds(channelData.alerts));
    }
  }, [appliedProfileData, channelData]);


  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(false);
  const [recipientsList, setRecipientsList] = useState([]);
  // Fetch recipients from API
  useEffect(() => {
    const fetchRecipients = async () => {
      try {
        const response = await getVerifiedRecipients(0, 1000);
        if (response?.data?.body?.status === 'success') {
          const fetchedRecipients = response?.data?.body?.data?.alerts || [];
          setRecipientsList(
            fetchedRecipients.map((r) => ({
              label: r.fullName,
              value: r._id,
            }))
          );
        }
      } catch (err) {
        console.error('Failed to fetch recipients', err);
      }
    };
    fetchRecipients();
  }, []);

  // Pre-populate recipients from channelData.alerts
  useEffect(() => {
    if (channelData?.alerts) {
      const initialAlerts = channelData.alerts.map((a) => (typeof a === 'string' ? a : a._id));
      setSelectedRecipients(initialAlerts);
    }
  }, [channelData]);

  const dropdownRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedLabels = recipientsList
    .filter((r) => selectedRecipients.includes(r.value))
    .map((r) => r.label);

  const toggleRecipient = async (value) => {
    const isSelected = selectedRecipients.includes(value);
    const updatedRecipients = isSelected
      ? selectedRecipients.filter((item) => item !== value)
      : [...selectedRecipients, value];

    setSelectedRecipients(updatedRecipients);


    try {
      if (channelData?.linkedCameras[0]._id) {
        const payload = { alerts: updatedRecipients };
        const res = await updateCameraSettingById(channelData.linkedCameras[0]._id, payload);
        if (res?.data?.statusCode === 200 || res?.status === 200 || res?.data?.body?.status === 'success') {
          toast.success(res?.data?.body?.message || 'Recipients updated successfully');
          if (fetchAppliedProfile) fetchAppliedProfile(channelData.linkedCameras[0]._id);
        } else {
          toast.error('Failed to update recipients');
        }
      }
    } catch (error) {
      console.error('Error updating camera recipients', error);
      toast.error('Error updating camera recipients');
    }
  };

  return (
    <>
      {import.meta.env.VITE_DESK_CLIENT === 'true' ? (
        // 👇 Show dropdown when desk client
        <div className="bg-white border border-[#E6E6E6] rounded-[12px] p-4 md:p-3 2xl:p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Recipients
          </label>

          <div ref={dropdownRef} className="relative">
            {/* Selected Recipients Display */}
            <div
              onClick={() => setOpenDropdown(!openDropdown)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center min-h-[40px]"
            >
              {selectedRecipients.length === 0 ? (
                <span className="text-gray-400">Select Recipients</span>
              ) : (
                <span className="text-gray-700">
                  {selectedLabels.slice(0, 2).join(", ")}
                  {selectedLabels.length > 2 && ` +${selectedLabels.length - 2}`}
                </span>
              )}
            </div>

            {/* Dropdown */}
            {openDropdown && (
              <div className="absolute mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-md max-h-48 overflow-y-auto z-50">
                {recipientsList.length === 0 ? (
                  <div className="px-3 py-2 text-gray-500 text-sm">No recipients available</div>
                ) : (
                  recipientsList.map((item) => (
                    <label
                      key={item.value}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRecipients.includes(item.value)}
                        onChange={() => toggleRecipient(item.value)}
                        className="cursor-pointer"
                      />
                      <span className="text-sm">{item.label}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#E6E6E6] rounded-[12px] p-4 md:p-3 2xl:p-4">
          <AppliedProfileWrapper />

          {appliedProfileData?.profile === undefined ? null : (
            <>
              <hr className="my-6 border-[#E6E6E6]" />
              <BasicSettings />

              <hr className="my-6 border-[#E6E6E6]" />
              <NotificationSettings />

              <hr className="my-6 border-[#E6E6E6]" />
              <EvidenceSeverity />

              <hr className="my-6 border-[#E6E6E6]" />
              <DefaultDetectionSettings />
            </>
          )}
        </div>
      )}
    </>
  );
};

// small wrapper so AppliedProfile reads from the same context hook
const AppliedProfileWrapper = () => <AppliedProfile />;

export default SettingsCard;
