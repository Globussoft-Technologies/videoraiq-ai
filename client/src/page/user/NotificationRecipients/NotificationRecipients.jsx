// React and third-party libraries
import React, { useState, useEffect } from 'react';
import useDebounce from '@/hooks/useDebounce';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Filter, ListFilterPlus, Search, FilterX } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { useAuth } from '@/context/AuthContext';
import { getRecipients, getDetectionTypes } from '@/page/user/Settings/Api/get';
import { resendMailOrSMS } from '@/page/user/Settings/Api/post';
import { handleAddRecipient } from '@/utils/recipientUtils';
import RecipientList from './RecipientList';
import TelegramAlerts from '@/page/user/Settings/components/TelegramAlerts';
import AddRecipientModal from '@/components/NotificationRecipientModal/AddRecipientModal';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
// import { VerificationModal } from './VerificationModal';

const NotificationRecipients = () => {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.recipients?.view;
  const canCreate = permissions?.recipients?.create;
  const canEdit = permissions?.recipients?.edit;
  const canDelete = permissions?.recipients?.delete;

  if (permissionsLoading) return <PageLoader />;
  if (!canView) {
    return (
      <AccessDenied message="You don't have permission to view Recipients." />
    );
  }

  const [showModal, setShowModal] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState([]);
  const [phoneRecipients, setPhoneRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  // const [updateFetch, setUpdateFetch] = useState(false);
  // const [refetchAfterRemove, setRefecthAfterRemove] = useState(false);
  const navigate = useNavigate();
  const userDetails = useAuth();
  const [enablePhoneRecipients, setEnablePhoneRecipients] = useState(
    userDetails?.user?.enablePhoneRecipients
  );
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [filterValue, setFilterValue] = useState('All');
  const filterValueRef = React.useRef(filterValue);
  const [applyFilter, setApplyFilter] = useState(false);
  // const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [isSuccess, setIsSuccess] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [detectionTypes, setDetectionTypes] = useState({});

  // Fetch detection types once on mount
  useEffect(() => {
    const fetchTypes = async () => {
      const types = await getDetectionTypes();
      setDetectionTypes(types);
    };
    fetchTypes();
  }, []);

  // Update ref whenever filterValue changes
  React.useEffect(() => {
    filterValueRef.current = filterValue;
  }, [filterValue]);

  // (Debounce handled by useDebounce hook)

  const fetchAllRecipients = React.useCallback(async () => {
    setLoading(true);

    try {
      const currentFilterValue = filterValueRef.current;
      const emailPromise = getRecipients(
        'email',
        debouncedSearchTerm,
        currentFilterValue
      );
      const phonePromise = enablePhoneRecipients
        ? getRecipients('phone', debouncedSearchTerm, currentFilterValue)
        : Promise.resolve([]);

      const [emails, phones] = await Promise.all([emailPromise, phonePromise]);

      setEmailRecipients(emails || []);
      setPhoneRecipients(phones || []);
      setApplyFilter(false);
    } catch (err) {
      console.error('Error fetching recipients:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm, enablePhoneRecipients]); // filterValue removed from dependencies

  // Fetch data when debouncedSearchTerm or applyFilter changes
  useEffect(() => {
    fetchAllRecipients();
  }, [debouncedSearchTerm, applyFilter, fetchAllRecipients]);

  const handleDirectVerify = React.useCallback(async (id, type, value) => {
    const data = {
      id: id,
      type: type,
      value: value,
    };
    const result = await resendMailOrSMS(data);
    if (result.status === 'success') {
      toast.success(
        result.message ||
          'A Verification Link has been sent to your email. Please enter it to verify'
      );
      setIsSuccess(true);
      // setShowVerificationModal(true); // Show the modal after verify
    } else {
      setIsSuccess(false);
      // setShowVerificationModal(true);
      toast.error(result.message || 'Fail to send Link');
    }
  }, []);

  return (
    <div className="bg-[#FFFFFF] rounded-[18px] min-h-[100vh]">
      <header>
        <div className="bg-white rounded-[18px] px-4 pt-6 pb-4">
          {/* Telegram channel linking — an incident-alert delivery target,
              alongside the email/phone recipients below. */}
          <div className="mb-4">
            <TelegramAlerts />
          </div>

          {/* Top Section: Headings + Button */}
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between">
            {/* Left: Label + Heading */}
            {/* <div className="mb-4 xl:mb-0">
              <p className="text-sm mb-4 ml-2 text-[#696969] font-normal md:text-[16px]">
                Alert Settings
              </p>
              <h1 className="font-medium ml-2 text-[#333333] md:text-[28px] text-xl">
                Alert Recipients
              </h1>
            </div> */}

            {/* Right: Search and Filter */}
            <div className="flex flex-col gap-2 items-end px-0 mb-0 w-full xl:w-auto">
              {/* <Button
                onClick={() => setShowModal(true)}
                className="text-white cursor-pointer h-10 px-5 text-sm font-medium border-2 border-[#07486a] bg-[#07486A] hover:bg-[#07486A]/90 rounded-[10px] shadow-sm transition-all duration-150"
              >
                Add New
              </Button> */}
              <div className="flex gap-2 w-full xl:w-auto">
                <div className="relative w-full xl:w-[220px]">
                  <Input
                    type="text"
                    placeholder="Search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 w-full font-[400] shadow-none rounded-[10px] border border-[#C7C7C7] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#07486A] pr-10"
                  />
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-[#595959]" />
                </div>
                <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-10 px-3 cursor-pointer rounded-[10px] border border-[#C7C7C7] flex items-center gap-5"
                    >
                      <span className="hidden text-[#595959] font-[400] text-sm sm:inline">
                        Filter
                      </span>
                      <ListFilterPlus className="w-6 h-6 text-[#595959]" />
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent
                    align="end"
                    className="w-62 bg-white border-none rounded-[10px] py-1 px-1 shadow-md"
                  >
                    {/* Buttons row */}
                    <div className="flex items-center font-[400] justify-between gap-5 px-4 py-5">
                      <Button
                        onClick={() => {
                          setApplyFilter(true);
                          setIsFilterOpen(false);
                        }}
                        className="bg-[#07486A] font-[400]  cursor-pointer hover:bg-[#07486A]/90 text-white rounded-lg text-sm  h-8 w-28"
                        size="sm"
                      >
                        Apply
                      </Button>
                      <button
                        onClick={() => {
                          setFilterValue('All');
                          setApplyFilter(true);
                          setIsFilterOpen(false);
                        }}
                        className="text-[#07486A] font-[400] cursor-pointer text-sm hover:bg-gray-100 p-1 rounded-md transition-colors flex items-center gap-1.5"
                        title="Clear Filter"
                      >
                        <FilterX className="w-5 h-5" />
                        <span className="sr-only">Clear Filter</span>
                      </button>
                    </div>

                    {/* Filter section with a top border */}
                    <div className="flex flex-col divide-y divide-[#E5E7EB] px-0 pb-6">
                      <RadioGroup
                        value={filterValue}
                        onValueChange={setFilterValue}
                      >
                        <hr className="w-full border-[#E5E7EB]" />
                        <div className="flex items-center gap-2 py-1 px-4">
                          <RadioGroupItem
                            iconSize="size-3"
                            value="All"
                            id="all"
                            className="cursor-pointer w-5 h-5"
                          />
                          <label htmlFor="all" className="text-sm text-[#333]">
                            All Recipients
                          </label>
                        </div>
                        <hr className="w-full border-[#E5E7EB]" />
                        <div className="flex items-center gap-2 py-2 px-4">
                          <RadioGroupItem
                            iconSize="size-3"
                            value="verified"
                            id="verified"
                            className="cursor-pointer w-5 h-5"
                          />
                          <label
                            htmlFor="verified"
                            className="text-sm text-[#333]"
                          >
                            Verified Recipients
                          </label>
                        </div>
                        <hr className="w-full border-[#E5E7EB]" />
                        <div className="flex items-center gap-2 py-2 px-4">
                          <RadioGroupItem
                            iconSize="size-3"
                            value="unverified"
                            id="unverified"
                            className="cursor-pointer w-5 h-5"
                          />
                          <label
                            htmlFor="unverified"
                            className="text-sm text-[#333]"
                          >
                            Unverified Recipients
                          </label>
                        </div>
                      </RadioGroup>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="py-4 h-full">
        {/* Set a fixed height for the scrollable area */}
        <div
          className={`grid gap-4 px-4 h-full
            grid-cols-1 max-[1140px]:grid-cols-1
            ${/* Second column is commented → force 1 column */ ''}
             `}
        >
          {/* Make grid fill the height */}
          <div className="h-full flex flex-col min-h-[400px]">
            {/* Make column fill height */}
            <RecipientList
              canCreate={canCreate}
              canEdit={canEdit}
              canDelete={canDelete}
              recipients={emailRecipients}
              handleDirectVerify={handleDirectVerify}
              type="email"
              title="All Email ID"
              fetchAllRecipients={fetchAllRecipients}
              loading={loading}
              detectionTypes={detectionTypes}
              emptyMessage={
                searchTerm
                  ? `No results found for "${searchTerm}"`
                  : 'No email data found'
              }
              onAddNew={() => setShowModal(true)}
            />
          </div>

          {/*
    <div className="h-full flex flex-col min-h-[400px]">
      <RecipientList
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        recipients={phoneRecipients}
        handleDirectVerify={handleDirectVerify}
        type="phoneNumber"
        title="All Phone No"
        fetchAllRecipients={fetchAllRecipients}
        loading={loading}
        emptyMessage={
          searchTerm
            ? `No results found for "${searchTerm}"`
            : enablePhoneRecipients
            ? "No phone number data found"
            : "The phone number feature is temporarily unavailable"
        }
        onAddNew={() => setShowModal(true)}
      />
    </div>
    */}
        </div>
      </div>

      <AddRecipientModal
        open={showModal}
        onOpenChange={setShowModal}
        onAddRecipient={(type, value, fullName, incidentTypes, resetForm) =>
          handleAddRecipient(
            type,
            value,
            fullName,
            incidentTypes,
            resetForm,
            setShowModal,
            fetchAllRecipients
          )
        }
        enablePhoneRecipients={enablePhoneRecipients}
      />
      {/* {showVerificationModal && (
        <VerificationModal 
          isSuccess={isSuccess} 
          onClose={() => setShowVerificationModal(false)} 
        />
      )} */}
    </div>
  );
};

export default NotificationRecipients;
