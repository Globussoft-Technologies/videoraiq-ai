import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
  ChevronDown,
  ChevronUp,
  ExpandIcon,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { getAllDetectionDetails } from '../Api/get';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { deleteDetectionSettings } from '../Api/delete';
import { toast } from 'sonner';
import counterimg from '@/assets/CounterImg2.png';
import expand from '@/assets/expand.svg';
import Minimize from '@/assets/Minimize.svg';
import { Button } from '@/components/ui/button';
import DetectionSettingsModal from './EditDetectionSettingModal';
import DeleteConfirmation from './DeleteConfirmation';
import Delete from '@/assets/Delete.svg';
import ConfigSearchControl from './ConfigSearchControl';
// Simple and immersive image modal component
const ImageModal = ({ open, onClose, imgSrc }) => {
  React.useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 transition-opacity"
      onClick={onClose}
      aria-modal="true"
    >
      <div className="relative w-[50vw] h-[50vh]">
        <img
          src={imgSrc}
          alt="Area preview expanded"
          className="w-full h-full object-cover rounded-lg shadow-lg"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          className="absolute top-2 cursor-pointer right-2 bg-white rounded-full p-2"
          onClick={onClose}
          aria-label="Minimize"
        >
          <img src={Minimize} alt="minimize-icon" className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

const SavedConfiguration = ({setAddedDetection, addedDetection,Action}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [detectionSettings, setDetectionSettings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalImg, setModalImg] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen,setDeleteModalOpen]=useState(false);
  const [selectedId,setSelectedID]=useState(null);
  const [selectedSetting, setSelectedSetting] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [filters, setFilters] = useState(false);
  const [searchTermValue,setSearchTermValue]=useState("");
  const [nvrNameValue, setNvrNameValue] = useState("");
  const [cameraIdValue, setCameraIdValue] = useState("");
  // const [reFetch,setReFetch]=useState(false);
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAllDetectionDetails(searchTermValue,nvrNameValue,cameraIdValue);
        setDetectionSettings(res?.data?.body?.data?.detectionSettings || []);
        Action?'':setAddedDetection(false);
        setFilters(false);
      } catch (err) {
        setError('Failed to fetch detection settings');
      } finally {
        setLoading(false);
      }
    };
  useEffect(() => {
    fetchData();
  }, [addedDetection, filters]);

  // delete detection settings

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteDetectionSettings(selectedId);
      const status = result?.status;
      const body = result?.data?.body;
      if (status === 200) {
        toast.success(body?.message || "Detection settings deleted successfully");
        fetchData();
        setDeleteModalOpen(false);
      } else {
        toast.error(body?.message || "Something went wrong");
      }
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setDeleting(false);
    }
  };

