import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Search, SearchSlash, Cctv, CirclePlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getProfileDetails } from '../../Profile/Api/get';
import { updateCameraSettingById } from '../../Streams/Api/patch';
import { toast } from 'sonner';
import MultiStepForm from '../../Profile/MultiStepForm';
import { usePermissions } from '@/context/Permission/PermissionContext';

const ProfileSelectionDialog = ({ open, onClose, onSelectProfile, selectedChannelIds, fetchAppliedProfile }) => {
  const [searchInput, setSearchInput] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { permissions } = usePermissions();

  const createPermission = permissions?.detectionSettings?.create
  const editPermission = permissions?.detectionSettings?.edit
  const viewPermission = permissions?.detectionSettings?.view
  const deletePermission = permissions?.detectionSettings?.delete
  const fetchProfiles = async (search = '') => {
    try {
      setLoading(true);
      setError('');
      const res = await getProfileDetails({ page: 1, limit: 20, search });
      if (res?.data?.body?.status === 'success') {
        setProfiles(res?.data?.body?.data?.profiles);
      } else {
        setProfiles([]);
      }
    } catch (err) {
      console.error('Error fetching profiles:', err);
      setError('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchProfiles(searchInput);
  }, [open, searchInput]);

  const handleApplyProfile = async () => {
    try {
      if (!selectedProfile) {
        toast.error("Please select a profile");
        return;
      }

      const response = await updateCameraSettingById(
        selectedChannelIds[0],
        { profile: selectedProfile._id }
      );

      if (response?.data?.statusCode === 200) {
        toast.success(response?.data?.body?.message);
        fetchAppliedProfile()
        setSelectedProfile(null);
        onClose();
      } else {
        toast.error(response?.data?.body?.message || "Failed to update profile");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(error?.response?.data?.body?.message || "Something went wrong");
    }
  };


  const handleClose = () => {
    setSelectedProfile(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md rounded-[16px] bg-white w-[95vw] sm:w-[420px] h-[95vh] sm:h-[90vh] md:h-[81vh] top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Fixed Header */}
        <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-2 border-b border-gray-200 bg-white">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-lg sm:text-xl font-semibold text-[#333333]">
                Apply a Profile
              </DialogTitle>
            </div>

            <div className="ml-4 flex-shrink-0">
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-shrink-0 px-4 w-[98%] md:px-6 pt-3 bg-white">
          <p className="text-xs sm:text-sm text-[#929292] font-[400] mt-1 mb-2">
            Choose a profile to apply on to this camera.
          </p>
          <div className="flex items-center gap-2 pb-2">
            <div className="relative flex-1 bg-white">
              <Input
                type="text"
                placeholder="Search profile"
                className="pl-4 pr-10 shadow-none border border-[#C7C7C7] text-[#595959] h-10 rounded-[10px] focus:ring-1 focus:ring-[#07486A] focus:border-[#07486A] transition-all text-sm"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#D3D3D3] pointer-events-none" />
            </div>
            {createPermission === true && (
              <MultiStepForm
                fetchProfiles={fetchProfiles}
                trigger={
                  <button
                    className="flex items-center justify-center focus:outline-none w-10 h-10 bg-[#07486A] text-white rounded-full cursor-pointer hover:bg-[#063d5a] transition-colors flex-shrink-0"
                    aria-label="Add New Profile"
                  >
                    <CirclePlus className="w-5 h-5 text-white" />
                  </button>
                }
              />
            )}
          </div>
        </div>

        {/* Scrollable Profiles List */}
        <div className="flex-1 overflow-hidden overflow-y-auto px-4 sm:px-6 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
              Loading profiles...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <X className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-gray-600 text-sm font-medium mb-1">{error}</p>
            </div>
          ) : profiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <SearchSlash
                  className="w-6 text-[#333333] h-6"
                  strokeWidth={1}
                />
              </div>
              <p className="text-gray-600 text-sm font-medium mb-1">
                No profiles found
              </p>
              <p className="text-gray-400 text-xs">
                Try adjusting your search terms
              </p>
            </div>
          ) : (
            <RadioGroup
              value={selectedProfile?._id || ''}
              onValueChange={(val) => {
                const p = profiles.find((d) => d._id === val);
                setSelectedProfile(p || null);
              }}
              className="space-y-3 px-0 gap-0"
            >
              {profiles.map((profile) => {
                const basics = profile.basics || {};
                const isSelected = selectedProfile?._id === profile._id;
                return (
                  <div
                    key={profile._id}
                    onClick={() => setSelectedProfile(profile)}
                    className={`flex items-center justify-between py-3 sm:py-4 px-3 rounded-lg border transition-all duration-150 cursor-pointer  ${isSelected
                        ? 'bg-[#E3F5FF] border-[#58C6FF] shadow-sm'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 max-w-xs flex-1">
                      <div
                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full ${isSelected ? 'bg-white' : 'bg-gray-100'
                          } flex items-center justify-center flex-shrink-0`}
                      >
                        <Cctv
                          className="w-5 h-5 sm:w-6 sm:h-6 text-[#333333]"
                          strokeWidth={1}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-[500] text-[#333333]">
                          {basics?.profileName
                            ? basics.profileName.length > 15
                              ? basics.profileName.substring(0, 15) + '...'
                              : basics.profileName
                            : ''}
                        </p>
                        <p className="text-xs text-gray-500">
                          {profile?.status || ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex-shrink-0 ml-2">
                      <RadioGroupItem
                        iconSize="size-3"
                        value={profile._id}
                        className="w-4 h-4"
                      />
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-[#D3D3D3] bg-white">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3">
            <Button
              variant="outline"
              size="default"
              onClick={handleClose}
              className="rounded-[7px] cursor-pointer border border-[#D3D3D3] text-[#474242] font-[500] px-4 sm:px-5 py-2 sm:py-3 text-sm sm:text-base order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyProfile}
              disabled={!selectedProfile}
              className="rounded-[7px] cursor-pointer text-white px-4 sm:px-5 font-[500] py-2 sm:py-3 bg-[#07486A] text-sm sm:text-base order-1 sm:order-2"
            >
              Apply Profile
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileSelectionDialog;
