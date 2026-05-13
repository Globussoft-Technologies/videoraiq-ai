import React, { use, useEffect } from 'react';
import { useFormikContext } from 'formik';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { Info } from 'lucide-react';
import { NumberInput } from '@/components/ui/number-input';
import { getObjectDetectionList, getStorage } from './Api/get';

const EvidenceSeverityStep = ({ form, setForm }) => {
  const formik = useFormikContext() || {};
  const { errors = {}, touched = {}, setFieldValue } = formik;

  const updateField = (key, value) => {
    if (setFieldValue && typeof setFieldValue === 'function') {
      setFieldValue(key, value);
    } else if (typeof setForm === 'function') {
      if (setForm.length >= 2) {
        try { setForm(key, value); } catch (e) { }
      } else {
        setForm((prev) => ({ ...prev, [key]: value }));
      }
    }
  };
  const [storageOptions, setStorageOptions] = React.useState([]);

  const handlegetStorageList=async ()=>{
    const response = await getStorage();
    setStorageOptions(response?.data?.body?.data?.storages)
  }


  useEffect(() => {
    handlegetStorageList(); 
  }, []);



  return (
    <div className="space-y-2 sm:space-y-3">
      {/* Evidence */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 items-start">
        <div>
          <label className="flex items-center text-xs text-[#7A7A7A] mb-1 ml-1 mt-1">
            Evidence *
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 ml-1 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent className="bg-[#F5F5F5] text-black max-w-[150px] whitespace-normal break-words text-center" arrowClassName="bg-[#F5F5F5] fill-[#F5F5F5]">
                <p className="text-[#333333] font-[400] text-[10px]">Choose what evidence to attach to alerts</p>
              </TooltipContent>
            </Tooltip>
          </label>
          <Select value={form.evidence} onValueChange={(v) => updateField('evidence', v)}>
            <SelectTrigger className="w-full border-[#d1d5db] text-xs h-8 sm:h-10">
              <SelectValue placeholder="Please choose Evidence" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Snapshot">Snapshot</SelectItem>
              <SelectItem value="Video">Video</SelectItem>
              <SelectItem value="None">None</SelectItem>
            </SelectContent>
          </Select>
          {formik.errors.evidence && (
            <div className="text-red-500 text-xs ml-2 mt-1">{formik.errors.evidence}</div>
          )}
        </div>

      
         <div>
{form.evidence === 'Video' &&
<>
  <label className="block text-xs text-[#7A7A7A] ml-2 mb-2">
    Time (Sec) {form.evidence === 'Video' && '*'} 
  </label>
  <NumberInput
    value={form.time || 5}
    onChange={(e) => {
      const v = e.target.value;
      if (formik && typeof formik.setFieldValue === 'function') {
        formik.setFieldValue('time', v);
      } else if (typeof setForm === 'function') {
        if (setForm.length >= 2) {
          try { setForm('time', v); } catch (e) {}
        } else {
          setForm((prev) => ({ ...prev, time: v }));
        }
      }
    }}
    min={1}
    max={1440}
    step={1}
    className="w-full"
  />
  </>}
  {/* Validation Messages */}
  {form.evidence === 'Video' && !form.time && (
    <div className="text-red-500 text-xs ml-2 mt-1">
      Time is required for Video evidence.
    </div>
  )}

  {form.evidence === 'Video' && form.time > 10 && (
    <div className="text-yellow-600 text-xs ml-2 mt-1">
      Your video is more than 10 sec. Consider shortening it.
    </div>
  )}
</div>

  
       <div>
          <label className="flex items-center text-xs text-[#7A7A7A] mb-1 ml-1 mt-1">
           Storage *
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 ml-1 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent className="bg-[#F5F5F5] text-black max-w-[150px] whitespace-normal break-words text-center" arrowClassName="bg-[#F5F5F5] fill-[#F5F5F5]">
                <p className="text-[#333333] font-[400] text-[10px]">Choose what evidence to attach to alerts</p>
              </TooltipContent>
            </Tooltip>
          </label>
          <Select
            value={form.storage || undefined} // make sure undefined if nothing selected
            onValueChange={(v) => updateField('storage', v)}
          >
            <SelectTrigger className="w-full border-[#d1d5db] text-xs h-8 sm:h-10">
              <SelectValue placeholder="Select Storage" />
            </SelectTrigger>
            <SelectContent>
              {storageOptions.map((item) => (
                <SelectItem key={item._id} value={item._id}>
                  {item.name}
                  {/* {item.active ? "(Active)" : "(Inactive)"} */}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {formik.errors.storage && touched.storage && (
            <div className="text-red-500 text-xs ml-2 mt-1">
              {formik.errors.storage}
            </div>
          )}

          {/* {formik.errors.evidence && (
            <div className="text-red-500 text-xs ml-2 mt-1">{formik.errors.evidence}</div>
          )} */}
        </div>

      </div>
    </div>
  );
};

export default EvidenceSeverityStep;
