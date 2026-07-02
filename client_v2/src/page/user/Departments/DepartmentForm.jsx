import React, { useEffect, useState } from "react";
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
            if (onSave) onSave();
            setOpen(false);
          }
          else{
            toast.error(response?.data?.body?.message || "Failed to create department");
          }
        } else {
          const response = await updateDepartment(initialValues._id, payload);
          if (response?.data?.statusCode === 200) {
            toast.success(response?.data?.body?.message || "Department updated successfully");
            if (onSave) onSave();
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

  useEffect(() => {
    if (!open) {
      formik.resetForm();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[18px] p-5 shadow-xl w-full max-w-[500px] overflow-y-auto overflow-x-hidden top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] hide-scrollbar scrollbar-hide"
        closeBtn="text-[var(--tx2)] hover:text-[var(--tx)] transition-colors top-4 right-4"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[var(--tx)] text-center">
            {mode === "edit" ? "Edit Department" : "Add New Department"}
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--tx3)] text-center">
            {mode === "edit" ? "Update department details." : "Enter details for the new department."}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-[var(--bg2)] p-4 rounded-lg border border-[var(--bd)] mt-4">
          <form onSubmit={formik.handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-[var(--tx2)] mb-1 ml-1 block">
                Department Name <span className="text-[var(--crit)]">*</span>
              </label>
              <Input
                name="departmentName"
                placeholder="e.g. Human Resources"
                value={formik.values.departmentName}
                onChange={formik.handleChange}
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
                onClick={() => setOpen(false)}
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
