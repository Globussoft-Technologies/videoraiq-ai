import React from 'react';
import useDebounce from '@/hooks/useDebounce';
import { removeRecipient } from '../Settings/Api/delete';
import { toast } from 'sonner';
import { Info, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MdOutlineVerified } from 'react-icons/md';
import Delete from '@/assets/Delete.svg';
import ConfirmationModal from '@/page/user/Detection/components/DeleteConfirmation';
import DeleteAddedRecipients from '@/page/user/Detection/components/DeleteAddedRecipients';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { FaRegTrashAlt } from 'react-icons/fa';
import { Inbox, ChevronDown, Check } from 'lucide-react';
import { updateRecipient } from '../Settings/Api/put';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

// Action Button Components
const VerifyButton = React.memo(({ onClick, canEdit }) => {
  return canEdit ? (
    <Button
      onClick={onClick}
      className="bg-[#07486A] text-white px-3 h-8 rounded-[5px] hover:bg-[#07486A]/90 flex items-center"
    >
      <span className="px-2 cursor-pointer xl:text-xs 2xl:text-sm font-[400]">
        Verify
      </span>
    </Button>
  ) : null;
});

export const VerifiedBadge = React.memo(() => (
  <div className="flex items-center border border-[#575757] text-[#575757] px-3 h-8 rounded-[5px] xl:text-xs 2xl:text-sm font-[400] gap-1">
    Verified
    <MdOutlineVerified className="w-4 h-4 text-[#575757]" />
  </div>
));

const DeleteButton = React.memo(({ onClick }) => (
  <button
    onClick={onClick}
    className="p-1 h-8 flex items-center justify-center cursor-pointer rounded-[5px] border border-[#C41717] text-[#C41717] hover:bg-[#C41717] hover:text-white"
  >
    <Trash2 className="w-4.5 h-4.5" />
  </button>
));

