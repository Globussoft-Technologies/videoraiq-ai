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
        className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[18px] p-5 shadow-xl w-full max-w-[500px] overflow-y-auto overflow-x-hidden top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] hide-scrollbar scrollbar-hide"
        closeBtn="text-[var(--tx2)] hover:text-[var(--tx)] transition-colors top-4 right-4"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[var(--tx)] text-center">
            {mode === "edit" ? "Edit Location" : "Add New Location"}
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--tx3)] text-center">
            {mode === "edit" ? "Update location details." : "Enter details for the new location."}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-[var(--bg2)] p-4 rounded-lg border border-[var(--bd)] mt-4">
          <form onSubmit={formik.handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-[var(--tx2)] mb-1 ml-1 block">
                Location Name <span className="text-[var(--crit)]">*</span>
              </label>
              <Input
                name="locationName"
                placeholder="e.g. Banglore"
                value={formik.values.locationName}
                onChange={formik.handleChange}
                className="border border-[var(--bd)] bg-[var(--bg3)] text-[var(--tx)] shadow-none rounded-[10px]"
              />
              {formik.touched.locationName && formik.errors.locationName && (
                <div className="text-[var(--crit)] text-[10px] mt-1 ml-1">
                  {formik.errors.locationName}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-[var(--tx2)] mb-1 ml-1 block">
                Employee Location ID
              </label>
              <Input
                name="empLocationId"
                placeholder="e.g. BLR001"
                value={formik.values.empLocationId}
                onChange={formik.handleChange}
                className="border border-[var(--bd)] bg-[var(--bg3)] text-[var(--tx)] shadow-none rounded-[10px]"
              />
              {formik.touched.empLocationId && formik.errors.empLocationId && (
                <div className="text-[var(--crit)] text-[10px] mt-1 ml-1">
                  {formik.errors.empLocationId}
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
                {mode === "edit" ? "Update Location" : "Add Location"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LocationForm;
