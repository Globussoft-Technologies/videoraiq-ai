import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SquarePen, TriangleAlert, Trash2, ListVideo } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Camera from '../../../assets/Camera.svg';
import AddNVRForm from './Nvrform';
import StreamHeader from '@/components/StreamHeader';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/Tooltip';
import { decrypt } from '@/helpers/decriptNvr';
import { usePermissions } from '@/context/Permission/PermissionContext';
import DeleteConfirmation from '../Detection/components/DeleteConfirmation';
import CameraDiscoveryModal from './CameraDiscoveryModal';

// Commonly used Tailwind classes
const STYLES = {
  PAGE_CONTAINER: 'min-h-screen rounded-[10px] bg-white p-3 md:p-5 2xl:rounded-[18px] 2xl:md:p-8',
  CARD_CONTAINER: 'rounded-md pb-3 px-3 pt-4 bg-[#FAFAFA] md:pb-[12px] md:px-[10px] md:pt-[16px] 2xl:rounded-[9px] 2xl:pb-[18px] 2xl:px-[14px] 2xl:pt-[24px]',
  HEADER_TEXT: 'text-base font-medium text-gray-800 md:text-lg 2xl:md:text-[35px]',
  SUB_HEADER: 'text-[10px] text-gray-500 font-normal md:text-xs 2xl:md:text-[17px]',
  INPUT_CONTAINER:
    'block w-full border border-[#80808059] rounded-md px-2 py-1.5 text-[10px] font-normal focus:border-[#0B1A6A] focus:ring-1 focus:ring-[#0B1A6A] transition-colors md:text-xs md:px-2.5 md:py-2 2xl:rounded-[10px] 2xl:px-4 2xl:py-3.5 2xl:md:text-[16px]',
  LABEL: 'block text-[#7A7A7A] font-normal text-[10px] mb-0.5 ml-1 md:text-[11px] md:mb-1 md:ml-1.5 2xl:text-[14px] 2xl:ml-2',
  BUTTON_PRIMARY:
    'bg-[#E5F6FF] text-[#07486A] hover:bg-[#07486A] hover:text-white font-[400] cursor-pointer text-xs px-2.5 py-0 h-7 rounded-[32px] transition-colors md:text-xs md:px-3 md:h-7 2xl:text-[16px] 2xl:px-4 2xl:py-0 2xl:h-9',
  BUTTON_SECONDARY:
    'flex items-center gap-1.5 hover:bg-[#07486A] hover:text-white cursor-pointer bg-[#FAFAFA] font-normal text-[#5D5D5D] border border-[#C9C9C9] text-xs px-2.5 py-0 rounded-md md:text-xs md:px-3 md:py-0 2xl:text-[14px] 2xl:px-6 2xl:py-0 2xl:rounded-[5px] 2xl:gap-3',
  FLEX_CONTAINER:
    'flex flex-col w-full gap-3 md:flex-row md:space-x-4 md:w-auto',
  GRID_CONTAINER: 'grid grid-cols-1 md:grid-cols-5 gap-2 md:gap-3 2xl:gap-8',
  ERROR_BADGE:
    'bg-[#FFDBD9] text-[#CE241C] px-1.5 py-0.5 hidden md:flex rounded items-center whitespace-nowrap font-normal text-[8px] overflow-hidden md:text-[8px] md:px-1.5 md:py-0.5 2xl:text-[10px] 2xl:px-3 2xl:py-2 2xl:rounded-[8px]',
};