// Detection Type Dropdown Component
const IncidentTypeDropdown = ({ recipient, detectionTypes, fetchAllRecipients, canEdit }) => {
  const [updating, setUpdating] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const selectedTypes = recipient?.incidentTypes || [];

  // Helper to map detection setting keys to incident type keys
  const getIncidentKey = (detectionKey) => {
    if (detectionKey === 'personalProtectiveEquipmentSettings') return 'personProtectiveEquipment';
    return detectionKey.replace('Settings', '');
  };

  const handleToggle = async (detectionKey) => {
    if (!canEdit) return;
    setUpdating(true);
    const incidentKey = getIncidentKey(detectionKey);
    let newTypes;
    if (selectedTypes.includes(incidentKey)) {
      newTypes = selectedTypes.filter(t => t !== incidentKey);
    } else {
      newTypes = [...selectedTypes, incidentKey];
    }

    try {
      const result = await updateRecipient(recipient._id, { incidentTypes: newTypes });
      if (result.status === 'success') {
        toast.success('Detection type updated successfully');
        await fetchAllRecipients();
      } else {
        toast.error('Failed to update detection');
      }
    } catch (err) {
      toast.error('Failed to update detection');
    } finally {
      setUpdating(false);
    }
  };

  const handleSelectAll = async () => {
    if (!canEdit || updating) return;
    setUpdating(true);
    const allKeys = Object.keys(detectionTypes).map(getIncidentKey);
    try {
      const result = await updateRecipient(recipient._id, { incidentTypes: allKeys });
      if (result.status === 'success') {
        toast.success('Detection types updated successfully');
        await fetchAllRecipients();
      }
    } catch (err) {
      toast.error('Failed to update detection types');
    } finally {
      setUpdating(false);
    }
  };

  const handleClearAll = async () => {
    if (!canEdit || updating) return;
    setUpdating(true);
    try {
      const result = await updateRecipient(recipient._id, { incidentTypes: [] });
      if (result.status === 'success') {
        toast.success('Detection types cleared successfully');
        await fetchAllRecipients();
      }
    } catch (err) {
      toast.error('Failed to update detection types');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={!canEdit}
          className="h-8 px-2 flex items-center gap-1 border-[#C7C7C7] text-[#595959] hover:bg-gray-50 bg-white"
        >
          <span className="text-xs font-[400] text-[#575757]">
            {selectedTypes.length > 0 ? `${selectedTypes.length} Selected` : 'Detection'}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[240px] p-2 bg-white rounded-xl shadow-lg border border-gray-100">
        <div className="space-y-1">
          <div className="px-2 py-1.5 mb-1 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#07486A]">Detection Types</span>
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleSelectAll();
                }}
                disabled={updating}
                className="text-[10px] font-medium text-[#07486a] hover:underline cursor-pointer"
              >
                Select All
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleClearAll();
                }}
                disabled={updating}
                className="text-[10px] font-medium text-red-500 hover:underline cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto pr-1">
            {Object.entries(detectionTypes).map(([key, label]) => {
              const incidentKey = getIncidentKey(key);
              const isChecked = selectedTypes.includes(incidentKey);
              return (
                <div
                  key={key}
                  className="flex items-center space-x-3 px-2.5 py-2 hover:bg-[#F5F5F5] rounded-lg transition-colors cursor-pointer group"
                  onClick={(e) => {
                    e.preventDefault();
                    if (!updating) handleToggle(key);
                  }}
                >
                  <Checkbox
                    id={`${recipient._id}-${key}`}
                    checked={isChecked}
                    onCheckedChange={() => {}} // Controlled by parent div
                    disabled={updating}
                    className="h-4.5 w-4.5 border-[#C7C7C7] data-[state=checked]:bg-[#07486A] data-[state=checked]:border-[#07486A] data-[state=checked]:text-white"
                  />
                  <div
                    className="text-[13px] font-[400] text-[#414141] cursor-pointer flex-1 select-none"
                  >
                    {label}
                  </div>
                  {isChecked && <Check className="w-3.5 h-3.5 text-[#07486A]" />}
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Table Header Component
const TableHeader = React.memo(({ type }) => (
  <div className="hidden sm:grid bg-[#F5F5F5] rounded-[10px] grid-cols-3 text-[#333333] 2xl:text-sm xl:text-xs font-[500] mb-2 px-4 py-2 items-center">
    <div>Name</div>
    <div>{type === 'email' ? 'Email ID' : 'Phone No'}</div>
    <div className="flex items-center justify-end">Action</div>
  </div>
));

// Desktop Row Content
const DesktopView = React.memo(({ recipient, type, onVerify, onRemove, canEdit, canDelete, detectionTypes, fetchAllRecipients }) => (
  <div className="hidden sm:grid sm:grid-cols-3 sm:items-center sm:gap-4">
    <div className="text-sm text-[#414141] font-[500] flex items-center gap-1 truncate">
      {recipient?.fullName || ''}
    </div>
    <div className="text-xs font-[500] text-[#414141] truncate">
      {recipient?.value || ''}
    </div>
      <div className="flex text-xs items-center justify-end gap-2">
      {recipient?.verified ? (
        <VerifiedBadge />
      ) : (
        <VerifyButton onClick={onVerify} canEdit={canEdit}/>
      )}
      <IncidentTypeDropdown
        recipient={recipient}
        detectionTypes={detectionTypes}
        fetchAllRecipients={fetchAllRecipients}
        canEdit={canEdit}
      />
      {canDelete && <DeleteButton onClick={onRemove} />}
    </div>
  </div>
));

// Mobile Row Content
const MobileView = React.memo(({ recipient, type, onVerify, onRemove, canEdit, canDelete, detectionTypes, fetchAllRecipients }) => (
  <div className="flex flex-col gap-3 sm:hidden">
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs text-[#7A7A7A] mb-1">Name</div>
        <div className="text-sm text-[#414141] font-[500] truncate">
          {recipient?.fullName || ''}
        </div>
      </div>
      <div className="flex text-xs items-center gap-2 ml-2">
        {recipient?.verified ? (
          <VerifiedBadge />
        ) : (
          <VerifyButton onClick={onVerify} canEdit={canEdit} />
        )}
        <IncidentTypeDropdown
          recipient={recipient}
          detectionTypes={detectionTypes}
          fetchAllRecipients={fetchAllRecipients}
          canEdit={canEdit}
        />
        {canDelete && <DeleteButton onClick={onRemove} />}
      </div>
    </div>
    <div>
      <div className="text-xs text-[#7A7A7A] mb-1">
        {type === 'email' ? 'Email ID' : 'Phone No'}
      </div>
      <div className="text-xs font-[500] text-[#414141] truncate">
        {recipient?.value || ''}
      </div>
    </div>
  </div>
));

// Inline Delete Confirmation Modal
const DeleteConfirmation = ({ open, onClose, onConfirm, message }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-lg p-8 w-[90vw] max-w-xs flex flex-col items-center">
        <div className="mb-4 flex items-center bg-[#F5F5F5] rounded-full p-3 justify-center">
         <img src={Delete} alt="delete icon" className="w-8 h-8" />
        </div>
        <div className="text-center 2xl:text-[20px] xl:text-base font-medium mb-8">
          {message}
        </div>
        <div className="flex gap-1 justify-center w-full">
          <button
            className="px-6 cursor-pointer py-2 rounded-full text-gray-700 hover:bg-gray-100 transition"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-6 py-2 cursor-pointer font-[400] rounded-full bg-[#07486A] text-white hover:bg-[#07486A]/90 transition"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// Skeleton rows for loading state
const RecipientListSkeleton = ({ count }) => (
  <>
    {[...Array(count)].map((_, idx) => (
      <div key={idx} className="bg-[#F5F5F5] p-4 rounded-[8px] mb-2">
        {/* Desktop Skeleton */}
        <div className="hidden sm:grid sm:grid-cols-3 sm:items-center sm:gap-4">
          <div>
            <Skeleton height={20} width={120} />
          </div>
          <div>
            <Skeleton height={16} width={140} />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Skeleton height={32} width={80} borderRadius={5} />
            <Skeleton height={32} width={32} borderRadius={5} />
          </div>
        </div>
        {/* Mobile Skeleton */}
        <div className="flex flex-col gap-3 sm:hidden">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton height={16} width={60} className="mb-1" />
              <Skeleton height={20} width={120} />
            </div>
            <div className="flex items-center gap-2 ml-2">
              <Skeleton height={32} width={80} borderRadius={5} />
              <Skeleton height={32} width={32} borderRadius={5} />
            </div>
          </div>
          <div>
            <Skeleton height={16} width={60} className="mb-1" />
            <Skeleton height={16} width={140} />
          </div>
        </div>
      </div>
    ))}
  </>
);

const RecipientList = ({ 
  title, 
  recipients, 
  handleDirectVerify, 
  type, 
  fetchAllRecipients, 
  loading = false, 
  emptyMessage,
  onAddNew,
  canCreate,
  canEdit,
  canDelete,
  detectionTypes = {}
}) => {
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [deleteAddedRecipientsOpen, setDeleteAddedRecipientsOpen] = React.useState(false);
  const [recipientToDelete, setRecipientToDelete] = React.useState(null);
  const [deleting, setDeleting] = React.useState(false);
  // Used debounce hook to prevent flickering of loading state
  const stableLoading = useDebounce(loading, 400);
  const skeletonCount = recipients.length || 0;

  //  React.useEffect(() => {
  //   if (loading) {
  //     // Show loading immediately
  //     setStableLoading(true);
  //   } else {
  //     // Delay hiding loading state to prevent flickering
  //     const timer = setTimeout(() => {
  //       setStableLoading(false);
  //     }, 400); // Match the 700ms debounce from parent
  //     return () => clearTimeout(timer);
  //   }
  // }, [loading]);

  const handleRemove = React.useCallback(async (value) => {
    setDeleting(true);
    const removeType = type === 'email' ? 'emailToRemove' : 'phoneToRemove';
    const data = { [removeType]: value };

    const result = await removeRecipient(data);
    if (result.status === 'success') {
      fetchAllRecipients();
      toast.success(result.message || 'Recipient deleted successfully');
    } else {
      toast.error(result.message || 'Something went wrong');
    }
    setDeleting(false);
  }, [type, fetchAllRecipients]);

  const openDeleteModal = React.useCallback((recipient) => {
    setRecipientToDelete(recipient);
    if (recipient?.verified) {
      setDeleteAddedRecipientsOpen(true);
    } else {
      setDeleteModalOpen(true);
    }
  }, []);

  const closeDeleteModal = React.useCallback(() => {
    setDeleteModalOpen(false);
    setDeleteAddedRecipientsOpen(false);
    setRecipientToDelete(null);
    setDeleting(false);
  }, []);

  const confirmDelete = React.useCallback(async () => {
    if (recipientToDelete) {
      await handleRemove(recipientToDelete.value);
      closeDeleteModal();
    }
  }, [recipientToDelete, handleRemove, closeDeleteModal]);

  // Always use consistent height to prevent layout shift
  return (
    <div
      className="bg-[#FAFAFA] rounded-[10px] p-5 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent h-full overflow-y-auto relative flex flex-col"
    >
      {/* Section Heading and Add Button */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="2xl:text-sm xl:text-xs font-[500] text-[#7A7A7A] ml-2">
          {title}
        </h3>
        {canCreate && (
          <Button
            onClick={onAddNew}
            disabled={type === 'phoneNumber'}
            className='text-white h-7 px-3 cursor-pointer text-xs font-medium border border-[#07486a] bg-[#07486A] rounded-[8px] shadow-sm transition-all duration-150 md:h-8 md:px-4 2xl:text-sm'
          >
            Add New
          </Button>
        )}
      </div>

      {/* Table Header - Hide on mobile */}
      <TableHeader type={type} />

      {/* Content area with flex-1 to take remaining height */}
      <div className="flex-1 flex flex-col">
        {/* Debounced loading state to prevent flickering */}
        {stableLoading ? (
          recipients.length === 0 ? (
           null
          ) : (
            <RecipientListSkeleton count={skeletonCount} />
          )
        ) : recipients.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500">
            {emptyMessage && (
              <>
                <Inbox className="w-12 h-12 text-gray-400 mb-4" />
                <p className="text-sm text-gray-500">{emptyMessage}</p>
              </>
            )}
          </div>
        ) : (
          recipients.map((recipient) => (
            <div
              key={recipient?._id}
              className="bg-[#F5F5F5] p-4 rounded-[8px] mb-2"
            >
              {/* Desktop View */}
              <DesktopView
                canEdit={canEdit}
                canDelete={canDelete}
                recipient={recipient}
                type={type}
                onVerify={() => handleDirectVerify(recipient?._id, type, recipient.value)}
                onRemove={() => openDeleteModal(recipient)}
                detectionTypes={detectionTypes}
                fetchAllRecipients={fetchAllRecipients}
              />

              {/* Mobile View */}
              <MobileView
                recipient={recipient}
                type={type}
                onVerify={() => handleDirectVerify(recipient?._id, type, recipient.value)}
                onRemove={() => openDeleteModal(recipient)}
                canEdit={canEdit}
                canDelete={canDelete}
                detectionTypes={detectionTypes}
                fetchAllRecipients={fetchAllRecipients}
              />
            </div>
          ))
        )}
      </div>
      <ConfirmationModal
        open={deleteModalOpen}
        message={recipientToDelete ? `Are you sure you want to delete ${recipientToDelete.fullName || recipientToDelete.value}?` : 'Are you sure you want to delete?'}
        icon={<FaRegTrashAlt className='h-7 text-[#595959] w-7' />}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmClass="bg-[#07486A] text-white hover:bg-[#07486A]/90"
        loading={deleting}
      />
      <DeleteAddedRecipients
        open={deleteAddedRecipientsOpen}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        loading={deleting}
        data={recipientToDelete ? [recipientToDelete] : []}
      />
    </div>
  
    );
};

export default React.memo(RecipientList);
