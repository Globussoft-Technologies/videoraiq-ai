import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import ReactSelect from 'react-select';
import { getNvrNames, getCamerasBasedOnNvr } from '../../Dashboard/Api/get';
import useDebounce from '@/hooks/useDebounce';
import { customStyles } from '../../Streams/Cameraview';

const ConfigSearchControl = ({
  setFilters,
  setSearchTermValue,
  setNvrNameValue,
  setCameraIdValue,
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [nvrId, setNvrId] = useState('');
  const [nvrList, setNvrList] = useState([]);
  const [cameraList, setCameraList] = useState([]);
  const [cameraId, setCameraId] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const fetchNvrNames = async () => {
    setLoading(true);
    try {
      const response = await getNvrNames();
      if (response.statusCode === 200) {
        const nvrs = response.body.data.nvrs;
        setNvrList(nvrs);
      } else {
        console.log('No NVRs found');
      }
    } catch (error) {
      console.error('Error fetching NVR names:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNvrNames();
  }, []);

  useEffect(() => {
    const fetchCameras = async () => {
      if (!nvrId) return;

      setLoading(true);
      try {
        const response = await getCamerasBasedOnNvr(nvrId);
        if (response.statusCode === 200) {
          setCameraList(response?.body?.data?.channels || []);
        } else {
          console.log('No cameras found');
        }
      } catch (error) {
        console.error('Error fetching cameras:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCameras();
  }, [nvrId]);

  const debouncedSearchTerm = useDebounce(searchInput, 500);

  useEffect(() => {
    setSearchTerm(debouncedSearchTerm);
  }, [debouncedSearchTerm]);

  useEffect(() => {
    setFilters(true);
    setSearchTermValue(searchTerm);
    setNvrNameValue(nvrId);
    setCameraIdValue(cameraId);
  }, [searchTerm, nvrId, cameraId]);

  const cameraOptions = cameraList.map((camera) => ({
    value: camera._id,
    label: camera.name,
  }));

  return (
    <div className="flex flex-col md:flex-row items-start gap-3 py-2 rounded-[10px]">
      <div className="relative w-full md:max-w-[240px]">
        <div className="relative">
          <Input
            type="text"
            placeholder="Search"
            className="pl-3 pr-9 h-9 md:h-10 text-xs md:text-sm text-[#595959] font-[400] rounded-[10px] border border-[#C7C7C7] shadow-none w-full"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value.toLowerCase());
            }}
            disabled={loading}
          />
          <Search className="absolute right-3 cursor-pointer top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-[#595959]" />
        </div>
      </div>

      <div className="w-full md:w-auto min-w-[180px] md:min-w-[200px] lg:min-w-[250px]">
        <Select
          onValueChange={(value) => setNvrId(value)}
          value={nvrId}
          disabled={loading}
        >
          <SelectTrigger className="h-9 md:h-10 text-[#595959] cursor-pointer select-none font-[400] rounded-[10px] border border-[#C7C7C7] text-xs md:text-sm">
            <SelectValue placeholder="Select NVR" />
          </SelectTrigger>
          <SelectContent className="text-[#333333] cursor-pointer font-[400] md:text-sm text-xs">
            {loading && nvrList.length === 0 ? (
              <SelectItem className="text-gray-500">Loading...</SelectItem>
            ) : (
              nvrList.map((nvr) => (
                <SelectItem
                  key={nvr._id}
                  value={nvr._id}
                  // className={styles.selectItem}
                >
                  {nvr.nvrName}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full md:w-auto min-w-[180px] md:min-w-[200px] lg:min-w-[250px]">
        <ReactSelect
          value={selectedCamera}
          isMulti={true}
          isDisabled={!nvrId}
          options={cameraOptions}
          onChange={(option) => {
            setSelectedCamera(option);
            const selectedIds = option.map((cam) => cam.value);
            setCameraId(selectedIds);
          }}
          isLoading={loading && cameraList.length === 0}
          placeholder="Select Camera"
          styles={customStyles}
        />
      </div>
    </div>
  );
};

export default ConfigSearchControl;