const Nvrsettings = ({ nvrDetails, fetchNvrData, onDeleteNvr }) => {
  const { permissions } = usePermissions();

  const canEdit = permissions?.NVR?.edit;
  const canDelete = permissions?.NVR?.delete;

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNvr, setEditingNvr] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [manageCamerasNvrId, setManageCamerasNvrId] = useState(null);
  const navigate = useNavigate();

  const handleCameraSettings = (nvrId) => {
    navigate('/streams/camera-settings', { state: { nvrId } });
  };

  const handleDeleteClick = (nvr) => {
    setDeleteTarget(nvr);
    setShowDeleteModal(true);
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?._id) return;

    const success = await onDeleteNvr(deleteTarget._id);
    if (success) {
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const handleEditClick = (nvr) => {
    setEditingNvr(nvr);
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingNvr(null);
  };

  return (

    <div className={STYLES.PAGE_CONTAINER}>
      {/* Back button */}{' '}
      <StreamHeader
        title="NVR Settings"
        onConfigClick={() => setShowAddForm(true)}
      />
      {/* Add NVR Form */}
      {showAddForm && (
        <AddNVRForm
          onClose={handleCloseForm}
          isEdit={false}
          fetchNvrData={fetchNvrData}
        />
      )}
      {/* Edit NVR Form */}
      {editingNvr && (
        <AddNVRForm
          fetchNvrData={fetchNvrData}
          onClose={handleCloseForm}
          isEdit={true}
          initialData={{
            name: editingNvr.nvrName || editingNvr.deviceName || '',
            location: editingNvr.location || '',
            ipAddress: editingNvr.ip || '',
            username: editingNvr.username || '',
            password: '', // Do not prefill password
            rtspPort: editingNvr.rtspPort ? String(editingNvr.rtspPort) : '',
            port: editingNvr.port || '',
            _id: editingNvr._id || '',
            brand: editingNvr.brand || '',
          }}
        />
      )}
      {/* NVR Cards Section */}
      <div className="space-y-6 md:space-y-6 2xl:space-y-12">
        {Array.isArray(nvrDetails) && nvrDetails.length > 0 ? (
          nvrDetails.map((nvr, index) => (
            <div key={nvr._id || index} className={STYLES.CARD_CONTAINER}>
              {/* Header Row with Title and Buttons */}
              <div className="flex justify-between items-start border-b border-[#D8D8D8] pb-[8px] mb-[12px] flex-wrap gap-3 md:pb-[8px] md:mb-[14px] md:gap-3 2xl:pb-[15px] 2xl:mb-[22px] 2xl:gap-6">
                <div className="flex items-center gap-3 flex-wrap md:gap-3 2xl:gap-6">
                  <h2 className="text-[10px] md:text-xs font-medium text-[#333333] 2xl:md:text-[18px]">
                    {nvr?.nvrName || 'NVR'}
                  </h2>
                  {/* Example error badge logic: show if passwordChanged is true */}
                  {nvr.passwordChanged && (
                    <div className={STYLES.ERROR_BADGE}>
                      <TriangleAlert className="w-2.5 h-2 mr-1 shrink-0 text-[#CE241C] md:w-3 md:h-2.5 md:mr-1 2xl:w-4 2xl:h-3 2xl:mr-2" />
                      Password change detected. Please update your password.
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => handleCameraSettings(nvr?._id)}
                        className="flex items-center cursor-pointer bg-[#FAFAFA] font-normal text-[#333333] border border-[#C9C9C9] hover:bg-[#07486a] hover:text-white text-[10px] gap-1.5 rounded-md group h-7 px-2.5 md:text-[11px] md:px-2.5 md:py-1 md:h-7 2xl:text-[14px] 2xl:gap-3 2xl:h-9"
                      >
                        <svg
                          width="14"
                          height="12"
                          viewBox="0 0 22 19"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="stroke-[#333333] group-hover:stroke-white transition-colors duration-200 md:w-[16px] md:h-[14px] 2xl:w-[22px] 2xl:h-[19px]"
                        >
                          <path
                            d="M15.75 9.00016H19.382C19.5524 9.00025 19.7199 9.04388 19.8687 9.1269C20.0175 9.20993 20.1426 9.3296 20.2322 9.47456C20.3218 9.61951 20.3728 9.78495 20.3805 9.95517C20.3881 10.1254 20.3522 10.2947 20.276 10.4472L18.242 14.5162C18.1649 14.6703 18.0492 14.802 17.9062 14.8983C17.7632 14.9946 17.5977 15.0523 17.4259 15.0657C17.254 15.0792 17.0816 15.048 16.9253 14.9752C16.769 14.9024 16.6342 14.7904 16.534 14.6502L14.41 11.6802M1 16.0002H4.76C5.13273 16.0028 5.49877 15.9011 5.81682 15.7068C6.13487 15.5124 6.39228 15.233 6.56 14.9002L8 12.0002M1 18.0002V14.0002M6 6.00016H6.01M16.106 6.05316C16.343 6.17181 16.5232 6.3797 16.607 6.63115C16.6909 6.8826 16.6714 7.15703 16.553 7.39416L13.447 13.6052C13.3883 13.7226 13.3069 13.8274 13.2077 13.9135C13.1084 13.9995 12.9932 14.0652 12.8686 14.1067C12.744 14.1482 12.6124 14.1647 12.4814 14.1554C12.3504 14.146 12.2225 14.111 12.105 14.0522L2.61 9.30016C1.92033 8.95277 1.39635 8.34634 1.15272 7.61357C0.909086 6.88079 0.965637 6.08134 1.31 5.39016L2.69 2.60016C2.862 2.25738 3.09984 1.95184 3.38994 1.70099C3.68003 1.45015 4.0167 1.2589 4.38072 1.13818C4.74474 1.01746 5.12897 0.969631 5.51147 0.997424C5.89398 1.02522 6.26726 1.12809 6.61 1.30016L16.106 6.05316Z"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="mr-0.5 md:mr-1 2xl:mr-2">Camera Settings</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>View {nvr?.nvrName ?? ''} Camera Settings</p>
                    </TooltipContent>
                  </Tooltip>{' '}

                  {canEdit && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className={STYLES.BUTTON_SECONDARY + " h-7 md:h-7 2xl:h-9"}
                          onClick={() => setManageCamerasNvrId(nvr._id)}
                        >
                          <ListVideo className="w-3 h-3 md:w-3.5 md:h-3.5 2xl:w-5 2xl:h-5" />
                          <span className="hidden sm:inline">Cameras</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Manage Cameras</p>
                      </TooltipContent>
                    </Tooltip>
                  )}

                  { canEdit && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className={STYLES.BUTTON_SECONDARY + " h-7 md:h-7 2xl:h-9"}
                          onClick={() => handleEditClick(nvr)}
                        >
                          <SquarePen className="w-3 h-3 md:w-3.5 md:h-3.5 2xl:w-5 2xl:h-5" />
                    
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit {nvr?.nvrName ?? ''}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {canDelete && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className={STYLES.BUTTON_SECONDARY + " h-7 md:h-7 2xl:h-9"}
                          onClick={() => handleDeleteClick(nvr)}
                        >
                          <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5 2xl:w-5 2xl:h-5" />
                          Delete
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete {nvr?.nvrName ?? ''}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>{' '}
              {/* NVR Form Grid */}
              <div className={STYLES.GRID_CONTAINER}>
                {/* <div>
                  <label className={STYLES.LABEL}>Name</label>
                  <input
                    type="text"
                    value={nvr.nvrName || ''}
                    className={STYLES.INPUT_CONTAINER}
                    disabled
                  />
                </div> */}
                {nvr.ip  &&    <div>
                  <label className={STYLES.LABEL}>IP Address</label>
                  <input
                    type="text"
                    value={decrypt(nvr.ip || '')}
                    className={STYLES.INPUT_CONTAINER}
                    disabled
                  />
                </div>}
              {nvr.username  &&  <div>
                  <label className={STYLES.LABEL}>Username</label>
                  <input
                    type="text"
                    value={nvr.username || ''}
                    className={STYLES.INPUT_CONTAINER}
                    disabled
                  />
                </div>}
                <div>
                  <label className={STYLES.LABEL}>Location</label>
                  <input
                    type="text"
                    value={nvr.location || ''}
                    className={STYLES.INPUT_CONTAINER}
                    disabled
                  />
                </div>
                <div>
                  <label className={STYLES.LABEL}>Total Cameras</label>
                  <div className="relative">
                    <input
                      type="text"
                      // value={nvr.password ? '***************' : ''}
                      value={nvr.cameraCount || 0}
                      className={`${STYLES.INPUT_CONTAINER} pr-10`}
                      disabled
                    />
                    {/* {nvr.passwordChanged && (
                      <TriangleAlert className="absolute right-3 top-4 w-5 h-5 text-red-500" />
                    )} */}
                  </div>
                </div>
           {nvr.rtspPort &&      <div>
                  <label className={STYLES.LABEL}>RTSP Port</label>
                  <input
                    type="text"
                    value={nvr.rtspPort ? String(nvr.rtspPort) : ''}
                    className={STYLES.INPUT_CONTAINER}
                    disabled
                  />
                </div>}
              </div>
              {/* Bottom Button */}
              <div className="mt-3 flex justify-start md:mt-3 2xl:mt-6">
                <Button
                  className={STYLES.BUTTON_PRIMARY + " flex items-center justify-center"}
                  onClick={() => navigate('/cameraview', { state: { from: 'nvr-settings', nvrIdFromNvr: nvr._id } })}
                  type="button"
                >
                  View CCTV Streams
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center mt-16 px-4 text-center md:mt-40">
            <img
              src={Camera}
              alt="CCTV Camera"
              className="w-48 h-48 md:w-72 md:h-72"
            />
            <p className="text-sm text-[#5D5D5D] font-normal max-w-xs mt-6 md:text-[20px] md:max-w-xl">
              CCTV stream access is not configured. Please enter the configuration
              details to enable streaming.
            </p>
          </div>
        )}
      </div>
      <DeleteConfirmation
        open={showDeleteModal}
        icon={<Trash2 className="w-7 h-7 text-red-600" />}
        message = {
          deleteTarget?.isMultiple
            ? `Are you sure you want to delete ${deleteTarget.count} profile${deleteTarget.count > 1 ? 's' : ''}? This action cannot be undone.`
            : deleteTarget
              ? `Are you sure you want to delete "${deleteTarget.name || deleteTarget.nvrName || deleteTarget._id}"? This action cannot be undone. Once deleted, this NVR and all channels associated with it cannot be recovered.`
              : 'Are you sure you want to delete this NVR? Once deleted, this NVR and all related channels cannot be recovered.'
        }
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
      {manageCamerasNvrId && (
        <CameraDiscoveryModal
          nvrId={manageCamerasNvrId}
          onClose={() => setManageCamerasNvrId(null)}
          onSaved={fetchNvrData}
        />
      )}
    </div>
    
  );
};

export default Nvrsettings;
