import React, { useEffect, useRef, useState } from "react";
import { Edit3, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useInnerSettings } from "./InnerSettingsContext";
import { updateCameraSettingById } from "../../Streams/Api/patch";
import { toast } from "sonner";
import MultiStepForm from "../../Profile/MultiStepForm";
import DeleteConfirmation from "../components/DeleteConfirmation";
import { usePermissions } from "@/context/Permission/PermissionContext";

const DefaultDetectionSettings = () => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showUsersDropdown, setShowUsersDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const { permissions } = usePermissions();

  const createPermission = permissions?.detectionSettings?.create
  const editPermission = permissions?.detectionSettings?.edit
  const viewPermission = permissions?.detectionSettings?.view
  const deletePermission = permissions?.detectionSettings?.delete

  const { appliedProfileData, channelData, fetchAppliedProfile } =
    useInnerSettings();

  const appliedProfile = appliedProfileData;

  const users =
    appliedProfile?.profile?.defaultDetectionSettings?.authorisedUsers
      ?.map((u) => u?.userName)
      .filter(Boolean) || [];

  const visibleUsers = users.slice(0, 3);
  const remainingUsers = users.slice(3);
  const remainingCount = remainingUsers.length;

  // 🔹 Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowUsersDropdown(false);
      }
    };

    if (showUsersDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showUsersDropdown]);

  const handleClearProfile = async () => {
    try {
      const selectedChannelIds = (channelData?.linkedCameras || []).map(
        (c) => c._id
      );

      const response = await updateCameraSettingById(selectedChannelIds[0], {
        profile: null,
      });

      if (response?.data?.statusCode === 200) {
        toast.success(response?.data?.body?.message);
        fetchAppliedProfile && fetchAppliedProfile();
      } else {
        toast.error(
          response?.data?.body?.message || "Failed to update profile"
        );
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.body?.message || "Something went wrong"
      );
    }
  };

  return (
    <div>
      <h3 className="text-sm md:text-xs 2xl:text-sm font-semibold text-[#333333] mb-4">
        Default Detection Setting
      </h3>

      <div className="border border-[#E6E6E6] rounded-[8px] p-3">
        <div className="flex justify-between items-start gap-3">
          {/* Left content */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs text-[#333333] font-medium">
                Enable Face – Authentication
              </p>
              <Switch
                checked={users.length > 0}
                disabled
                className="scale-75 cursor-not-allowed pointer-events-none"
              />
            </div>

            <div className="text-xs text-[#878787]">
              <p className="mb-0.5">Selected Identified Faces</p>

              <p className="mt-1 text-black flex flex-wrap items-center gap-1">
                {users.length === 0 ? (
                  "No users selected"
                ) : (
                  <>
                    {visibleUsers.join(", ")}

                    {remainingCount > 0 && (
                      <span
                        ref={dropdownRef}
                        className="relative inline-block ml-1"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setShowUsersDropdown((prev) => !prev)
                          }
                          className="text-blue-600 hover:underline text-xs cursor-pointer"
                        >
                          +{remainingCount} more
                        </button>

                          {showUsersDropdown && (
                            <div className="absolute z-50 bottom-full mb-2 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-xl">

                              {/* Arrow (bottom) */}
                              <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-white border-r border-b border-gray-200 rotate-45" />

                              <ul className="max-h-52 overflow-auto text-xs text-gray-800 py-1">
                                {remainingUsers.map((user, index) => (
                                  <li
                                    key={index}
                                    className="px-4 py-2 hover:bg-gray-50 cursor-default truncate"
                                    title={user}
                                  >
                                    {user}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}


                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {editPermission == true && (() => {
              const selectedChannelIds =
                (channelData?.linkedCameras || []).map((c) => c._id);

              return (
                <MultiStepForm
                  row={appliedProfile?.profile}
                  module="appliedProfile"
                  selectedChannelIds={selectedChannelIds}
                  fetchAppliedProfile={fetchAppliedProfile}
                  trigger={
                    <button className="p-2 hover:bg-gray-100 rounded-lg">
                      <Edit3 className="w-4 h-4 text-[#07486A]" />
                    </button>
                  }
                />
              );
            })()}

         {  deletePermission  == true && <button
              className="p-2 hover:bg-gray-100 rounded-lg"
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 className="w-4 h-4 text-[#CE261E]" />
            </button>}
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <DeleteConfirmation
        open={showDeleteModal}
        icon={<Trash2 className="w-7 h-7 text-red-600" />}
        message="Are you sure you want to delete this profile?"
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleClearProfile}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    </div>
  );
};

export default DefaultDetectionSettings;