const handelcancel =()=>{
  setDeleteModalOpen(false)
  setSelectedID(null);
  setDeleting(false);
}
  return (
    <>
      {/* Header Toggle Only */}
      <div className="bg-white rounded-[10px]">
        <div
          className="flex items-center justify-between px-4 py-6 rounded-[10px] bg-[#FAFAFA] cursor-pointer text-xs md:text-sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h2 className="md:text-[20px] select-none text-xs md:text-sm font-medium text-[#333333]">
            Saved Configurations
          </h2>
          {isExpanded ? (
            <ChevronUp className="w-8 h-8 text-[#333333]" />
          ) : (
            <ChevronDown className="w-8 h-8 text-[#333333]" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="bg-[#FAFAFA] p-5 rounded-[10px] text-xs md:text-sm">
         <ConfigSearchControl setFilters={setFilters} setSearchTermValue={setSearchTermValue} setNvrNameValue={setNvrNameValue} setCameraIdValue={setCameraIdValue} />
          {loading ? (
            <div className="space-y-6">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-[8px] sm:rounded-[10px] border border-[#E4E4E7] px-4 sm:px-6 pt-3 sm:pt-4 pb-8 sm:pb-10 space-y-4 sm:space-y-6 mt-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton
                        width={20}
                        height={20}
                        circle
                        className="w-5 h-5 sm:w-6 sm:h-6"
                      />
                      <Skeleton width={120} height={16} className="sm:w-[180px] sm:h-[24px]" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton width={50} height={28} className="sm:w-[70px] sm:h-[32px]" />
                      <Skeleton width={50} height={28} className="sm:w-[70px] sm:h-[32px]" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-y-4 text-sm text-[#333] ml-5">
                    {[...Array(6)].map((_, idx) => (
                      <div key={idx} className="min-w-[140px] sm:min-w-[180px] mr-4 sm:mr-6">
                        <Skeleton width={90} height={12} className="mb-1.5 sm:mb-2 sm:w-[120px] sm:h-[16px]" />
                        <Skeleton width={80} height={14} className="sm:w-[100px] sm:h-[20px]" />
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-200 pt-4 text-sm ml-5">
                    <Skeleton width={140} height={12} className="mb-1.5 sm:mb-2 sm:w-[180px] sm:h-[16px]" />
                    <div className="flex flex-wrap gap-x-4 sm:gap-x-6 pt-1.5 sm:pt-2">
                      {[...Array(2)].map((_, idx) => (
                        <Skeleton key={idx} width={110} height={14} className="sm:w-[140px] sm:h-[18px]" />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center text-red-500 py-8">{error}</div>
          ) : detectionSettings.length === 0 ? (
            <div className="text-center py-8">
              No saved configurations found.
            </div>
          ) : (
           detectionSettings.map((item, idx) => {
          const { detectionSetting, linkedCameras } = item;
          const { name, enabled, detectionName, settings, alerts } = detectionSetting;
          const cameraName = linkedCameras?.map(cam => cam.name || 'N/A').join(', ') || 'N/A';
          const nvrName =[...new Map(linkedCameras ?.filter(cam => cam.nvrId?._id).map(cam => [cam.nvrId._id, cam.nvrId.nvrName || 'N/A'])).values()].join(', ') || 'N/A';
          const channelId = linkedCameras?.map(cam => cam.channelId || '').join(', ') || '';
          const videoResolution = settings?.videoResolution || [];
              return (
                <div
                  key={detectionSetting._id}
                  className="bg-white rounded-[10px] border border-[#E4E4E7] px-6 pt-4 pb-10 space-y-6 mt-2 text-xs md:text-sm"
                >
                  {/* Header Section */}
                  <div className="flex items-center justify-between text-xs md:text-sm">
                    <div className="flex items-center md:gap-3 gap-1">
                      <Checkbox
                        checked={enabled}
                        onCheckedChange={() => {}}
                        className="w-6 h-6 cursor-pointer data-[state=checked]:bg-[#07486A] data-[state=checked]:text-white [&>svg]:w-4 [&>svg]:h-4"
                        disabled
                      />
                      <p className="text-[#07486A] mr-2 text-[9px] md:text-sm lg:text-[16px] font-[400] ">
                        {name} ({detectionName})
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        className="border cursor-pointer hover:bg-black/20 border-[#C9C9C9] rounded-[5px] px-3 py-2 text-xs md:text-sm text-gray-700 flex items-center gap-1"
                        onClick={() => {setEditModalOpen(true),setSelectedSetting(item)}}
                        aria-label="Edit"
                      >
                        <SquarePen className="w-4 h-4" />
                        <span className="hidden md:inline">Edit</span>
                      </button>
                      <button 
                        className="border cursor-pointer hover:bg-black/20 border-[#C9C9C9] rounded-[5px] px-3 py-2 text-xs md:text-sm text-gray-700 flex items-center gap-1"
                        onClick={()=>{setDeleteModalOpen(true),setSelectedID(detectionSetting._id)}}
                        aria-label="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden md:inline">Delete</span>
                      </button>
                    </div>
                  </div>
                  {/* Config Data */}
                  <div className="flex flex-wrap gap-y-4 text-xs md:text-sm text-[#333] ml-5">
                    <div className="min-w-[180px] mr-6">
                      <span className="text-gray-500 text-xs md:text-sm">Setting Name</span>
                      <div className="text-[#333333] font-[400] text-xs md:text-sm">{name}</div>
                    </div>
                    <div className="min-w-[180px] mr-6">
                      <span className="text-[#7A7A7A] text-xs md:text-sm">Incident Video duration</span>
                      <div className="text-[#333333] font-[400] text-xs md:text-sm">
                        {settings?.videoDuration ?? '-'}
                      </div>
                    </div>
                    <div className="min-w-[180px] mr-6">
                      <span className="text-[#7A7A7A] text-xs md:text-sm">Importance</span>
                      <div className="text-[#333333] font-[400] text-xs md:text-sm">
                        {settings?.levelOfImportance ?? '-'}
                      </div>
                    </div>
                    <div className="min-w-[180px] mr-6">
                      <span className="text-[#7A7A7A] text-xs md:text-sm">Selected NVR</span>
                      <div className="text-[#333333] font-[400] text-xs md:text-sm">{nvrName}</div>
                    </div>
                    <div className="min-w-[220px] mr-6">
                      <span className="text-[#7A7A7A] text-xs md:text-sm">Selected Camera</span>
                      <div className="text-[#333333] font-[400] text-xs md:text-sm">
                        {cameraName} 
                        {/* {channelId && `- Channel ${channelId}`} */}
                      </div>
                    </div>
                    {typeof settings?.alertThreshold !== 'undefined' && (
                      <div className="min-w-[180px] mr-6">
                        <span className="text-gray-500 text-xs md:text-sm">Alert Threshold</span>
                        <div className="text-[#333333] font-[400] text-xs md:text-sm">
                          {settings?.alertThreshold}
                        </div>
                      </div>
                    )}
                    {videoResolution.length === 2 && (
                      <>
                        <div className="min-w-[180px] mr-6">
                          <span className="text-gray-500 text-xs md:text-sm">
                            Resolution Width
                          </span>
                          <div className="text-[#333333] font-[400] text-xs md:text-sm">
                            {videoResolution[0]}
                          </div>
                        </div>
                        <div className="min-w-[180px]">
                          <span className="text-gray-500 text-xs md:text-sm">
                            Resolution Height
                          </span>
                          <div className="text-[#333333] font-[400] text-xs md:text-sm">
                            {videoResolution[1]}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Alert Receivers */}
                  <div className="border-t border-gray-200 pt-4 text-xs md:text-sm ml-5">
                    <div className="text-gray-500 mb-1 text-xs md:text-sm">
                      Alert Receivers Email Id/Phone No.
                    </div>
                    <div className="flex flex-wrap gap-x-6 pt-2 text-xs md:text-sm">
                  {alerts && alerts.length > 0 ? (
                      alerts.map((alert, i) => (
                        <div key={alert._id || i} className="min-w-[150px]">
                          <div className="text-[#333333] font-[400] text-xs md:text-sm">
                            {alert.value}
                          </div>
                          <div className="text-[#7A7A7A] font-[400] text-[10px] md:text-xs">
                            {name}
                          </div>
                        </div>
                      ))
                     ) : (
                       <div className="text-[#7A7A7A] font-[400] text-xs mt-1">
                         No receivers
                       </div>
                    )}
                    </div>
                  </div>
                  {/* Area Settings */}
                  {/* <div className="border-t border-gray-200 pt-4 text-sm ml-5">
                    <div className="text-gray-500 mb-2">Area Settings</div>
                    <div className="w-full max-w-[600px] rounded-[10px] overflow-hidden">
                      <div className="relative w-1/2 rounded-[10px] overflow-hidden">
                        <img
                          src={counterimg}
                          alt="Area preview"
                          className="w-full h-auto object-cover rounded-[10px]"
                        />
                        <Button
                          className="absolute cursor-pointer top-2 right-2 bg-white shadow py-2 px-2 rounded-full"
                          title={modalOpen ? 'Minimize' : 'Expand'}
                          onClick={() => {
                            if (modalOpen) {
                              setModalOpen(false);
                            } else {
                              setModalImg(counterimg);
                              setModalOpen(true);
                            }
                          }}
                        >
                          <img
                            src={expand}
                            alt={modalOpen ? 'minimize-icon' : 'expand-icon'}
                            className={`w-5 h-5 text-gray-700 transition-transform duration-200 ${modalOpen ? 'rotate-180' : ''}`}
                          />
                        </Button>
                      </div>
                    </div>
                  </div> */}
                </div>
              );
            })
          )}
          <ImageModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            imgSrc={modalImg}
          />
          <DetectionSettingsModal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} data={selectedSetting} fetchData={fetchData}/>
          <DeleteConfirmation 
            open={deleteModalOpen} 
            icon={<Trash2 className='text-[#595959] h-8 w-8' />} 
            message={"Are you sure you want to delete?"} 
            confirmLabel={"delete"} 
            onClose={handelcancel} 
            onConfirm={handleDelete} 
            loading={deleting}
          />
        </div>
      )}
    </>
  );
};

export default SavedConfiguration;
