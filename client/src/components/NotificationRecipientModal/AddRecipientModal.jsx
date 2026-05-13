import React, { useState, useEffect,useMemo } from 'react';
import { toast } from 'sonner';
import Select from 'react-select';
import codes from 'country-calling-code';
import { useFormik } from 'formik';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  emailValidationSchema,
  phoneValidationSchema,
} from './RecipientValidationSchema'; 
import { getDetectionTypes } from '@/page/user/Settings/Api/get';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Check } from 'lucide-react';

const AddRecipientModal = ({
  open,
  onOpenChange,
  onAddRecipient,
  enablePhoneRecipients,
}) => {
  // const defaultCountry = useMemo(() => {
  //   const found = codes.find((item) => item.isoCode2 === 'IN') || codes[0];
  //   return {
  //     label: `+${found.countryCodes[0]} (${found.country})`,
  //     value: found.countryCodes[0],
  //     country: found.country,
  //     iso2: found.isoCode2.toLowerCase(),
  //   };
  // }, []);
  const found = codes.find((item) => item.isoCode2 === 'IN') || codes[0];
  const defaultCountry = {
  label: `+${found.countryCodes[0]} (${found.country})`,
  value: found.countryCodes[0],
  country: found.country,
  iso2: found.isoCode2.toLowerCase(),
};

  const [showEmail, setShowEmail] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);
  const [detectionTypes, setDetectionTypes] = useState({});
  const [selectedIncidentTypes, setSelectedIncidentTypes] = useState([]);
  const [isTypesOpen, setIsTypesOpen] = useState(false);

  useEffect(() => {
    const fetchTypes = async () => {
      const types = await getDetectionTypes();
      setDetectionTypes(types);
    };
    fetchTypes();
  }, []);

  const getIncidentKey = (detectionKey) => {
    if (detectionKey === 'personalProtectiveEquipmentSettings') return 'personProtectiveEquipment';
    return detectionKey.replace('Settings', '');
  };

  const handleTypeToggle = (key) => {
    const incidentKey = getIncidentKey(key);
    setSelectedIncidentTypes(prev => 
      prev.includes(incidentKey) 
        ? prev.filter(t => t !== incidentKey) 
        : [...prev, incidentKey]
    );
  };

  const formik = useFormik({
  enableReinitialize: true,
  initialValues: {
    fullName: '',
    email: '',
    phonenumber: '',
  },
  validationSchema: () =>
    showEmail
      ? emailValidationSchema
      : phoneValidationSchema(selectedCountry), 
  validateOnChange: true,
  onSubmit: (values) => {
    const type = showEmail ? 'email' : 'phoneNumber';
    const value = showEmail
      ? values.email
      : `+${selectedCountry.value}${values.phonenumber}`;
    
    const resetBoth = () => {
      formik.resetForm();
      setSelectedIncidentTypes([]);
    };

    onAddRecipient(type, value, values.fullName, selectedIncidentTypes, resetBoth);
  },
});


  const handleCheckboxChange = (type) => {
    setShowEmail(type === 'email');
    formik.resetForm();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white rounded-[20px] px-4 py-5 md:px-6 md:py-7 shadow-xl border border-gray-200 w-full max-w-xl max-h-[95vh] overflow-y-auto top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] animate-fade-in animate-fade-in-up"
        
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] md:text-[20px] font-[500] text-[#333333]">
            Add Notification Recipient
          </DialogTitle>
          <p className="text-sm text-[#333333] font-[400] mt-1">
            Choose the communication method and enter contact details.
          </p>
        </DialogHeader>

        <div className="flex flex-row gap-2 md:gap-4 mt-4 md:mt-6">
          <div
            className={`flex items-center gap-2 px-5 py-2.5 rounded-[5px] border cursor-pointer transition-all duration-150 ${
              showEmail
                ? 'bg-[#07486a] border-[#07486a]'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onClick={() => handleCheckboxChange('email')}
          >
            <Checkbox
              id="email"
              checked={showEmail}
              onCheckedChange={() => handleCheckboxChange('email')}
              className={`w-4 h-4 border ${
                showEmail
                  ? 'bg-white border-white text-[#07486a]'
                  : 'border-gray-400'
              }`}
            />
            <label
              htmlFor="email"
              className={`text-sm font-medium cursor-pointer ${
                showEmail ? 'text-white' : 'text-gray-800'
              }`}
            >
              Email
            </label>
          </div>

          {enablePhoneRecipients && (
            <div
              className={`flex items-center gap-2 px-5 py-2.5 rounded-[5px] border cursor-pointer transition-all duration-150 ${
                !showEmail
                  ? 'bg-[#07486a] border-[#07486a]'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onClick={() => handleCheckboxChange('phone')}
            >
              <Checkbox
                id="phone"
                checked={!showEmail}
                onCheckedChange={() => handleCheckboxChange('phone')}
                className={`w-4 h-4 border ${
                  !showEmail
                    ? 'bg-white border-white text-[#07486a]'
                    : 'border-gray-400'
                }`}
              />
              <label
                htmlFor="phone"
                className={`text-sm font-medium cursor-pointer ${
                  !showEmail ? 'text-white' : 'text-gray-800'
                }`}
              >
                Phone
              </label>
            </div>
          )}
        </div>

        {showEmail && (
          <div className="mt-3">
            <div className="flex flex-col gap-1 ">
              <div>
                <label className="block text-sm font-[400] text-[#7A7A7A] mb-1 ml-2">
                  Full Name
                </label>
                <Input
                  type="text"
                  name="fullName"
                  placeholder="e.g. John Doe"
                  value={formik.values.fullName}
                  onChange={formik.handleChange}
                  className="h-11 rounded-[10px] border shadow-none border-gray-300 px-4 text-sm w-full"
                />
                <div className="h-5 mt-1 ml-2 mb-[-6px]">
                  {formik.errors.fullName && (
                    <p className="text-xs text-red-500">{formik.errors.fullName}</p>
                  )}
                </div>
              </div>
              <div className="relative mt-0">
                <label className="block text-sm font-[400] text-[#7A7A7A] mb-1 ml-2">
                  Email Address
                </label>
                <div className="relative">
                  <Input
                    type="email"
                    name="email"
                    placeholder="e.g. michael@globussoft.in"
                    value={formik.values.email}
                    onChange={formik.handleChange}
                    className="h-11.5 w-full pr-24 md:pr-28 rounded-[10px] border border-gray-300 px-4 text-sm shadow-none"
                  />
                  <Button
                    onClick={formik.handleSubmit}
                    className="absolute right-1 top-1 h-9 px-3 md:px-4 text-sm text-white bg-[#07486a] hover:bg-[#07486a]/90 rounded-md cursor-pointer"
                  >
                    Verify
                  </Button>
                </div>
                <div className="h-5 mt-1 ml-2">
                  {formik.errors.email && (
                    <p className="text-xs text-red-500">{formik.errors.email}</p>
                  )}
                </div>
              </div>

              {/* Detection Types Dropdown */}
              <div className="mt-1">
                <label className="block text-sm font-[400] text-[#7A7A7A] mb-1 ml-2">
                  Detection Types
                </label>
                <Popover open={isTypesOpen} onOpenChange={setIsTypesOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="cursor-pointer h-11 w-full flex items-center justify-between rounded-[10px] border border-gray-300 px-4 text-sm shadow-none bg-white hover:bg-white text-left font-[400]"
                    >
                      <span className="truncate">
                        {selectedIncidentTypes.length > 0 
                          ? `${selectedIncidentTypes.length} Types Selected` 
                          : 'Select Detection Types'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-[#7A7A7A] transition-transform duration-200 ${isTypesOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent 
                    align="start" 
                    className="w-[var(--radix-popover-trigger-width)] p-2 bg-white rounded-xl shadow-lg border border-gray-200 z-[100]"
                  >
                    <div 
                      className="space-y-1 max-h-[250px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200"
                      onWheel={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-100 mb-2 sticky top-0 bg-white z-10">
                        <button
                          type="button"
                          onClick={() => {
                            const allKeys = Object.keys(detectionTypes).map(getIncidentKey);
                            setSelectedIncidentTypes(allKeys);
                          }}
                          className="text-[12px] font-medium text-[#07486a] hover:underline cursor-pointer"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedIncidentTypes([])}
                          className="text-[12px] font-medium text-red-500 hover:underline cursor-pointer"
                        >
                          Clear All
                        </button>
                      </div>
                      {Object.entries(detectionTypes).map(([key, label]) => {
                        const incidentKey = getIncidentKey(key);
                        const isChecked = selectedIncidentTypes.includes(incidentKey);
                        return (
                          <div
                            key={key}
                            className="flex items-center space-x-3 px-2.5 py-2 hover:bg-[#F5F5F5] rounded-lg transition-colors cursor-pointer group"
                            onClick={() => handleTypeToggle(key)}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => {}} 
                              className="h-4.5 w-4.5 border-[#C7C7C7] data-[state=checked]:bg-[#07486A] data-[state=checked]:border-[#07486A] data-[state=checked]:text-white"
                            />
                            <span className="text-sm font-[400] text-[#333333] flex-1">
                              {label}
                            </span>
                            {isChecked && <Check className="w-4 h-4 text-[#07486A]" />}
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        )}

        {!showEmail && (
          <div className="mt-1 w-full">
            <div className="flex flex-col gap-1 w-full">
              <div>
                <label className="block text-sm font-[400] text-[#7A7A7A] mb-1 ml-2">
                  Full Name
                </label>
                <Input
                  type="text"
                  name="fullName"
                  placeholder="e.g. John Doe"
                  value={formik.values.fullName}
                  onChange={formik.handleChange}
                  className="h-11 rounded-[10px] border shadow-none border-gray-300 px-4 text-sm w-full"
                />
                <div className="h-5 mt-1 ml-2">
                  {formik.errors.fullName && (
                    <p className="text-xs text-red-500">{formik.errors.fullName}</p>
                  )}
                </div>
              </div>
              <div className="mt-1">
                <label className="block text-sm font-[400] text-[#7A7A7A] mb-1 ml-2">
                  Phone Number
                </label>
                <div className="flex flex-col md:flex-row w-full gap-2">
                  <div className="w-full md:w-auto md:mr-2">
                    <Select
                      options={codes.map((item) => ({
                        label: `+${item.countryCodes[0]} (${item.country})`,
                        value: item.countryCodes[0],
                        country: item.country,
                        iso2: item.isoCode2.toLowerCase(),
                      }))}
                      value={selectedCountry}
                      onChange={setSelectedCountry}
                      name="country_code"
                      placeholder="Code"
                      className="country-select shadow-none"
                      styles={{
                        control: (base) => ({
                          ...base,
                          minHeight: '44px',
                          height: '44px',
                          borderColor: '#d1d5db',
                          borderRadius: '10px',
                          boxShadow: 'none',
                        }),
                        valueContainer: (base) => ({
                          ...base,
                          padding: '0 8px',
                        }),
                        singleValue: (base) => ({
                          ...base,
                          fontSize: '14px',
                        }),
                      }}
                      formatOptionLabel={(e) => (
                        <div className="flex items-center gap-2">
                          <img
                            src={`https://flagcdn.com/w40/${e.iso2}.png`}
                            alt={e.country}
                            className="h-4 w-6 object-cover"
                          />
                          <span className="text-sm">+{e.value}</span>
                        </div>
                      )}
                    />
                  </div>
                  <div className="flex-1 w-full">
                    <div className="relative w-full">
                      <Input
                        type="text"
                        name="phonenumber"
                        placeholder="9876543210"
                        value={formik.values.phonenumber}
                        onChange={(e) => {
                          const onlyNums = e.target.value.replace(/\D/g, '');
                          formik.setFieldValue('phonenumber', onlyNums);
                        }}
                        className="h-11 w-full pr-24 md:pr-28 rounded-[10px] border border-gray-300 px-4 text-sm shadow-none"
                        maxLength={15}
                      />
                      <Button
                        onClick={formik.handleSubmit}
                        className="absolute right-1 top-1 h-9 text-sm px-3 md:px-4 text-white bg-[#07486a] hover:bg-[#07486a]/90 rounded-md cursor-pointer"
                      >
                        Verify
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-5 ml-2 mt-1">
                {formik.errors.phonenumber && (
                  <p className="text-xs text-red-500">{formik.errors.phonenumber}</p>
                )}
              </div>

              {/* Detection Types Dropdown (Phone) */}
              <div className="mt-1">
                <label className="block text-sm font-[400] text-[#7A7A7A] mb-1 ml-2">
                  Detection Types
                </label>
                <Popover open={isTypesOpen} onOpenChange={setIsTypesOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-11 w-full flex items-center justify-between rounded-[10px] border border-gray-300 px-4 text-sm shadow-none bg-white hover:bg-white text-left font-[400]"
                    >
                      <span className="truncate">
                        {selectedIncidentTypes.length > 0 
                          ? `${selectedIncidentTypes.length} Types Selected` 
                          : 'Select Detection Types'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-[#7A7A7A] transition-transform duration-200 ${isTypesOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent 
                    align="start" 
                    className="w-[var(--radix-popover-trigger-width)] p-2 bg-white rounded-xl shadow-lg border border-gray-200 z-[100]"
                  >
                    <div 
                      className="space-y-1 max-h-[250px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200"
                      onWheel={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-100 mb-2 sticky top-0 bg-white z-10">
                        <button
                          type="button"
                          onClick={() => {
                            const allKeys = Object.keys(detectionTypes).map(getIncidentKey);
                            setSelectedIncidentTypes(allKeys);
                          }}
                          className="text-[12px] font-medium text-[#07486a] hover:underline cursor-pointer"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedIncidentTypes([])}
                          className="text-[12px] font-medium text-red-500 hover:underline cursor-pointer"
                        >
                          Clear All
                        </button>
                      </div>
                      {Object.entries(detectionTypes).map(([key, label]) => {
                        const incidentKey = getIncidentKey(key);
                        const isChecked = selectedIncidentTypes.includes(incidentKey);
                        return (
                          <div
                            key={key}
                            className="flex items-center space-x-3 px-2.5 py-2 hover:bg-[#F5F5F5] rounded-lg transition-colors cursor-pointer group"
                            onClick={() => handleTypeToggle(key)}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => {}} 
                              className="h-4.5 w-4.5 border-[#C7C7C7] data-[state=checked]:bg-[#07486A] data-[state=checked]:border-[#07486A] data-[state=checked]:text-white"
                            />
                            <span className="text-sm font-[400] text-[#333333] flex-1">
                              {label}
                            </span>
                            {isChecked && <Check className="w-4 h-4 text-[#07486A]" />}
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-center">
          <Button
            onClick={formik.handleSubmit}
            className="w-32 bg-[#07486a] text-white rounded-full py-4 md:py-6 text-sm font-medium hover:bg-[#07486a]/90 transition-all duration-150 cursor-pointer"
          >
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddRecipientModal;
