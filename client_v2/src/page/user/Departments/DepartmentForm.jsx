import React, { useState, useRef } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createDepartment, updateDepartment } from "./Api";

const DepartmentForm = ({
  trigger,
  initialValues = null,
  mode = "create",
  onSave,
}) => {
  const [open, setOpen] = useState(false);

  const schema = Yup.object().shape({
    departmentName: Yup.string()
      .required("Department name is required")
      .max(100, "Department name cannot exceed 100 characters"),
    description: Yup.string().max(255, "Description cannot exceed 255 characters"),
  });

  const formik = useFormik({
    initialValues: {
      departmentName: initialValues?.departmentName || "",
      description: initialValues?.description || "",
      empDepartmentId: initialValues?.empDepartmentId || "",
      isActive: initialValues?.isActive ?? true,
      isImportedFromEMP: initialValues?.isImportedFromEMP ?? false,
      softDelete: initialValues?.softDelete ?? false,
    },
    validationSchema: schema,
    validateOnBlur: false,
    validateOnChange: false,
    onSubmit: async (values, helpers) => {
      try {
        const payload = {
            ...values,
            empDepartmentId: values.empDepartmentId ? parseInt(values.empDepartmentId) : null,
        };
        if (mode === "create") {
          const response = await createDepartment(payload);

          if (response?.data?.statusCode === 200) {
            toast.success(response?.data?.body?.message || "Department created successfully");
            // Try to extract created item from response, fall back to payload with no _id
            const serverData = response?.data?.body?.data || response?.data?.body || response?.data;
            const item = serverData?.data || serverData || { ...payload };
            if (initialValues?._id) item._id = initialValues._id;
            if (onSave) onSave({ local: true, item, mode: 'create' });
            setOpen(false);
          }
          else{
            toast.error(response?.data?.body?.message || "Failed to create department");
          }
        } else {
          const response = await updateDepartment(initialValues._id, payload);
          if (response?.data?.statusCode === 200) {
            toast.success(response?.data?.body?.message || "Department updated successfully");
            const serverData = response?.data?.body?.data || response?.data?.body || response?.data;
            const item = serverData?.data || serverData || { ...payload, _id: initialValues._id };
            if (onSave) onSave({ local: true, item, mode: 'edit' });
            setOpen(false);
          }
        }
      } catch (err) {
        toast.error(err?.response?.data?.body?.message || "Something went wrong");
      } finally {
        helpers.setSubmitting(false);
      }
    },
    enableReinitialize: true,
  });

  // Close helper: close first, then reset the form on next tick
  const closeModal = () => {
    try {
      formik.setTouched({});
      if (typeof formik.setErrors === 'function') formik.setErrors({});
      formik.setSubmitting(false);
    } catch (e) {
      // ignore
    }
    setOpen(false);
    setTimeout(() => {
      try {
        formik.resetForm();
      } catch (e) {
        // ignore if formik is not ready
      }
    }, 0);
  };

  const handleOpenChange = (val) => {
    if (!val) {
      try {
        formik.setTouched({});
        if (typeof formik.setErrors === 'function') formik.setErrors({});
        formik.setSubmitting(false);
      } catch (e) {
        // ignore
      }
      closeModal();
    } else {
      setOpen(true);
      // ensure form is reset to current initial values when opening for edit/create
      setTimeout(() => {
        try {
          formik.resetForm();
          formik.setTouched({});
        } catch (e) {
          // ignore
        }
      }, 0);
    }
  };

  // Suppress validation on blur when closing via buttons (mousedown happens before blur)
  const suppressValidation = useRef(false);
  const handleBlur = (e) => {
    if (suppressValidation.current) {
      suppressValidation.current = false;
      return;
    }
    formik.handleBlur(e);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[18px] p-4 sm:p-5 shadow-xl w-[92vw] max-w-[420px] max-h-[90vh] overflow-y-auto overflow-x-hidden top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] hide-scrollbar scrollbar-hide"
        closeBtn="text-[var(--tx2)] hover:text-[var(--tx)] transition-colors top-4 right-4"
      >
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg font-semibold text-[var(--tx)] text-center">
            {mode === "edit" ? "Edit Department" : "Add New Department"}
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--tx3)] text-center">
            {mode === "edit" ? "Update department details." : "Enter details for the new department."}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-[var(--bg2)] p-3 sm:p-4 rounded-lg border border-[var(--bd)] mt-3 sm:mt-4">
          <form onSubmit={formik.handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label className="text-xs text-[var(--tx2)] mb-1 ml-1 block">
                Department Name <span className="text-[var(--crit)]">*</span>
              </label>
              <Input
                name="departmentName"
                placeholder="e.g. Human Resources"
                value={formik.values.departmentName}
                onChange={formik.handleChange}
                onBlur={handleBlur}
                maxLength={100}
                className="border border-[var(--bd)] bg-[var(--bg3)] text-[var(--tx)] shadow-none rounded-[10px]"
              />
              {formik.touched.departmentName && formik.errors.departmentName && (
                <div className="text-[var(--crit)] text-[10px] mt-1 ml-1">
                  {formik.errors.departmentName}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-[var(--tx2)] mb-1 ml-1 block">
                Description
              </label>
              <Input
                name="description"
                placeholder="e.g. Handles employee relations"
                value={formik.values.description}
                onChange={formik.handleChange}
                onBlur={handleBlur}
                maxLength={255}
                className="border border-[var(--bd)] bg-[var(--bg3)] text-[var(--tx)] shadow-none rounded-[10px]"
              />
              {formik.touched.description && formik.errors.description && (
                <div className="text-[var(--crit)] text-[10px] mt-1 ml-1">
                  {formik.errors.description}
                </div>
              )}
            </div>

            <DialogFooter className="mt-6 flex flex-row justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onMouseDown={() => {
                  suppressValidation.current = true;
                }}
                onClick={closeModal}
                className="rounded-[10px] border-[var(--bd)] text-[var(--tx2)] hover:bg-[var(--bg3)] hover:text-[var(--tx)] bg-transparent transition-colors"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={formik.isSubmitting}
                className="bg-[var(--blue)] hover:opacity-95 active:scale-95 text-white rounded-[10px] transition-all cursor-pointer shadow-sm shadow-[var(--blue)]/20"
              >
                {mode === "edit" ? "Update Department" : "Add Department"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DepartmentForm;
