import React, { useEffect, useState } from 'react';
import { useFormikContext } from 'formik';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { authorizedUsers } from '../Dashboard/Api/get';
import MultiSelect from '@/components/ui/multiselect';
import NestedMultiSelect from '@/components/NestedMultiSelect';
import { Info } from 'lucide-react';
import { getObjectDetectionList } from './Api/get';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

const DefaultDetectionStep = ({ form, row, onCancel, onSave }) => {
  const { errors, touched, setFieldValue } = useFormikContext();
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const fetchEmployees = async () => {
      const result = await authorizedUsers(0, 1000, '');
      if (result.body.status === 'success') {
        const newUsers = result.body.data.users || [];
        setEmployees(newUsers);
      }
    };

    fetchEmployees();
  }, []);

  const recipientOptions = employees.map((user) => ({
    id: user._id,
    label: `${user.firstName} ${user.lastName}`,
  }));

  const [options,setOptions]=useState([])
  const mapApiDetectionOptions = (apiData = []) => {
  return apiData
    .filter(item => item?.settingType && Array.isArray(item.objects))
    .map(item => ({
      value: item.settingType,          // used as parent key
      label: item.name || item.settingType,
      objects: item.objects.map(obj => ({
        name: obj,                      // child key
        enabled: false,
        notified: false,
      })),
    }));
};


  const handleGetObjectDetails =async ()=>{
    const response =await getObjectDetectionList()
    setOptions(response?.data?.body?.data ,'response')
      const formattedOptions = mapApiDetectionOptions(response?.data?.body?.data);

  setOptions(formattedOptions);
    
  }

  // console.log(options,'options')

  useEffect(()=>{
handleGetObjectDetails()
  },[])

  // Default backend selection to prefill create form
  const DEFAULT_BACKEND_SELECTION = {
    "personalProtectiveEquipment": [
      { name: 'Helmet', notify: true, enable: true },
      { name: 'Vest', notify: true, enable: true }
    ],
    "crowdDetection": [
      { name: 'Crowd', notify: true, enable: true }
    ]
  };

  const normalizeBackendToNested = (backendData = {}) => {
    if (!backendData || typeof backendData !== 'object') return {};
    const result = {};

    Object.entries(backendData).forEach(([parent, items]) => {
      if (!Array.isArray(items) || items.length === 0) return;

      result[parent] = {
        enabled: true,
        subscribed: false,
        notified: false,
        subcategories: {},
      };

      items.forEach((item) => {
        if (!item || !item.name) return;
        const originalName = item.name;
        const key = originalName.toLowerCase();

        result[parent].subcategories[key] = {
          enabled: Boolean(item.enable),
          subscribed: Boolean(originalName),
          notified: Boolean(item.notify),
          __originalName: originalName,
        };

        if (item.notify) result[parent].notified = true;
        if (originalName) result[parent].subscribed = true;
      });
    });

    return result;
  };

  // Prefill default selection when no selectedObject present
  useEffect(() => {
    if (!options || options.length === 0) return; // wait for options

    const isEmpty = !form.selectedObject || Object.keys(form.selectedObject).length === 0;
    if (isEmpty) {
      const normalized = normalizeBackendToNested(DEFAULT_BACKEND_SELECTION);
      setFieldValue('selectedObject', { objects: DEFAULT_BACKEND_SELECTION });
      // Also pass normalized to nested component if needed
      // we store backend shape in form but NestedMultiSelect reads form.selectedObject as-is
    }
  }, [options, form.selectedObject, setFieldValue]);

  useEffect(() => {
  console.log('Formik selectedObject:', form.selectedObject);
}, [form.selectedObject]);




  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
      {/* Face Authentication Section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal text-[#686868]">
              Enable Face - Authentication
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-4 h-4 text-[#A3A3A3] cursor-pointer" />
              </TooltipTrigger>
              <TooltipContent
                className="bg-[#F5F5F5] text-black max-w-[150px] whitespace-normal break-words text-center"
                arrowClassName="bg-[#F5F5F5] fill-[#F5F5F5]"
              >
                <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                  Enable facial recognition for authentication purposes.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Switch
            checked={!!form.enableFaceAuth}
            onCheckedChange={(v) => {
              setFieldValue('enableFaceAuth', !!v);
              setFieldValue('selectedFaces', []);
            }}
            className="bg-[#07486A] data-[state=unchecked]:bg-gray-200"
          />
        </div>

        {form.enableFaceAuth && (
          <div className="flex flex-col gap-2">
            <label className="text-sm text-[#686868] ml-1">
              Select Identified Faces
            </label>
            <MultiSelect
              options={recipientOptions}
              value={
                Array.isArray(form.selectedFaces)
                  ? form.selectedFaces.map((item) =>
                      typeof item === 'string' ? item : item?._id
                    )
                  : []
              }
              onChange={(newSelected) =>
                setFieldValue(
                  'selectedFaces',
                  Array.isArray(newSelected)
                    ? newSelected
                        .map((item) =>
                          typeof item === 'string' ? item : item?._id
                        )
                        .filter(Boolean)
                    : []
                )
              }
              placeholder="Select Faces"
              searchable={true}
              searchPlaceholder="Search recipients..."
              className="w-full border-[#E5E5E5] rounded-[8px]"
            />
            {errors.selectedFaces && touched.selectedFaces && (
              <div className="text-red-500 text-xs ml-1">
                {errors.selectedFaces}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Object Identification Section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal text-[#686868]">
              Enable Generic Object Identification
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-4 h-4 text-[#A3A3A3] cursor-pointer" />
              </TooltipTrigger>
              <TooltipContent
                className="bg-[#F5F5F5] text-black max-w-[150px] whitespace-normal break-words text-center"
                arrowClassName="bg-[#F5F5F5] fill-[#F5F5F5]"
              >
                <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                  Enable detection for various objects within the video stream.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Switch
            checked={!!form.enableGenericObject}
            onCheckedChange={(v) => {
              setFieldValue('enableGenericObject', !!v);
              setFieldValue('selectedObject', {});
            }}
            className="bg-[#07486A] data-[state=unchecked]:bg-gray-200"
          />
        </div>
        {console.log(form ,'form')}

        {form.enableGenericObject && (
          <div className="flex flex-col gap-2">
            {/* <label className="text-sm text-[#686868] ml-1">
              Select Objects
            </label> */}
            <NestedMultiSelect
              options={options}
              value={form.selectedObject || {}}
              onChange={(val) => setFieldValue('selectedObject', val)}
            />
            {errors.selectedObject && touched.selectedObject && (
              <div className="text-red-500 text-xs ml-1">
                {errors.selectedObject}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Buttons container */}
      <div className="flex items-center justify-center gap-4 mt-8">
        <Button
          variant="outline"
          onClick={onCancel}
          className="w-[140px] bg-[#E5E5E5] text-[#686868] border-none rounded-[8px] h-11 hover:bg-gray-300 transition-colors"
        >
          Cancel
        </Button>
        <Button
          onClick={onSave}
          className="w-[160px] bg-[#07486A] text-white rounded-[8px] h-11 hover:bg-[#063b57] transition-colors"
        >
          {row ? 'Save Profile' : 'Save Profile'}
        </Button>
      </div>
    </div>
  );
};

export default DefaultDetectionStep;
