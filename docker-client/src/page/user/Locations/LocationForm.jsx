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
import { createLocation, updateLocation } from "./Api";

const LocationForm = ({
  trigger,
  initialValues = null,
  mode = "create",
  onSave,
}) => {
  const [open, setOpen] = useState(false);

  const schema = Yup.object().shape({
    locationName: Yup.string()
      .required("Location name is required")
      .max(100, "Location name cannot exceed 100 characters"),
    empLocationId: Yup.string(),
  });

  const formik = useFormik({
    initialValues: {
      locationName: initialValues?.locationName || "",
      empLocationId: initialValues?.empLocationId || "",
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      try {
        if (mode === "create") {
          const response = await createLocation(values);
          if (response?.data?.statusCode === 200) {
            toast.success(response?.data?.body?.message || "Location created successfully");
            if (onSave) onSave();
            setOpen(false);
          }
        } else {
          const response = await updateLocation(initialValues._id, values);
          if (response?.data?.statusCode === 200) {
            toast.success(response?.data?.body?.message || "Location updated successfully");
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
              {mode === "edit" ? "Edit Location" : "Add New Location"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#9E9E9E] text-center">
              {mode === "edit" ? "Update location details." : "Enter details for the new location."}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-white shadow-sm p-4 rounded-lg border border-gray-200 mt-4">
            <form onSubmit={formik.handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-[#7A7A7A] mb-1 ml-1 block">
                  Location Name <span className="text-red-500">*</span>
                </label>
                <Input
                  name="locationName"
                  placeholder="e.g. Banglore"
                  value={formik.values.locationName}
                  onChange={formik.handleChange}
                  className="border border-[#80808059] shadow-none rounded-[10px]"
                />
                {formik.touched.locationName && formik.errors.locationName && (
                  <div className="text-red-500 text-[10px] mt-1 ml-1">
                    {formik.errors.locationName}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-[#7A7A7A] mb-1 ml-1 block">
                  Employee Location ID
                </label>
                <Input
                  name="empLocationId"
                  placeholder="e.g. BLR001"
                  value={formik.values.empLocationId}
                  onChange={formik.handleChange}
                  className="border border-[#80808059] shadow-none rounded-[10px]"
                />
                {formik.touched.empLocationId && formik.errors.empLocationId && (
                  <div className="text-red-500 text-[10px] mt-1 ml-1">
                    {formik.errors.empLocationId}
                  </div>
                )}
              </div>

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
                  {mode === "edit" ? "Update Location" : "Add Location"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LocationForm;
