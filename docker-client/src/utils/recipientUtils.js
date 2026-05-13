import { toast } from 'sonner';
import { createAlert } from '@/page/user/Settings/Api/post';

/**
 * Shared handler to add a recipient and refresh the list.
 * @param {string} type - 'email' or 'phoneNumber'
 * @param {string} value - The email or phone value
 * @param {string} fullName - The recipient's name
 * @param {function} resetForm - (optional) Form reset callback
 * @param {function} setShowModal - (optional) Modal close callback
 * @param {function} fetchAllRecipients - (optional) Refetch recipients callback
 */
export const handleAddRecipient = async (
  type,
  value,
  fullName,
  incidentTypes,
  resetForm,
  setShowModal,
  fetchAllRecipients
) => {
  // Validate required parameters
  if (!type || !value || !fullName) {
    throw new Error('type, value, and fullName are required parameters');
  }
  const data = { type, value, fullName, incidentTypes };
  try {
    const response = await createAlert(data);
    if (response.statusCode === 200) {
      if (setShowModal) setShowModal(false);
      if (fetchAllRecipients) fetchAllRecipients();
      if (resetForm) resetForm();
      toast.success(response?.body?.message || 'Recipient added successfully');
    } else {
      toast.error(response?.body?.message || 'Something went wrong');
    }
  } catch (error) {
    console.error('Error adding recipient:', error);
    toast.error('Error adding recipient');
  }
};
