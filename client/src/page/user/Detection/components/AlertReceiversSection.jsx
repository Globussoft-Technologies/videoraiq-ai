import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDownIcon,
  BadgeCheck,
  CheckIcon,
  TrashIcon,
  Trash2,
  X,
  SquarePen,
  ShieldCheck,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/Tooltip';
import { VerifiedBadge } from '../../NotificationRecipients/RecipientList';
import { useNavigate } from 'react-router-dom';
const AlertReceiversSection = ({
  selectedReceivers,
  setSelectedReceivers,
  recipientsList,
  isReceiversDropdownOpen,
  setIsReceiversDropdownOpen,
  showRecipientModal,
  setShowRecipientModal,
  handleAddRecipient,
  handleEditRecipient,
  // handleRemoveRecipient,
  handleVerifyRecipient,
  handleSelectAllReceivers,
  handleClearAllReceivers,
  handleReceiverSelection,
  openDeleteModal,
  error,
  setSkipRecipients,
  setLimitRecipients,
  limitRecipients,
  skipRecipients,
  fetchRecipients,
  hasMore,
  loading,
  setDeleteAddedRecipientsOpen,
}) => {
  const [isOpeningModal, setIsOpeningModal] = useState(false);
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  // Toggle receivers dropdown
  const toggleReceiversDropdown = () => {
    setIsReceiversDropdownOpen((prev) => !prev);
  };

  const dropdownRef = useRef(null);

  // Close dropdown on Escape key
  useEffect(() => {
    if (!isReceiversDropdownOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsReceiversDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isReceiversDropdownOpen, setIsReceiversDropdownOpen]);

  const handleOpenModal = () => {
    setIsOpeningModal(true);
    setShowRecipientModal(true);
  };

  // useEffect to handle scroll event for pagination
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 20;

      if (isNearBottom && !loading && hasMore) {
        const newSkip = skipRecipients + limitRecipients;
        setSkipRecipients(newSkip); // update internal skip
        fetchRecipients(newSkip); // fetch more
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [scrollRef, skipRecipients, limitRecipients, hasMore, loading]);

  return (
    <div
      className="bg-[#F5F5F5] px-6 py-5 rounded-[10px] space-y-3 text-xs md:text-sm"
      ref={dropdownRef}
    >
      <div className="flex justify-between items-center">
        <label className="2xl:text-[16px] xl:text-sm text-[#7A7A7A] font-[400] ml-2 text-[11px] md:text-sm">
          Alert Receivers Email Id/Phone No
        </label>
        {/* <Button
          type='button'
          variant="outline"
          onClick={handleOpenModal}
          className="h-7 sm:h-8 px-3 sm:px-4 py-1 sm:py-2 text-[11px] sm:text-xs cursor-pointer border-[#07486A] bg-[#07486A] hover:bg-[#07486A]/90 text-white rounded-[4px] sm:rounded-[6px] whitespace-nowrap"
        >
          Add New
        </Button> */}
      </div>{' '}
      {error && (
        <div className="text-red-500 text-xs md:text-sm ml-2 mb-2">{error}</div>
      )}{' '}
      <div className="relative mb-5">
        <div className="relative">
          <div
            className="min-h-[42px] w-full overflow-hidden px-3 py-2 text-xs md:text-sm bg-[#F5F5F5] text-[#686868] font-[400] border border-[#80808059] rounded-[10px] shadow-none cursor-pointer flex flex-wrap items-center gap-2"
            onClick={toggleReceiversDropdown}
          >
            {selectedReceivers.length > 0 ? (
              selectedReceivers.map((rec) => (
                <Badge
                  key={rec.id}
                  className="bg-gray-800 text-white px-1.5 flex items-center gap-0.5 sm:gap-1 rounded-[4px] sm:rounded-[5px] text-[10px] sm:text-xs"
                >
                  <span className="truncate max-w-[150px] sm:max-w-none">
                    {rec.name ? `${rec.email} (${rec.name})` : rec.email}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent dropdown toggle
                      handleReceiverSelection(rec.id); // Remove this recipient
                    }}
                    className="ml-0.5 sm:ml-1 hover:bg-[#07486A] text-[#07486A] hover:text-white rounded-full p-0.5"
                  >
                    <X className="h-2.5 w-2.5 sm:h-3 sm:w-3 cursor-pointer text-white" />
                  </button>
                </Badge>
              ))
            ) : (
              <span className="text-[#686868] text-xs md:text-sm">
                Select Recipients
              </span>
            )}
          </div>

          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronDownIcon className="h-4 w-4 opacity-50" />
          </div>
        </div>
        <div
          id="receivers-dropdown"
          className={`absolute top-full left-0 w-full mt-1 bg-[#FAFAFA] select-none border border-[#80808059] rounded-[10px] shadow-md z-1 ${isReceiversDropdownOpen ? '' : 'hidden'}`}
        >
          {/* Dropdown heading on top left */}
          <div className="flex justify-start items-center px-2 pt-2 pb-0">
            <span className="text-xs md:text-sm text-[#7A7A7A] font-medium px-2 py-1 rounded-md">
              Email Id/Phone No.
            </span>
          </div>
          <div className="flex justify-between items-center p-2 border-b border-[#80808059]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectAllReceivers();
              }}
              className="text-[#07486A] cursor-pointer text-xs md:text-sm font-medium hover:underline flex items-center gap-1"
            >
              <CheckIcon className="h-3 w-3" />
              Select All
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClearAllReceivers();
              }}
              className="text-[#C41717] cursor-pointer text-xs md:text-sm font-medium hover:underline flex items-center gap-1"
            >
              <TrashIcon className="h-3 w-3" />
              Clear All
            </button>
          </div>
          <div
            ref={scrollRef}
            className="md:p-2 max-h-48 md:max-h-92 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 text-xs md:text-sm"
          >
            {recipientsList
              .filter((receiver) => receiver.verified === true)
              .map((receiver) => (
                <div
                  key={receiver._id}
                  className="flex flex-col justify-start md:justify-center md:flex-row md:items-center gap-2 p-2 hover:bg-[#E5E5E5] rounded-md cursor-pointer text-xs md:text-sm"
                >
                  <div
                    className="flex flex-row items-center gap-2 w-full text-xs md:text-sm cursor-pointer"
                    onClick={(e) => {
                      // prevent double-trigger if checkbox was clicked
                      if (e.target.type !== 'checkbox') {
                        handleReceiverSelection(
                          receiver._id,
                          receiver.value,
                          receiver.fullName
                        );
                      }
                    }}
                  >
                    <Checkbox
                      id={receiver._id}
                      checked={selectedReceivers.some(
                        (rec) => rec.id === receiver._id
                      )}
                      onCheckedChange={() =>
                        handleReceiverSelection(
                          receiver._id,
                          receiver.value,
                          receiver.fullName
                        )
                      }
                      className="data-[state=checked]:bg-[#07486A] data-[state=checked]:text-white cursor-pointer"
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <p className="text-xs md:text-sm text-[#333333] font-[400] flex items-center gap-1">
                        {receiver.value}
                        {receiver.verified && (
                          <BadgeCheck className="h-4 w-4 md:hidden inline-flex text-green-500" />
                        )}
                      </p>
                      <span className="text-[10px] md:text-xs text-[#999999] font-[400]">
                        {receiver.fullName}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4">
                    {receiver.verified ? (
                      <>
                        {/* <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditRecipient({
                            id: receiver._id,
                            email: receiver.value,
                            name: receiver.fullName,
                            verified: receiver.verified,
                          });
                        }}
                        className="text-[#07486A] py-2 px-2 rounded-[5px] border border-[#07486A] cursor-pointer text-sm font-[400] hover:bg-[#07486A] hover:text-white flex items-center gap-1"
                        aria-label="Edit"
                      >
                        <SquarePen className="h-4 w-4 md:hidden" />
                        <span className="hidden md:inline">Edit</span>
                      </button> */}
                        <span className="hidden md:inline">
                          <VerifiedBadge />
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteModal(receiver);
                          }}
                          className="text-[#C41717]  md:py-2 md:px-2 py-1 px-1 rounded-[5px] border border-[#C41717] hover:bg-[#C41717] hover:text-white cursor-pointer text-sm font-[400] flex items-center gap-1"
                          aria-label="Remove"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                          {/* <TrashIcon className="h-4 w-4 md" /> */}
                          {/* <span className="hidden md:inline">Remove</span> */}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/notification-recipients');
                          }}
                          className="text-[#FAFAFA] font-[400] py-1 px-1 md:py-2 md:px-2 rounded-[5px] bg-[#07486A] cursor-pointer text-sm hover:bg-[#07486A]/90 flex items-center gap-1"
                          aria-label="Verify"
                        >
                          <ShieldCheck className="h-4 w-4 " />
                          <span className="px-1">Verify</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteModal(receiver);
                          }}
                          className="text-[#C41717] md:py-2 md:px-2 py-1 px-1 rounded-[5px] border border-[#C41717] hover:bg-[#C41717] hover:text-white cursor-pointer text-sm font-[400] flex items-center gap-1"
                          aria-label="Remove"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                          {/* <TrashIcon className="h-4 w-4 md" /> */}
                          {/* <span className="hidden md:inline">Remove</span> */}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlertReceiversSection;
