import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SelectMulti from 'react-select';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash,
  RefreshCw,
  Search,
} from 'lucide-react';
import { FaRegTrashAlt } from 'react-icons/fa';
import { toast } from 'sonner';

import {
  getCameraDetailsById,
  getHeaderCamersList,
  requestCameraRefresh,
} from './Api/get';
import { createCameraAliasName } from '../Dashboard/Api/put';
import { getDepartmentList } from './Api/post';
import { decrypt } from '@/helpers/decriptNvr';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import DeleteConfirmation from '../Detection/components/DeleteConfirmation';
import Monitorcog from '@/components/ui/Monitorcog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import LiveViewModal from './LiveViewModal';
export default function CameraSettings() {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canViewNVR = permissions?.NVR?.view;

  const canVieChannels = permissions?.channels?.view;
  const canCreateChannels = permissions?.channels?.create;
  const canEditChannels = permissions?.channels?.edit;
  const canDeleteChannels = permissions?.channels?.delete;

  if (permissionsLoading) return <PageLoader />;
  if (!canViewNVR) {
    return <AccessDenied message="You don't have permission to view NVR's." />;
  }
  const navigate = useNavigate();
  const location = useLocation();
  const nvrId = location.state?.nvrId;

  const [tableData, setTableData] = useState([]);
  const [nvrDetails, setNvrDetails] = useState(null);
  const [detectionTypes, setDetectionTypes] = useState({});
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [aliasInput, setAliasInput] = useState('');
  const popupRef = useRef(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [showLiveView, setShowLiveView] = useState(false);
  const [liveViewCamera, setLiveViewCamera] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleLiveView = (camera) => {
    setLiveViewCamera(camera);
    setShowLiveView(true);
  };

  // ===== Fetch detection types =====
  const fetchDetectionTypes = async () => {
    try {
      const response = await getHeaderCamersList();
      if (response?.data?.body?.status === 'success') {
        setDetectionTypes(response.data.body.data.detectionTypes || {});
      }
    } catch (err) {
      console.error('Error fetching detection types:', err);
    }
  };

  // ===== Fetch camera details =====
  const fetchCameraDetails = async (showToast = false) => {
    if (!nvrId) return;
    setIsRefreshing(true);
    try {
      const response = await getCameraDetailsById(nvrId);
      if (response?.data?.body?.status === 'success') {
        const channels = response?.data?.body?.data?.channels || [];
        const mappedData = channels.map((ch, idx) => ({
          id: ch._id,
          cameraName: ch.name || `Camera ${idx + 1}`,
          aliasName: ch.customName || '',
          departments: ch.department || [],
          streamingUrl: ch.streamingUrl || null, // expected as array of department IDs
        }));
        setTableData(mappedData);
        setNvrDetails(response?.data?.body?.data?.nvr || null);
        if (showToast) {
          toast.success('Cameras refreshed successfully');
        }
      }
    } catch (err) {
      console.error('Error fetching camera details:', err);
      if (showToast) {
        toast.error('Failed to refresh cameras');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    if (!nvrId) return;
    setIsRefreshing(true);
    try {
      // First, call the requestCameraRefresh API
      const refreshResponse = await requestCameraRefresh(nvrId);
      if (refreshResponse?.data?.body?.status === 'success') {
        // Then, fetch the camera details
        await fetchCameraDetails(true);
      } else {
        toast.error('Failed to refresh cameras');
        setIsRefreshing(false);
      }
    } catch (err) {
      console.error('Error during refresh:', err);
      toast.error('Failed to refresh cameras');
      setIsRefreshing(false);
    }
  };
  // ===== Fetch department list =====
  const fetchDepartmentList = async () => {
    try {
      const response = await getDepartmentList();
      const deptList = response?.data?.body?.data?.data || [];
      const formatted = deptList.map((d) => ({
        value: d._id,
        label: d.departmentName,
      }));
      setDepartmentOptions(formatted);
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  // ===== Handle alias popup =====
  const handleAliasPopup = (camera) => {
    setSelectedCamera(camera);
    setAliasInput(camera.aliasName || '');
    setShowPopup(true);
  };

  // ===== Save alias name =====
  const handleSaveAlias = async () => {
    // if (!aliasInput.trim()) {
    //   toast.error('Alias name cannot be empty');
    //   return;
    // }

    const response = await createCameraAliasName(selectedCamera.id, {
      customName: aliasInput.trim(),
      department: selectedCamera.departments, // maintain departments
    });

    if (response?.body?.status === 'success') {
      toast.success(response.body.message);
    } else {
      toast.error('Failed to update alias');
    }

    setTableData((prev) =>
      prev.map((cam) =>
        cam.id === selectedCamera.id ? { ...cam, aliasName: aliasInput } : cam
      )
    );
    setShowPopup(false);
  };

  // ===== Update departments on change =====
  const handleDepartmentChange = async (cameraId, selected) => {
    const selectedDeptIds = selected.map((opt) => opt.value);

    // Optimistic UI update
    setTableData((prev) =>
      prev.map((cam) =>
        cam.id === cameraId ? { ...cam, departments: selectedDeptIds } : cam
      )
    );

    try {
      const response = await createCameraAliasName(cameraId, {
        department: selectedDeptIds,
      });

      if (response?.body?.status === 'success') {
        toast.success('Departments updated successfully');
      } else {
        toast.error('Failed to update departments');
      }
    } catch (err) {
      console.error('Error updating departments:', err);
      toast.error('Something went wrong while updating departments');
    }
  };

  // ===== useEffects =====
  useEffect(() => {
    fetchDepartmentList();
    fetchDetectionTypes();
  }, []);

  useEffect(() => {
    if (Object.keys(detectionTypes).length > 0) {
      fetchCameraDetails();
    }
  }, [nvrId, detectionTypes]);

  const handleDeleteRole = (camera) => {
    setSelectedCamera(camera);
    // setRoleToDelete(role);
    setDeleteConfirmationOpen(true);
  };

  const handleConfirmDelete = async () => {
    const response = await createCameraAliasName(selectedCamera.id, {
      customName: '',
      // department: selectedCamera.departments, // maintain departments
    });
    if (response?.statusCode == 200) {
      toast.success(response?.body?.message);
      fetchCameraDetails();
      setDeleteConfirmationOpen(false);
    } else {
      toast.error(response?.body?.message);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmationOpen(false);
    // setRoleToDelete(null);
  };

  const [deletePopup, setDeletePopup] = useState({ show: false, camera: null });
  const confirmDeleteCamera = async () => {
    try {
      const cameraId = deletePopup.camera?.id;

      // 🔹 TODO: Replace with your delete API call
      // await deleteCameraById(cameraId);

      // Optimistic UI update
      setTableData((prev) => prev.filter((cam) => cam.id !== cameraId));
      toast.success('Camera deleted successfully');
    } catch (err) {
      console.error('Error deleting camera:', err);
      toast.error('Failed to delete camera');
    } finally {
      setDeletePopup({ show: false, camera: null });
    }
  };

  return (
    <div className="min-h-screen text-gray-900">
      {/* ===== Header ===== */}
      <div className="px-4 py-3 sticky z-20 flex items-center gap-2">
        <button
          onClick={() => navigate('/nvr-settings')}
          className="flex items-center text-gray-600 hover:text-gray-800 cursor-pointer"
        >
          <div className="flex items-center justify-center w-7 h-7 md:w-12 md:h-12 rounded-full bg-white/30 backdrop-blur-sm border border-white/30 shadow-sm mr-1.5 sm:mr-2">
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 text-[#333333]" />
          </div>
          <span className="text-[12px] md:text-[18px] font-medium text-[#333333] bg-white backdrop-blur-sm px-3 py-1.5 rounded-lg">
            Go back to NVR settings
          </span>
        </button>
      </div>

      {/* ===== Main Content ===== */}
      <div className="w-full overflow-x-auto p-4 md:p-8 space-y-6 bg-white rounded-lg md:rounded-[18px]">
        <h1 className="text-xl md:text-3xl font-medium text-[#333333]">
          Camera Settings
        </h1>

        {/* ===== NVR Info ===== */}
        {nvrDetails && (
          <div className="border-gray-200 rounded-lg bg-[#FAFAFA] p-4 space-y-4">
            <h2 className="text-[14px] md:text-[18px] font-medium text-[#333333] border-b border-[#D8D8D8] pb-4">
              Current NVR Settings
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Name', value: nvrDetails.nvrName || '' },
                // { label: 'IP Address', value: decrypt(nvrDetails.ip || '') },
                // { label: 'Username', value: nvrDetails.username || '' },
                { label: 'Location', value: nvrDetails.location || '' },
                { label: 'RTSP Port', value: nvrDetails.rtspPort || '' },
              ].map((input, i) => (
                <div key={i}>
                  <label className="text-sm text-[#7A7A7A]">
                    {input.label}
                  </label>
                  <input
                    disabled
                    value={input.value}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== Table ===== */}
        {canVieChannels ? (
          <div className="bg-[#FAFAFA] rounded-[9px] p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center gap-4 flex-1">
                <h2 className="text-[16px] font-medium text-[#333333] whitespace-nowrap">
                  CCTV AI Monitoring Task Selector
                </h2>
                <div className="relative w-full max-w-xs ml-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search camera or alias..."
                    className="pl-9 h-8 text-sm border-gray-300 focus:border-[#07486A]"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              {/* <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 text-[#07486A] border-[#07486A] hover:bg-[#07486A] hover:text-white transition-all h-8"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                {isRefreshing ? 'Refreshing...' : 'Refresh All'}
              </Button> */}
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-[#F8F9FA] border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                      Camera Name{' '}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                      Alias Name
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                      Assigned Departments
                    </th>
                    {/* <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Action</th> */}
                  </tr>
                </thead>

                <tbody>
                  {tableData
                    .filter(
                      (camera) =>
                        camera.cameraName
                          ?.toLowerCase()
                          .includes(searchTerm.toLowerCase()) ||
                        camera.aliasName
                          ?.toLowerCase()
                          .includes(searchTerm.toLowerCase())
                    )
                    .map((camera) => (
                      <tr
                        key={camera.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-3 px-4 text-sm font-medium">
                          {camera.cameraName}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="ml-2 "
                                onClick={() => handleLiveView(camera)}
                              >
                                <Monitorcog className="w-5 h-5 inline-block cursor-pointer text-white transition-colors" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>View</p>
                            </TooltipContent>
                          </Tooltip>
                        </td>

                        <td className="py-3 px-4 text-sm text-gray-800">
                          <div className="flex items-center gap-2">
                            {camera.aliasName ? (
                              <span>{camera.aliasName}</span>
                            ) : (
                              <span className="text-gray-400 italic">
                                No alias
                              </span>
                            )}
                            <button className="flex items-center gap-2 text-[#07486A] hover:text-[#05364f]">
                              <>
                                {canEditChannels && (
                                  <Pencil
                                    onClick={() => handleAliasPopup(camera)}
                                    size={16}
                                    className="cursor-pointer hover:text-[#05364f] transition-colors"
                                  />
                                )}
                              </>
                            </button>
                          </div>
                        </td>

                        {/* <td className=" min-w-[260px]">
                      <SelectMulti
                        isMulti
                        value={departmentOptions.filter((opt) =>
                          camera.departments.includes(opt.value)
                        )}
                        onChange={(selected) => handleDepartmentChange(camera.id, selected)}
                        options={departmentOptions}
                        className="text-sm"
                      />
                    </td> */}
                        <td className="min-w-[260px]">
                          <SelectMulti
                            isDisabled={!canEditChannels}
                            isMulti
                            value={departmentOptions.filter((opt) =>
                              camera.departments.includes(opt.value)
                            )}
                            onChange={(selected) =>
                              handleDepartmentChange(camera.id, selected)
                            }
                            options={departmentOptions}
                            className="text-sm"
                            classNamePrefix="Select"
                            menuPortalTarget={document.body}
                            menuShouldScrollIntoView={false}
                            styles={{
                              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                              menu: (base) => ({ ...base, zIndex: 9999 }),
                            }}
                          />
                        </td>

                        {/* <td className="py-3 px-4 text-sm">
                      <button
                        onClick={() => setDeletePopup({ show: true, camera })}
                        className="text-[#C41717] hover:text-red-700"
                      >
                        <FaRegTrashAlt className="w-4 h-4" />
                      </button>

                    </td> */}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <AccessDenied message="You don't have permission to view Channels." />
        )}
      </div>

      {/* ===== Alias Popup ===== */}
      {showPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm">
          <div
            ref={popupRef}
            className="bg-white rounded-lg shadow-xl border border-gray-200 p-6 w-full max-w-md"
          >
            <h3 className="text-lg font-semibold text-[#07486A] mb-4">
              {selectedCamera?.aliasName ? 'Edit Alias Name' : 'Add Alias Name'}
            </h3>
            <Input
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              placeholder="Enter alias name"
              className="w-full text-sm border-gray-300 focus:border-[#07486A]"
            />
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowPopup(false)}
                className="text-gray-700 border-gray-300 cursor-pointer hover:bg-gray-100"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveAlias}
                className="bg-[#07486A] hover:bg-[#05364f] cursor-pointer text-white"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ===== Delete Confirmation Popup ===== */}
      {deletePopup.show && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-[#C41717] mb-2">
              Delete Camera
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete{' '}
              <span className="font-medium text-gray-800">
                {deletePopup.camera?.cameraName}
              </span>
              ? This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDeletePopup({ show: false, camera: null })}
                className="text-gray-700 border-gray-300 hover:bg-gray-100"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDeleteCamera}
                className="bg-[#C41717] hover:bg-[#a01010] text-white"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmation
        open={deleteConfirmationOpen}
        title="Delete Alias Name"
        message={`Are you sure you want to delete the Alias Name ? This will permanently remove the Alias Name and all its associated permissions.`}
        icon={<Trash className="w-6 h-6 text-red-500" />}
        confirmLabel="Delete Alias Name"
        cancelLabel="Cancel"
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        confirmClass="bg-red-600 text-white hover:bg-red-700"
      />
      <LiveViewModal
        isOpen={showLiveView}
        onClose={() => setShowLiveView(false)}
        onUpdate={fetchCameraDetails}
        camera={liveViewCamera}
        cameraList={tableData}
      />
    </div>
  );
}
