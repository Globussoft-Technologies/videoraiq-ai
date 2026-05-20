import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { createRole } from './Api/post';
import { addRoleSchema } from '@/schema/Role';
import { useFormik } from 'formik';
import { updateRole } from './Api/put';

const AddRoleDialog = ({ trigger, editRole, onSave, onClose, fetchRoles }) => {
  const isEditMode = !!editRole;
  const [open, setOpen] = useState(false);

  const formik = useFormik({
    initialValues: { roles: '', sendEmail: true },
    validationSchema: addRoleSchema,
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      try {
        const roleId = editRole?._id || editRole?.id || null;

        if (isEditMode && roleId) {
          const response = await updateRole(roleId, { roleName: values.roles });

          const success = response?.statusCode === 200 || response?.status === 200 || response?.success === true || response?.body?.success === true;
          const message = response?.body?.message || response?.message || response?.body?.msg || '';

          if (success) {
            if (onSave) {
              onSave(roleId, values.roles);
            }
            toast.success(message || '');
            setOpen(false);
          } else {
            toast.error(message || 'Failed to update role');
          }
        } else {
          const response = await createRole({ roles: [values.roles] });

          const success = response?.statusCode === 200 || response?.status === 200 || response?.success === true || response?.body?.success === true || response?.statusCode === 201;
          const message = response?.body?.message || response?.message || response?.body?.msg || '';

          if (success) {
            toast.success(message || '');
            fetchRoles()
            resetForm();
            setOpen(false);
          } else {
            toast.error(message || 'Failed to create role');
          }
        }
      } catch (err) {
        console.error(err);
        toast.error(err?.response?.data?.message || err?.message || 'Failed to save role');
      } finally {
        setSubmitting(false);
      }
    },
  });

  useEffect(() => {
    if (editRole) {
      formik.setValues({ roles: editRole.name || '', sendEmail: true });
      setOpen(true);
    } else if (!trigger) {
      // Reset when no editRole and no trigger (for programmatic control)
      setOpen(false);
      formik.resetForm();
    }
  }, [editRole, trigger]);

  const handleContinue = async () => {
    const errors = await formik.validateForm();
    if (!errors || Object.keys(errors).length === 0) {
      toast.success('Validated');
    } else {
      toast.error('Please enter role name');
    }
  };

  useEffect(() => {
    if (!open) {
      formik.resetForm();
      // setQuery('');
    }

  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen && onClose) {
        onClose();
      }
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className=" top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] bg-[#F7F8F8] rounded-[12px] w-full max-w-[480px] p-0"
        closeBtn="[_&_svg]:!size-5 sm:!size-6 [&_svg]:!w-5 sm:!w-6 [&_svg]:!h-5 sm:mt-4 mr-3 sm:mr-4"
      >
        <div className=" bg-white rounded-[12px] p-6 shadow-xl border border-gray-200">
          <DialogHeader className="relative pb-0">
            {/* Center the title while keeping the built-in close button on the top-right */}
            <div className="relative">
              <DialogTitle className="text-lg font-semibold text-[#0F1724] absolute left-1/2 transform -translate-x-1/2">
                {isEditMode ? 'Edit Role' : 'Add New Role'}
              </DialogTitle>
            </div>
            {/* keep description space below header so content doesn't overlap with title */}
            <DialogDescription className="text-xs text-[#9E9E9E] mt-8">&nbsp;</DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <label className="text-xs text-[#7A7A7A] mb-2 ml-2 block">Role Name <span className="text-red-500">*</span></label>
            <Input
              type="text"
              name="roles"
              value={formik.values.roles}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className="w-full h-10 rounded-xl border border-[#E6E6E6] shadow-none pl-3"
              placeholder="Enter role name"
            />
            {formik.touched.roles && formik.errors.roles && (
              <div className="text-red-500 text-xs mt-2">{formik.errors.roles}</div>
            )}

            {/* <div className="flex flex-col items-start gap-2 mt-4 py-3 border-t border-[#D9D9D9] ">
              <div className="text-sm text-[#333333]">Send Email</div>
              <Switch
                checked={formik.values.sendEmail}
                onCheckedChange={(v) => formik.setFieldValue('sendEmail', v)}
              />
            </div> */}
          </div>

          {/* <DialogFooter className="mt-2 border-t border-[#D9D9D9]"> */}
          <div className="flex items-center justify-center w-full gap-3 mt-4">
            {/* <button
              type="button"
              onClick={handleContinue}
              className="bg-[#F3F4F6] text-[#6B7280] px-2 py-2 w-[135px]  rounded-[8px] text-sm"
            >
              Continue
            </button> */}

            <button
              type="button"
              onClick={() => formik.handleSubmit()}
              disabled={formik.isSubmitting}
              className="bg-[#07486A] text-white px-2 w-[135px] py-2 rounded-[8px] text-sm cursor-pointer"
            >
              {isEditMode ? 'Update Role' : 'Add Role'}
            </button>
          </div>
          {/* </DialogFooter> */}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddRoleDialog;
