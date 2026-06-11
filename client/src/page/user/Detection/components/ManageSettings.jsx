import React, { useState, useEffect, useRef } from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChevronDownIcon,
  CheckIcon,
  TrashIcon,
  X,
  Loader2,
  Info,
} from 'lucide-react';
import AddRecipientModal from '@/components/NotificationRecipientModal/AddRecipientModal';
import { getNvrWithChannels, getRecipientsData } from '../Api/get';
import AlertReceiversSection from './AlertReceiversSection';
import { addNewDetectionConfiguration } from '../Api/post';
import { handleAddRecipient } from '@/utils/recipientUtils';
import { DetectionSettingsFormSchema } from '@/components/DetectionSettingsFormSchema';
import SelectAuthorisedUsers from '@/components/SelectAuthorisedUsers';
import { useFormik } from 'formik';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import AreaSettingsPreview from './AreaSettingsPreview';
import { updateDetectionSettings } from '../Api/put';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import DetectionSettingsFormSkeleton from './DetectionSettingsFormSkeleton'; // Import the skeleton loader component
import { removeRecipient } from '../../Settings/Api/delete';
import ConfirmationModal from './DeleteConfirmation';
import { FaRegTrashAlt } from 'react-icons/fa';
import useOnClickOutside from '@/hooks/useOnClickOutside'; // Import the new hook
import DeleteAddedRecipients from './DeleteAddedRecipients';
export default function DetectionSettingsForm({
  selectedType,
  heading, // <-- Add heading prop
  editData,
  onClose,
  fetchData,
  setIsExpanded,
  setSelectedType,
  isExpanded,
  fetchDetectionTypes,
  setAddedDetection,
  isModal,
}) {
  const [selectedCameras, setSelectedCameras] = useState([]);
  const [selectedReceivers, setSelectedReceivers] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isReceiversDropdownOpen, setIsReceiversDropdownOpen] = useState(false);
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState(null);
  const [nvrList, setNvrList] = useState([]);
  const [selectedNvrId, setSelectedNvrId] = useState('');
  // Separate loading states for NVR and Recipients
  const [nvrLoading, setNvrLoading] = useState(false);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [cameraList, setCameraList] = useState([]);
  const [recipientsList, setRecipientsList] = useState([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [recipientToDelete, setRecipientToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [skipRecipients, setSkipRecipients] = useState(0);
  const [limitRecipients, setLimitRecipients] = useState(10);
  const [activeCamera, setActiveCamera] = useState(null); 
  const [videoResolution, setVideoResolution] = useState([]);
  const [referencePoints, setReferencePoints] = useState(
    editData?.detectionSetting?.settings?.referencePoints || {}
  );
  const previewRef = useRef();
  useEffect(() => {
    if (editData?.detectionSetting?.settings?.referencePoints) {
      setReferencePoints(editData.detectionSetting.settings.referencePoints);
    }
  }, [editData]);

  // Ref for camera dropdown
  const cameraDropdownRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [deleteAddedRecipientsOpen, setDeleteAddedRecipientsOpen] =
    useState(false);
  // Close camera dropdown on outside click
  useOnClickOutside(cameraDropdownRef, () => setIsDropdownOpen(false));

  useEffect(() => {
    if (editData?.detectionSetting) {
      const alerts = editData.detectionSetting.alerts || [];
      setRecipientsList(alerts);

      setSelectedReceivers(
        alerts.map((receiver) => ({
          id: receiver._id,
          email: receiver.value,
          name: receiver.fullName,
          verified: receiver.verified,
        }))
      );
    }
  }, [editData]);


  // Fetch NVRs and channels on mount
  useEffect(() => {
    async function fetchNvrs() {
      setNvrLoading(true);
      try {
        const res = await getNvrWithChannels(selectedType);
        let nvrs = [];
        if (res?.data?.body?.status === 'success') {
          nvrs = res?.data?.body?.data?.nvrs || [];
          setNvrList(nvrs);
        }
        if (nvrs.length > 0) {
          const firstNvr = nvrs[0];
          setSelectedNvrId(firstNvr._id);
          formik.setFieldValue('NVRId', firstNvr._id);
          // formik.setFieldValue('NVRId', firstNvr._id); // optional: for pre-fill
          setCameraList(firstNvr.channels || []);
        }
      } catch (err) {
        console.log('Error fetching NVRs:', err);
        setNvrList([]);
        setCameraList([]);
      } finally {
        setNvrLoading(false);
      }
    }
    fetchNvrs();
  }, [selectedType]);

  async function fetchRecipients(newSkip) {
    if (loading || !hasMore) return;
    setLoading(true);

    try {
      const recipientsResp = await getRecipientsData(newSkip, limitRecipients);
      if (recipientsResp?.data?.body?.status === 'success') {
        const recipients = recipientsResp?.data?.body?.data?.alerts || [];
        // Append or set based on skip
        setRecipientsList((prev) =>
          newSkip === 0 ? recipients : [...prev, ...recipients]
        );
        // If fewer than limit received, we reached the end
        if (recipients.length < limitRecipients) {
          setHasMore(false);
        }
      }
    } catch (err) {
      console.log('Error fetching recipients:', err);
      setRecipientsList([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  // Fetch recipients on mount
  useEffect(() => {
    fetchRecipients(skipRecipients);
  }, [skipRecipients, limitRecipients]);


  // Update camera list when NVR changes
  useEffect(() => {
    const nvr = nvrList.find((n) => n._id === selectedNvrId);
    setCameraList(nvr ? nvr.channels : []);
    setSelectedCameras([]); // Optionally clear selected cameras on NVR change
  }, [selectedNvrId, nvrList]);

  // Select All cameras function
  const handleSelectAllCameras = () => {
    setSelectedCameras(
      cameraList.map((camera) => ({ id: camera._id, name: camera.name }))
    );
  };

  // Clear All cameras function
  const handleClearAllCameras = () => {
    setSelectedCameras([]);
  };

  // Select All receivers function
  const handleSelectAllReceivers = () => {
    setSelectedReceivers(
      recipientsList
        .filter((receiver) => receiver.verified === true)
        .map((receiver) => ({
          id: receiver._id,
          email: receiver.value,
          name: receiver.fullName,
          verified: receiver.verified,
        }))
    );
  };

  // Clear All receivers function
  const handleClearAllReceivers = () => {
    setSelectedReceivers([]);
  };

  const handleCameraToggle = (cameraId, isChecked) => {
  if (isChecked) {
    // Remove camera
    const updatedChannels = formik.values.channelId.filter(id => id !== cameraId);
    formik.setFieldValue("channelId", updatedChannels);

    if (activeCamera === cameraId) {
      // pick next available if removed active
      setActiveCamera(updatedChannels.length > 0 ? updatedChannels[0] : null);
    }
  } else {
    // Add camera
    const updatedChannels = [...formik.values.channelId, cameraId];
    formik.setFieldValue("channelId", updatedChannels);

    if (!activeCamera) {
      setActiveCamera(cameraId); // first selected becomes active
    }
  }
};

  // Use shared handleAddRecipient from utils
  const handleAddRecipientModal = (type, value, fullName, resetForm) => {
    handleAddRecipient(
      type,
      value,
      fullName,
      resetForm,
      setShowRecipientModal,
      fetchRecipients
    );
  };

  const handleEditRecipient = (recipient) => {
    setEditingRecipient(recipient);
    setShowRecipientModal(true);
  };

  const handleRemoveRecipient = async (value, type) => {
    setIsDeleting(true);
    const removeType = type === 'email' ? 'emailToRemove' : 'phoneToRemove';
    const data = { [removeType]: value };
    try {
      const result = await removeRecipient(data);
      if (result.status === 'success') {
        fetchRecipients(skipRecipients);
        editData ? fetchData() : '';
        toast.success(result.message || 'Recipient deleted successfully');
      } else {
        toast.error(result.message || 'Something went wrong');
      }
    } catch (error) {
      toast.error('Failed to delete recipient');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleVerifyRecipient = (receiverId) => {
    setSelectedReceivers((prev) =>
      prev.map((rec) =>
        rec.id === receiverId ? { ...rec, verified: true } : rec
      )
    );
  };

  // Handle checkbox change
  const handleCameraSelection = (cameraId, cameraName) => {
    setSelectedCameras((prev) => {
      const exists = prev.some((cam) => cam.id === cameraId);
      if (exists) {
        return prev.filter((cam) => cam.id !== cameraId);
      } else {
        return [...prev, { id: cameraId, name: cameraName }];
      }
    });
  };
  // Handle receivers checkbox change
  const handleReceiverSelection = (receiverId, receiverEmail, receiverName) => {
    setSelectedReceivers((prev) => {
      const exists = prev.some((rec) => rec.id === receiverId);
      if (exists) {
        return prev.filter((rec) => rec.id !== receiverId);
      } else {
        return [
          ...prev,
          { id: receiverId, email: receiverEmail, name: receiverName },
        ];
      }
    });
  };

  // Toggle dropdowns
  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  const toggleReceiversDropdown = () => {
    setIsReceiversDropdownOpen((prev) => !prev);
  };



  const initialValues = {
    name: editData?.detectionSetting?.name || '',
    settingType: selectedType || '',
    channelId: editData?.linkedCameras?.map((cam) => cam._id) || [],
    NVRId: editData?.linkedCameras?.[0]?.nvrId?._id || selectedNvrId,
    enabled: editData?.detectionSetting?.enabled ?? true,
    alerts: editData?.detectionSetting?.alerts?.map((a) => a._id) || [],
    settings: {
      imageRequired:
        editData?.detectionSetting?.settings?.imageRequired || false,
      videoDuration: editData?.detectionSetting?.settings?.videoDuration
        ? String(editData.detectionSetting.settings.videoDuration)
        : '5',
      levelOfImportance:
        editData?.detectionSetting?.settings?.levelOfImportance || 'moderate',
      authorisedUsers:
        editData?.detectionSetting?.settings?.authorisedUsers || [],
    },
  };

  const formik = useFormik({
    initialValues,
    validationSchema: DetectionSettingsFormSchema,
    validateOnChange: true,
    validateOnBlur: true,
    enableReinitialize: true,

    onSubmit: async (values, { setSubmitting, resetForm }) => {
      setSubmitting(true);
      const result = previewRef.current?.saveSettings();

      try {
        const alerts = selectedReceivers.map((rec) => rec.id);

        const payload = {
          ...values,
          alerts,
          settings: {
            ...values.settings,
            videoResolution: result?.resolution,
            referencePoints: result?.referencePoints,
            authorisedUsers: values.settings.authorisedUsers || [],
          },
        };

        const isEdit = !!editData?.detectionSetting?._id;

        let response;

        if (isEdit) {
          response = await updateDetectionSettings(
            editData.detectionSetting._id,
            payload
          );
        } else {
          response = await addNewDetectionConfiguration(payload);
        }

        const resData = response?.data?.body;
        if (resData?.status === 'success') {
          toast.success(
            resData?.message ||
            (isEdit ? 'Updated successfully' : 'Added successfully')
          );

          if (isEdit) {
            onClose();
            fetchData();
          } else {
            resetForm();
            setSelectedReceivers([]);
            setSelectedType('');
            setIsExpanded(!isExpanded);
            setAddedDetection(true);
          }
        } else {
          toast.error(resData?.message || 'Failed to save configuration');
        }
      } catch (error) {
        console.error('Error during submission:', error);
      } finally {
        setSubmitting(false);
      }
    },
  });

  // console.log('formik :', formik);

  // Keep Formik alerts in sync with selectedReceivers
  useEffect(() => {
    formik.setFieldValue(
      'alerts',
      selectedReceivers.map((rec) => rec.id)
    );
  }, [selectedReceivers]);

  //    useEffect(() => {
  //   if (setSubmitFn) {
  //     setSubmitFn(() => formik.submitForm);
  //   }
  // }, [formik, setSubmitFn]);

  const handleSelectAll = (e) => {
    e.stopPropagation();
    // Select only cameras that don't have hasSetting = true
    const selectableIds = cameraList
      .filter((cam) => !cam.hasSetting)
      .map((cam) => cam._id);

    formik.setFieldValue('channelId', selectableIds);
  };
  useEffect(() => {
    if (editData?.detectionSetting) return;
    const selectedNvr = nvrList.find((nvr) => nvr._id === selectedNvrId);
    const availableCameras = selectedNvr?.channels || [];
    setCameraList(availableCameras);
    // Automatically select first camera that is not disabled
    const firstAvailableCamera = availableCameras.find(
      (cam) => !cam.hasSetting
    );
    if (firstAvailableCamera) {
      formik.setFieldValue('channelId', [firstAvailableCamera._id]);
    } else {
      formik.setFieldValue('channelId', []); // If none available
    }
  }, [selectedNvrId, selectedType, nvrList]);

  // Show skeleton loader when any data is being loaded
  if (nvrLoading || recipientsLoading) {
    return <DetectionSettingsFormSkeleton />;
  }
  //  delete functionality

  const openDeleteModal = (recipient) => {
    setRecipientToDelete(recipient);
    if (recipient?.verified) {
      setDeleteAddedRecipientsOpen(true);
    } else {
      setDeleteModalOpen(true);
    }
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeleteAddedRecipientsOpen(false);
    setRecipientToDelete(null);
  };

  const confirmDelete = () => {
    if (recipientToDelete) {
      handleRemoveRecipient(recipientToDelete.value, recipientToDelete.type);
    }
    closeDeleteModal();
  };

  return (
    <form
      onSubmit={formik.handleSubmit}
      className="bg-[#FAFAFA] py-2 px-4 md:py-2 md:px-6 rounded-b-[8px] sm:rounded-b-[10px]w-full text-[10px] md:text-xs xl:text-sm"
    >
      <div className=" mt-2 mr-4 z-40">
        {heading && heading !== '' && (
          <h2 className="text-[#07486A] text-[11px] sm:text-xs md:text-sm xl:text-sm 2xl:text-lg font-[500] px-1 py-0.5 sm:py-1">
            {heading}
          </h2>
        )}
      </div>
      {/* Section 1: Settings Section */}
      <div className="bg-[#F5F5F5] p-6 rounded-[10px] space-y-6 text-xs md:text-sm">
        {/* Switches */}
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <label
              htmlFor="enabled"
              className="flex items-center text-xs md:text-sm font-[400] text-[#333333]"
            >
              Detection Enabled
            </label>
            <Switch
              id="enabled"
              name="enabled"
              checked={formik.values.enabled}
              onCheckedChange={(v) => formik.setFieldValue('enabled', v)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label
              htmlFor="video-link"
              className="text-xs md:text-sm font-[400] text-[#333333] flex items-center"
            >
              Incident Image
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent
                  className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
                  arrowClassName="bg-white fill-white"
                >
                  <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                    Enable this if an incident image is mandatory
                  </p>
                </TooltipContent>
              </Tooltip>
            </label>
            <Switch
              id="video-link"
              name="settings.imageRequired"
              checked={formik.values.settings.imageRequired}
              onCheckedChange={(v) =>
                formik.setFieldValue('settings.imageRequired', v)
              }
            />
          </div>
        </div>

        {/* Setting Name */}
        <div>
          <label
            htmlFor="setting-name"
            className="flex items-center mb-2 ml-2 text-xs md:text-sm text-[#333333] font-[400]"
          >
            Setting Name
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent
                className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
                arrowClassName="bg-white fill-white"
              >
                <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                  Define the settings name here
                </p>
              </TooltipContent>
            </Tooltip>
          </label>
          <Input
            id="setting-name"
            name="name"
            value={formik.values.name}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            placeholder="Enter a Descriptive name"
            className="text-xs md:text-sm bg-[#F5F5F5] focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none border border-[#80808059] rounded-[10px] shadow-none"
          />{' '}
          {formik.touched.name && formik.errors.name && (
            <div className="text-red-500 text-xs mt-1 ml-2">
              {formik.errors.name}
            </div>
          )}
        </div>

        {/* Importance / Threshold */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center mb-2 ml-2 text-xs md:text-sm text-[#333333] font-[400]">
              Incident Video duration (sec)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent
                  className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
                  arrowClassName="bg-white fill-white"
                >
                  <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                    The duration of the recorded video clip for each incident.
                  </p>
                </TooltipContent>
              </Tooltip>
            </label>
            <Select
              value={formik.values.settings.videoDuration}
              onValueChange={(v) =>
                formik.setFieldValue('settings.videoDuration', v)
              }
              name="settings.videoDuration"
            >
              <SelectTrigger className="text-xs md:text-sm py-3 cursor-pointer text-[#686868] font-[400] bg-[#F5F5F5] border border-[#80808059] rounded-[10px] shadow-none">
                <SelectValue placeholder="5" />
              </SelectTrigger>
              <SelectContent className="bg-[#F5F5F5] border border-[#80808059] text-[#686868] font-[400]">
                <SelectItem
                  className="text-[#686868] cursor-pointer font-[400] text-xs md:text-sm"
                  value="5"
                >
                  5
                </SelectItem>
                <SelectItem
                  className="text-[#686868] cursor-pointer font-[400] text-xs md:text-sm"
                  value="15"
                >
                  15
                </SelectItem>
                <SelectItem
                  className="text-[#686868] cursor-pointer font-[400] text-xs md:text-sm"
                  value="20"
                >
                  20
                </SelectItem>
                <SelectItem
                  className="text-[#686868] cursor-pointer font-[400] text-xs md:text-sm"
                  value="60"
                >
                  60
                </SelectItem>
              </SelectContent>
            </Select>{' '}
            {formik.touched.settings?.videoDuration &&
              formik.errors.settings?.videoDuration && (
                <div className="text-red-500 text-xs mt-1 ml-2">
                  {formik.errors.settings.videoDuration}
                </div>
              )}
          </div>
          <div>
            <label className="flex items-center mb-2 ml-2 text-xs md:text-sm text-[#333333] font-[400]">
              Sensitivity of Incident
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent
                  className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
                  arrowClassName="bg-white fill-white"
                >
                  <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                    The sensitivity level for detecting incidents.
                  </p>
                </TooltipContent>
              </Tooltip>
            </label>
            <Select
              value={formik.values.settings.levelOfImportance}
              onValueChange={(v) =>
                formik.setFieldValue('settings.levelOfImportance', v)
              }
              name="settings.levelOfImportance"
            >
              <SelectTrigger className="text-xs md:text-sm py-3 cursor-pointer text-[#686868] font-[400] bg-[#F5F5F5] border border-[#80808059] rounded-[10px] shadow-none">
                <SelectValue placeholder="Moderate" />
              </SelectTrigger>
              <SelectContent className="bg-[#F5F5F5] border border-[#80808059] text-[#686868] font-[400]">
                <SelectItem
                  className="text-[#686868] cursor-pointer font-[400] text-xs md:text-sm"
                  value="low"
                >
                  Low
                </SelectItem>
                <SelectItem
                  className="text-[#686868] cursor-pointer font-[400] text-xs md:text-sm"
                  value="moderate"
                >
                  Moderate
                </SelectItem>
                <SelectItem
                  className="text-[#686868] cursor-pointer font-[400] text-xs md:text-sm"
                  value="high"
                >
                  High
                </SelectItem>
              </SelectContent>
            </Select>{' '}
            {formik.touched.settings?.levelOfImportance &&
              formik.errors.settings?.levelOfImportance && (
                <div className="text-red-500 text-xs mt-1 ml-2">
                  {formik.errors.settings.levelOfImportance}
                </div>
              )}
          </div>
        </div>

        {/* Importance / Threshold */}

        {/* <div>
            <label className="block  mb-2 ml-2 text-sm text-[#7A7A7A] font-[400]">
              Alert Threshold
            </label>
            <Input
              defaultValue="0"
              className="text-sm focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none bg-[#F5F5F5] py-2 text-[#686868] font-[400] border border-[#80808059] rounded-[10px] shadow-none"
            />
          </div> */}
        {/* Resolution */}
        {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block mb-2 ml-2 text-sm text-[#7A7A7A] font-[400]">
              Resolution Width
            </label>
            <Input
              defaultValue="1280"
              className="text-sm focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none bg-[#F5F5F5] py-2 text-[#686868] font-[400] border border-[#80808059] rounded-[10px] shadow-none"
            />
          </div>
          <div>
            <label className="block mb-2 ml-2 text-sm text-[#7A7A7A] font-[400] ">
              Resolution Height
            </label>
            <Input
              defaultValue="720"
              className="text-sm focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none bg-[#F5F5F5] py-2 text-[#686868] font-[400] border border-[#80808059] rounded-[10px] shadow-none"
            />
          </div>
        </div> */}

        {/* Camera & NVR Selection - Unified Label */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-1 md:col-span-2">
            <label className="flex items-center text-xs md:text-sm text-[#333333] font-[400] ml-2">
              Choose Camera Settings
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent
                  className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
                  arrowClassName="bg-white fill-white"
                >
                  <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                    Select the NVR and cameras for this setting.
                  </p>
                </TooltipContent>
              </Tooltip>
            </label>
          </div>
          <div>
            {/* NVR Dropdown - no label here */}
            <Select
              value={formik.values.NVRId}
              onValueChange={(v) => {
                formik.setFieldValue('NVRId', v);
                setSelectedNvrId(v);
              }}
              name="NVRId"
            >
              <SelectTrigger className="text-[10px] sm:text-xs md:text-sm cursor-pointer py-2 sm:py-3 px-2 sm:px-3 text-[#686868] font-[400] bg-[#F5F5F5] border border-[#80808059] rounded-[8px] sm:rounded-[10px] shadow-none min-h-[36px] sm:min-h-[42px]">
                {formik.values.NVRId ? (
                  <Badge className="bg-gray-800 text-white px-1 sm:px-1.5 py-0.5 flex items-center gap-0.5 sm:gap-1 rounded-[3px] sm:rounded-[4px] text-[10px] sm:text-xs truncate max-w-[150px] sm:max-w-[200px]">
                    {nvrList.find((nvr) => nvr._id === formik.values.NVRId)
                      ?.name ?? ''}
                  </Badge>
                ) : (
                  <SelectValue placeholder="Select NVR" />
                )}
              </SelectTrigger>
              <SelectContent className="bg-[#F5F5F5] border border-[#80808059] text-[#686868] font-[400] text-xs md:text-sm">
                {nvrList?.map((nvr) => (
                  <SelectItem
                    key={nvr._id}
                    value={nvr._id}
                    className="text-xs md:text-sm cursor-pointer"
                  >
                    {nvr?.name ?? ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formik.touched.NVRId && formik.errors.NVRId && (
              <div className="text-red-500 text-xs mt-1 ml-2">
                {formik.errors.NVRId}
              </div>
            )}
          </div>
          <div>
            {/* Camera Dropdown - no label here */}
            <div className="relative z-1" ref={cameraDropdownRef}>
              {/* <Tooltip content={!formik.values.NVRId ? 'Please select NVR' : ''}> */}
              <div
                onClick={formik.values.NVRId ? toggleDropdown : undefined}
                className={`camera-dropdown-toggle min-h-[36px] sm:min-h-[42px] w-full px-2 sm:px-3 py-2 sm:py-3 text-[10px] sm:text-xs md:text-sm bg-[#F5F5F5] text-[#686868] font-[400] border border-[#80808059] rounded-[8px] sm:rounded-[10px] shadow-none flex flex-wrap gap-1.5 sm:gap-2 items-center ${!formik.values.NVRId ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {formik.values.channelId.length > 0 ? (
                  cameraList
                    .filter((cam) => formik.values.channelId.includes(cam._id))
                    .map((cam) => (
                      <Badge
                        key={cam._id}
                        className="bg-gray-800 text-white px-1.5 sm:px-2 py-0.5 sm:py-1 flex items-center gap-0.5 sm:gap-1 rounded-[3px] sm:rounded-[5px] text-[10px] sm:text-xs"
                      >
                        {cam.name}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCameraToggle(cam._id, true); // removing
                          }}
                          className="ml-1 hover:bg-[#07486A] rounded-full p-0.5"
                        >
                          <X className="h-3 w-3 cursor-pointer text-white" />
                        </button>
                      </Badge>
                    ))
                ) : (
                  <span className="text-[#686868] text-xs md:text-sm">
                    Choose Camera
                  </span>
                )}
              </div>
              {/* </Tooltip> */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronDownIcon className="h-4 w-4 opacity-50" />
              </div>
              <div
                id="camera-dropdown"
                className={`absolute top-full left-0 w-full mt-1 bg-[#F5F5F5] border border-[#80808059] rounded-[10px] shadow-md z-50 ${isDropdownOpen && formik.values.NVRId ? '' : 'hidden'}`}
              >
                {/* {formik.values.NVRId && (
                  <> */}
                <div className="flex justify-between items-center p-2 border-b border-[#80808059]">
                  <button
                    type="button"
                    onClick={(e) => handleSelectAll(e)}
                    className="text-[#07486A] cursor-pointer text-xs md:text-sm font-medium hover:underline flex items-center gap-1"
                  >
                    <CheckIcon className="h-3 w-3" />
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      formik.setFieldValue('channelId', []);
                    }}
                    className="text-[#C41717] cursor-pointer text-xs md:text-sm font-medium hover:underline flex items-center gap-1"
                  >
                    <TrashIcon className="h-3 w-3" />
                    Clear All
                  </button>
                </div>
                <div className="p-2 max-h-36 overflow-y-auto flex flex-row flex-wrap gap-2 text-xs md:text-sm">
                  {cameraList?.map((camera) => {
                    const isChecked = formik.values.channelId.includes(
                      camera._id
                    );
                    const isDisabled = camera?.hasSetting != formik.values.channelId.includes(camera._id);
                    const cameraLabel = (
                      <div
                        key={camera._id}
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-[#E5E5E5] ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                      >
                        <Checkbox
                          id={camera._id}
                          checked={isChecked}
                          disabled={isDisabled}
                          onCheckedChange={() => handleCameraToggle(camera._id, isChecked)}
                          className=" data-[state=checked]:bg-[#07486A] cursor-pointer data-[state=checked]:text-white"
                        />
                        <label
                          htmlFor={camera?._id}
                          className="text-xs md:text-sm text-[#686868] font-[400] cursor-pointer flex-1"
                        >
                          {camera?.name ?? ''}
                        </label>
                      </div>
                    );
                    return isDisabled ? (
                      <Tooltip key={camera._id}>
                        <TooltipTrigger asChild>{cameraLabel}</TooltipTrigger>
                        <TooltipContent
                          className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
                          arrowClassName="bg-white fill-white"
                        >
                          <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                            This camera already has a setting
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      cameraLabel
                    );
                  })}
                </div>
                {/* </>
                )} */}
              </div>
              {formik.touched.channelId && formik.errors.channelId && (
                <div className="text-red-500 text-xs mt-1 ml-2">
                  {formik.errors.channelId}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Inline always-visible video preview like dashboard */}
        {formik.values.channelId.length > 0 && (
          <>
            <label className="flex items-center ml-2 text-[#333333] font-[400] text-xs md:text-sm">
              Area Settings
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent
                  className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
                  arrowClassName="bg-white fill-white"
                >
                  <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                    Define the area for detection.
                  </p>
                </TooltipContent>
              </Tooltip>
            </label>
            <AreaSettingsPreview
              ref={previewRef}
              selectedType={selectedType}
              cameraList={cameraList}
              selectedChannelIds={formik.values.channelId}
              activeCamera={activeCamera}
              isModal={isModal}
              onAreaSettingsChange={(resolution, points) => {
                setVideoResolution(resolution);
                setReferencePoints(points);
              }}
              initialReferencePoints={
                editData?.detectionSetting?.settings?.referencePoints
              }
              detectionSettingName={formik.values.name}
            />
          </>
        )}
      </div>

      {/* Select Authorised Users Multi-Select */}
      {(
        selectedType === 'unauthorizedAccessSettings' ||
        selectedType === 'lineCrossingSettings' ||
        selectedType === 'loiteringWithAuthSettings'
        // selectedType === 'countPersonsSettings'
        // editData?.detectionSetting
      ) && (
          <div className="mt-4">
            <SelectAuthorisedUsers
              value={formik.values.settings.authorisedUsers || []}
              onChange={(ids) =>
                formik.setFieldValue('settings.authorisedUsers', ids)
              }
            />
            {formik.touched.settings?.authorisedUsers &&
              formik.errors.settings?.authorisedUsers && (
                <div className="text-red-500 text-xs mt-1 ml-2">
                  {formik.errors.settings.authorisedUsers}
                </div>
              )}
          </div>
        )}

      {/* Section 2: Alert Receivers */}
      <AlertReceiversSection
        selectedReceivers={selectedReceivers}
        setSelectedReceivers={setSelectedReceivers}
        recipientsList={recipientsList}
        isReceiversDropdownOpen={isReceiversDropdownOpen}
        setIsReceiversDropdownOpen={setIsReceiversDropdownOpen}
        showRecipientModal={showRecipientModal}
        setShowRecipientModal={setShowRecipientModal}
        handleAddRecipient={handleAddRecipient}
        handleEditRecipient={handleEditRecipient}
        openDeleteModal={openDeleteModal}
        deleteAddedRecipientsOpen={deleteAddedRecipientsOpen}
        setDeleteAddedRecipientsOpen={setDeleteAddedRecipientsOpen}
        // handleRemoveRecipient={handleRemoveRecipient}
        handleVerifyRecipient={handleVerifyRecipient}
        handleSelectAllReceivers={handleSelectAllReceivers}
        handleClearAllReceivers={handleClearAllReceivers}
        handleReceiverSelection={handleReceiverSelection}
        setSkipRecipients={setSkipRecipients}
        setLimitRecipients={setLimitRecipients}
        limitRecipients={limitRecipients}
        skipRecipients={skipRecipients}
        fetchRecipients={fetchRecipients}
        error={formik.touched.alerts && formik.errors.alerts}
        hasMore={hasMore}
        loading={loading}
      />

      {/* Footer Buttons */}
      {/* { !editData ?(  */}
      <div className="flex justify-center gap-2 md:gap-4 py-3 md:pt-4">
        {!editData ? (
          <Button
            type="button"
            variant="outline"
            className="border-[#07486A] cursor-pointer px-4 sm:px-7 py-1.5 sm:py-2 h-9 sm:h-12 text-[#07486A] rounded-[20px] sm:rounded-[32px] hover:bg-[#07486A] hover:text-white text-[11px] sm:text-sm flex items-center gap-1.5"
            onClick={() => {
              formik.resetForm();
              // setSelectedType('');
              setSelectedReceivers([]);
              toast.info('Form has been reset');
            }}
          >
            <span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 sm:w-5 sm:h-5"
              >
                <path d="M22 12C22 17.523 17.523 22 12 22C6.477 22 2 17.523 2 12C2 6.477 6.477 2 12 2V4C10.0845 4.00022 8.23272 4.6877 6.78115 5.93749C5.32958 7.18727 4.37462 8.9164 4.08983 10.8106C3.80504 12.7048 4.20934 14.6382 5.22923 16.2596C6.24912 17.881 7.81691 19.0826 9.64763 19.646C11.4783 20.2095 13.4505 20.0974 15.2055 19.3301C16.9606 18.5628 18.3821 17.1913 19.2117 15.4648C20.0413 13.7382 20.2239 11.7714 19.7262 9.9217C19.2286 8.07199 18.0839 6.46223 16.5 5.385V8H14.5V2H20.5V4H18C19.2425 4.93093 20.251 6.13866 20.9453 7.52734C21.6397 8.91601 22.0008 10.4474 22 12Z" />
              </svg>
            </span>
            Reset
          </Button>
        ) : (
          <button
            onClick={onClose}
            className="px-4 sm:px-6 py-1.5 sm:py-2 cursor-pointer font-[400] rounded-[20px] sm:rounded-[32px] bg-transparent text-[#333333] hover:bg-gray-300 transition text-[11px] sm:text-sm h-9 sm:h-12"
          >
            Close
          </button>
        )}

        <Button
          type="submit"
          className="bg-[#07486A] cursor-pointer py-1.5 sm:py-2 px-6 sm:px-10 h-9 sm:h-12 hover:bg-[#07486A]/80 rounded-[20px] sm:rounded-[32px] text-white flex items-center justify-center gap-1.5 sm:gap-2 min-w-[90px] sm:min-w-[110px] text-[11px] sm:text-sm"
          disabled={formik.isSubmitting}
        >
          {formik.isSubmitting ? (
            <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
          ) : editData ? (
            'Save Changes'
          ) : (
            'Add'
          )}
        </Button>
      </div>
      {/*):('') */}
      {/* } */}

      {/* Add Recipient Modal */}
      <AddRecipientModal
        open={showRecipientModal}
        onOpenChange={(open) => setShowRecipientModal(open)}
        onAddRecipient={handleAddRecipientModal}
      />
      <ConfirmationModal
        open={deleteModalOpen}
        message={
          recipientToDelete
            ? `Are you sure you want to delete ${recipientToDelete.fullName || recipientToDelete.value}?`
            : 'Are you sure you want to delete?'
        }
        icon={<FaRegTrashAlt className="h-7 text-[#595959] w-7" />}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmClass="bg-[#07486A] text-white hover:bg-[#07486A]/90"
        loading={isDeleting}
      />
      <DeleteAddedRecipients
        open={deleteAddedRecipientsOpen}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        loading={isDeleting}
        data={recipientToDelete ? [recipientToDelete] : []}
      // recipient={recipients}
      />
    </form>
  );
}
