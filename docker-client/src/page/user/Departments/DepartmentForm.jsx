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
    // orgId: Yup.string(),
    description: Yup.string().max(255, "Description cannot exceed 255 characters"),
    // empDepartmentId: Yup.number().typeError("Employee Department ID must be a number"),
  });

  const formik = useFormik({
    initialValues: {
      // orgId: initialValues?.orgId || "",
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
        className="bg-transparent hide-scrollbar rounded-[12px] px-4 py-3 shadow-none w-full max-w-[500px] overflow-y-auto overflow-x-hidden top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] scrollbar-hide"
        closeBtn="[_&_svg]:!size-10 sm:!size-6 [&_svg]:!w-5 sm:!w-6 [&_svg]:!h-5 sm:mt-4 mr-3 sm:mr-4"
      >
        <div className="bg-white rounded-[18px] p-5 shadow-xl border border-gray-200 flex flex-col h-full overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#333333] text-center">
              {mode === "edit" ? "Edit Department" : "Add New Department"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#9E9E9E] text-center">
              {mode === "edit" ? "Update department details." : "Enter details for the new department."}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-white shadow-sm p-4 rounded-lg border border-gray-200 mt-4">
            <form onSubmit={formik.handleSubmit} className="space-y-4">
              {/* <div>
                <label className="text-xs text-[#7A7A7A] mb-1 ml-1 block">
                  Organization ID
                </label>
                <Input
                  name="orgId"
                  placeholder="e.g. 234"
                  value={formik.values.orgId}
                  onChange={formik.handleChange}
                  className="border border-[#80808059] shadow-none rounded-[10px]"
                />
                {formik.touched.orgId && formik.errors.orgId && (
                  <div className="text-red-500 text-[10px] mt-1 ml-1">
                    {formik.errors.orgId}
                  </div>
                )}
              </div> */}

              <div>
                <label className="text-xs text-[#7A7A7A] mb-1 ml-1 block">
                  Department Name <span className="text-red-500">*</span>
                </label>
                <Input
                  name="departmentName"
                  placeholder="e.g. Human Resources"
                  value={formik.values.departmentName}
                  onChange={formik.handleChange}
                  className="border border-[#80808059] shadow-none rounded-[10px]"
                />
                {formik.touched.departmentName && formik.errors.departmentName && (
                  <div className="text-red-500 text-[10px] mt-1 ml-1">
                    {formik.errors.departmentName}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-[#7A7A7A] mb-1 ml-1 block">
                  Description
                </label>
                <Input
                  name="description"
                  placeholder="e.g. Handles employee relations"
                  value={formik.values.description}
                  onChange={formik.handleChange}
                  className="border border-[#80808059] shadow-none rounded-[10px]"
                />
                {formik.touched.description && formik.errors.description && (
                  <div className="text-red-500 text-[10px] mt-1 ml-1">
                    {formik.errors.description}
                  </div>
                )}
              </div>

              {/* <div>
                <label className="text-xs text-[#7A7A7A] mb-1 ml-1 block">
                  Employee Department ID
                </label>
                <Input
                  name="empDepartmentId"
                  placeholder="e.g. 101"
                  value={formik.values.empDepartmentId}
                  onChange={formik.handleChange}
                  className="border border-[#80808059] shadow-none rounded-[10px]"
                />
                {formik.touched.empDepartmentId && formik.errors.empDepartmentId && (
                  <div className="text-red-500 text-[10px] mt-1 ml-1">
                    {formik.errors.empDepartmentId}
                  </div>
                )}
              </div> */}

              <DialogFooter className="mt-6 flex flex-row justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="rounded-[10px] border-gray-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={formik.isSubmitting}
                  className="bg-[#07486A] hover:bg-[#07486A]/90 text-white rounded-[10px]"
                >
                  {mode === "edit" ? "Update Department" : "Add Department"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DepartmentForm;
