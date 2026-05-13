import React, { useEffect, useState, useRef } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Eye, EyeOff, ChevronDown, Shuffle, Copy } from "lucide-react";
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
import {
  Select as RoleSelect,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createUser,
  getChannels,
  getDepartment,
  getEmployeeLocations,
  getLocation,
  getLocations,
  getNvrs,
  updateUser,
  getUserById,
} from "./Api/Post";
import { authorizedUsers } from "../Dashboard/Api/get";
import { getAllRolesAndPermissionDetails } from "../RolePermissions/Api/get";
import MultiSelect from "@/components/ui/multiselect";

const NewPermissionForm = ({
  trigger,
  initialValues = null,
  mode = "create",
  onSave,
  row,
  fetchUsers,
}) => {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [locations, setLocations] = useState([]);
  const [nvrs, setNvrs] = useState([]);
  const [channels, setChannels] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employeeLocationOptions, setEmployeeLocationOptions] = useState([]);

  // Generate strong random password
  const generateStrongPassword = () => {
    const length = 16;
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";
    const allChars = uppercase + lowercase + numbers + symbols;

    let password = "";
    // Ensure at least one of each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password.split("").sort(() => Math.random() - 0.5).join("");
  };

  const handleGeneratePassword = () => {
    const newPassword = generateStrongPassword();
    formik.setFieldValue("newPassword", newPassword);
    formik.setFieldValue("confirmPassword", newPassword);
    toast.success("Strong password generated successfully!");
  };

  const handleCopyPassword = () => {
    if (formik.values.newPassword) {
      navigator.clipboard.writeText(formik.values.newPassword);
      toast.success("Password copied to clipboard!");
    } else {
      toast.error("No password to copy. Generate a password first.");
    }
  };

  // Fetch employees
  const fetchEmployees = async () => {
    try {
      const result = await authorizedUsers(0, 1000, query);
      if (result?.body?.status === "success") {
        setUsers(result.body.data.users || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch roles
  const fetchRoles = async () => {
    try {
      const res = await getAllRolesAndPermissionDetails("", 1000);
      const roleData = res?.data?.body?.data?.rolesWithPermissions || [];
      setRoles(roleData);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEmployeeLocations = async () => {
    try {
      const res = await getEmployeeLocations();
      const locs = res?.data?.body?.data?.locations || [];
      setEmployeeLocationOptions(locs);
    } catch (err) {
      console.error("Error fetching employee locations:", err);
    }
  };

  // Fetch user details (including password) for edit mode
  const fetchUserDetails = async () => {
    const userId = row?.original?._id || initialValues?._id;
    if (!userId) return;
    try {
      const res = await getUserById(userId);
      const userData = res?.data?.body?.data || res?.data?.data || res?.data;
      if (userData?.password) {
        formik.setFieldValue("newPassword", userData.password);
        formik.setFieldValue("confirmPassword", userData.password);
      }
    } catch (err) {
      console.error("Error fetching user details:", err);
    }
  };

  useEffect(() => {
    if (open) {
      fetchEmployees();
      fetchRoles();
      fetchEmployeeLocations();
      if (mode === "edit") {
        fetchUserDetails();
      }
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      fetchEmployees();
    }
  }, [query, open]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const onDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
        setHighlightIndex(-1);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Validation schema
  const schema = Yup.object().shape({
    username: Yup.string()
      .required("Admin user name is required")
      .max(100, "Admin user name cannot exceed 100 characters"),
    email: Yup.string().email("Invalid email").required("Email is required"),
    firstName: Yup.string().required("First name is required"),
    lastName: Yup.string().required("Last name is required"),
    role: Yup.string().required("Role is required"),
    newPassword: Yup.string().when([], {
      is: () => mode === "create",
      then: (schema) => schema.required("New password is required"),
      otherwise: (schema) => schema.notRequired(),
    }),
    confirmPassword: Yup.string().when("newPassword", {
      is: (val) => !!val,
      then: (schema) =>
        schema
          .oneOf([Yup.ref("newPassword"), null], "Passwords don't match")
          .required("Confirm password is required"),
      otherwise: (schema) =>
        schema.oneOf([Yup.ref("newPassword"), null], "Passwords don't match"),
    }),
  });

  const defaults = {
    username: "",
    email: "",
    firstName: "",
    lastName: "",
    role: "",
    newPassword: "",
    confirmPassword: "",
    locations: [],
    nvrs: [],
    departments: [],
    channels: [],
    employeeLocations: [],
  };

  const resolvedInitial = {
    ...defaults,
    ...(initialValues || {}),
    username: (initialValues?.userName || initialValues?.username || "") + "",
    email: initialValues?.email || row?.original?.email || "",
    firstName:
      initialValues?.firstName ||
      row?.original?.firstName ||
      (initialValues?.name ? initialValues.name.split(" ")[0] : "") ||
      "",
    lastName:
      initialValues?.lastName ||
      row?.original?.lastName ||
      (initialValues?.name
        ? initialValues.name.split(" ").slice(1).join(" ")
        : "") ||
      "",
    role: (initialValues?.roleName || initialValues?.role || "") + "",
    locations: (
      initialValues?.locations ||
      initialValues?.authorizedChannelsData?.locations ||
      []
    ).map((l) => (typeof l === "object" ? l._id || l.id || l : l)),
    nvrs: (
      initialValues?.nvrIds ||
      initialValues?.nvrs ||
      initialValues?.authorizedChannelsData?.nvrIds ||
      []
    ).map((n) => (typeof n === "object" ? n._id || n.id || n : n)),
    departments: (
      initialValues?.departmentIds ||
      initialValues?.departments ||
      initialValues?.authorizedChannelsData?.departmentIds ||
      []
    ).map((d) => (typeof d === "object" ? d._id || d.id || d : d)),
    channels: (
      initialValues?.channels ||
      initialValues?.authorizedChannelsData?.channelIds ||
      []
    ).map((c) => (typeof c === "object" ? c._id || c.id || c : c)),
    employeeLocations: Array.isArray(initialValues?.employeeLocations) && initialValues.employeeLocations.length > 0
      ? initialValues.employeeLocations
      : Array.isArray(row?.original?.employeeLocations) && row.original.employeeLocations.length > 0
      ? row.original.employeeLocations
      : [],
    newPassword: initialValues?.password || row?.original?.password || "",
    confirmPassword: initialValues?.password || row?.original?.password || "",
  };

  console.log("Resolved initial values:", resolvedInitial,);

  const formik = useFormik({
    initialValues: resolvedInitial,
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      try {
        if (mode === "create") {
          const selectedRole = roles.find((r) => r.roleName === values.role);
          const payload = {
            userName: values.username.trim(),
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            roleIds: selectedRole ? [selectedRole._id] : [],
            password: values.newPassword,
            confirmPassword: values.confirmPassword,
            authorizedChannelsData: {
            employeeLocations: values.employeeLocations?.length ? values.employeeLocations : undefined,
              locations: values.locations,
              nvrIds: values.nvrs,
              departmentIds: values.departments,
              channelIds: values.channels,
            },
          };
          const response = await createUser(payload);
          if (response?.data?.statusCode === 200) {
            toast.success(response?.data?.body?.message || "User created");
            fetchUsers();
            formik.resetForm();
            setQuery("");
            if (typeof onSave === "function") await onSave();
            setOpen(false);
          } else {
            toast.error(response?.data?.body?.message || "Create failed");
          }
        } else {
          const selectedRole =
            roles.find((r) => r.roleName === values.role) ||
            roles.find((r) => r._id === (initialValues?.roleIds?.[0] || ""));

          const payload = {
            userName: values.username.trim(),
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            roleIds: selectedRole
              ? [selectedRole._id]
              : initialValues?.roleIds || [],
            ...(values.newPassword
              ? { password: values.newPassword, confirmPassword: values.confirmPassword }
              : {}),
            authorizedChannelsData: {
            employeeLocations: values.employeeLocations?.length ? values.employeeLocations : undefined,

              locations: values.locations,
              nvrIds: values.nvrs,
              departmentIds: values.departments,
              channelIds: values.channels,
            },
          };

          const response = await updateUser(
            row?.original?._id || initialValues?._id,
            payload
          );
          if (response?.data?.statusCode === 200) {
            toast.success(response?.data?.body?.message || "User updated");
            fetchUsers();
            if (typeof onSave === "function") await onSave();
            setOpen(false);
          } else {
            toast.error(response?.data?.body?.message || "Update failed");
          }
        }
      } catch (err) {
        toast.error(
          err?.response?.data?.body?.message || "Something went wrong"
        );
      } finally {
        helpers.setSubmitting(false);
      }
    },
    enableReinitialize: true,
  });

  // helper: apply typed name to fields (enter to accept typed value)
  const applyNameToFormik = (name) => {
    const typedName = (name || "").trim();
    if (!typedName) return;
    formik.setFieldValue("username", typedName);
    const matchedUser = users.find(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase() ===
        typedName.toLowerCase()
    );
    if (matchedUser) {
      formik.setFieldValue("email", matchedUser.email || "");
      formik.setFieldValue("firstName", matchedUser.firstName || "");
      formik.setFieldValue("lastName", matchedUser.lastName || "");
      formik.setFieldValue("role", matchedUser.role || "");
    } else {
      const [first, ...rest] = typedName.split(" ");
      formik.setFieldValue("firstName", first || "");
      formik.setFieldValue("lastName", rest.join(" ") || "");
      formik.setFieldValue("email", "");
    }
  };

  const suggestions = users
    .map((u) => `${u.firstName} ${u.lastName}`)
    .filter((name) =>
      name.toLowerCase().includes((query || "").toLowerCase())
    );

  const handleGetLocations = async ({
    nvrIds = formik.values.nvrs,
    channelsIds = formik.values.channels,
    departmentIds = formik.values.departments,
  } = {}) => {
    const response = await getLocation({});
    setLocations(response?.data?.body?.data || []);
  };

  // Fetch NVRs — without clearing existing selected NVRs, return valid selected NVR IDs
  const handleGetNvrs = async ({
    selectedLocations = formik.values.locations,
    channelsIds = formik.values.channels,
    departmentIds = formik.values.departments,
  } = {}) => {
    const response = await getNvrs({ selectedLocations });
    const newNvrs = response?.data?.body?.data || [];

    // Keep only previously selected NVRs that still exist in new list
    const validSelectedNvrs = formik.values.nvrs.filter((selectedId) =>
      newNvrs.some((nvr) => nvr._id === selectedId)
    );

    setNvrs(newNvrs);
    formik.setFieldValue("nvrs", validSelectedNvrs);

    // 👉 return them so caller (location onChange) can use them
    return validSelectedNvrs;
  };

  // Fetch Departments — keep existing ones if still valid
  const handleGetDepartments = async ({
    channelsIds = formik.values.channels,
    employeeLocations = formik.values.employeeLocations,
  } = {}) => {
    const response = await getDepartment({ channelsIds, employeeLocations });
    const newDepartments = response?.data?.body?.data || [];

    const validSelectedDepartments = formik.values.departments.filter(
      (selectedId) => newDepartments.some((dept) => dept._id === selectedId)
    );

    setDepartments(newDepartments);
    formik.setFieldValue("departments", validSelectedDepartments);
  };

  // Fetch Channels — without clearing old selections
  const handleGetChannels = async ({
    selectedLocations = formik.values.locations,
    nvrIds = formik.values.nvrs,
    departmentIds = formik.values.departments,
  } = {}) => {
    const response = await getChannels({
      selectedLocations,
      nvrIds,
      isUserRegFilter: true,
    });

    const nvrArray = response?.data?.body?.data || [];
    const newChannels = nvrArray.flatMap((nvr) =>
      (nvr.channels || []).map((ch) => ({
        ...ch,
        // keep channel's nvrId but prefer parent nvrId if provided
        nvrId: ch.nvrId || nvr.nvrId || nvr._id,
        nvrName: nvr.nvrName || ch.nvrName || nvr.name || "Unknown NVR",
      }))
    );

    const validSelectedChannels = formik.values.channels.filter((selectedId) =>
      newChannels.some((ch) => ch._id === selectedId)
    );

    setChannels(newChannels);
    formik.setFieldValue("channels", validSelectedChannels);
  };

  useEffect(() => {
    if (open) {
      const nvrIds =
        row?.original?.authorizedChannels?.nvrIds?.map((nvr) => nvr._id) || [];
      const departmentIds =
        row?.original?.authorizedChannels?.departmentIds?.map(
          (departmentId) => departmentId._id
        ) || [];

      if (
        row?.original?.authorizedChannels?.locations ||
        nvrIds.length ||
        departmentIds.length
      ) {
        const selectedLocations = row?.original?.authorizedChannels?.locations;
        handleGetChannels({ selectedLocations, nvrIds, departmentIds });
      } else {
        handleGetChannels({});
      }

      handleGetLocations({});
      if (row?.original?.authorizedChannels?.locations) {
        const selectedLocations = row?.original?.authorizedChannels?.locations;
        handleGetNvrs({ selectedLocations });
      } else {
        handleGetNvrs({});
      }
      handleGetDepartments({});
    }
  }, [open]);

  const locationOptions = locations?.map((loc, index) => ({
    id: index + 1,
    label: loc,
  }));

  const NvrOptions = nvrs?.map((nvr) => ({
    id: nvr._id,
    label: nvr.nvrName,
  }));

  const channeloptions = [];
  const nvrArray = channels || [];

  const nvrMap = new Map();
  nvrArray.forEach((channel) => {
    if (channel?.nvrId && !nvrMap.has(channel.nvrId)) {
      nvrMap.set(channel.nvrId, channel.nvrName || "Unknown NVR");
    }
  });

  // Build options with NVR headers
  nvrMap.forEach((nvrName, nvrId) => {
    channeloptions.push({
      id: `nvr-header-${nvrId}`,
      label: nvrName,
      disabled: true,
      isNvrHeader: true,
    });

    const nvrChannels = nvrArray.filter((ch) => ch.nvrId === nvrId);
    nvrChannels.forEach((channel) => {
      channeloptions.push({
        id: channel._id,
        label: channel.customName || channel.name || "Unnamed Channel",
        group: nvrId,
      });
    });
  });

  const departmentOptions = departments?.map((dept) => ({
    id: dept._id,
    label: dept.departmentName,
  }));

  useEffect(() => {
    if (!open) {
      formik.resetForm();
      setQuery("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={`bg-transparent hide-scrollbar rounded-[12px] px-4 py-3 shadow-none w-full max-w-[750px] ${
          mode === "edit" ? "h-[88dvh]" : "h-full"
        } overflow-y-auto overflow-x-hidden top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] scrollbar-hide`}
        closeBtn="[_&_svg]:!size-10 sm:!size-6 [&_svg]:!w-5 sm:!w-6 [&_svg]:!h-5 sm:mt-4 mr-3 sm:mr-4"
      >
        <div className="bg-white rounded-[18px] p-5 shadow-xl border border-gray-200 flex flex-col h-full overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#333333] text-center">
              {mode === "edit" ? "Edit User" : "Add New User"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#9E9E9E] text-center">
              Define user details. All required fields are validated.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-white shadow-sm p-4 rounded-lg border border-gray-200 mt-4">
            <form onSubmit={formik.handleSubmit}>
              <div className="space-y-5">
                {/* USERNAME & EMAIL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Username Search */}
                  <div ref={containerRef}>
                    <label className="text-xs text-[#7A7A7A] mb-1 ml-3 block">
                      Admin User Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        name="username_search"
                        value={
                          mode === "edit" ? formik.values.username : query
                        }
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setShowSuggestions(true);
                          setHighlightIndex(-1);
                          formik.setFieldValue("username", e.target.value);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onKeyDown={(e) => {
                          if (showSuggestions) {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setHighlightIndex((i) =>
                                Math.min(i + 1, suggestions.length - 1)
                              );
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setHighlightIndex((i) =>
                                Math.max(i - 1, 0)
                              );
                            } else if (e.key === "Enter") {
                              e.preventDefault();
                              const chosen =
                                highlightIndex >= 0
                                  ? suggestions[highlightIndex]
                                  : query.trim();
                              if (chosen) {
                                applyNameToFormik(chosen);
                                setQuery(chosen);
                              }
                              setShowSuggestions(false);
                              setHighlightIndex(-1);
                            } else if (e.key === "Escape") {
                              setShowSuggestions(false);
                            }
                          }
                        }}
                        placeholder="Search or type new user..."
                        className="border border-[#80808059] shadow-none px-3 py-2 pr-10 rounded-[10px] w-full"
                      />
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                      {showSuggestions &&
                        suggestions.length > 0 &&
                        mode !== "edit" && (
                          <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-[10px] max-h-44 overflow-auto shadow-lg">
                            {suggestions.map((name, idx) => (
                              <li
                                key={name + idx}
                                onMouseDown={(ev) => {
                                  ev.preventDefault();
                                  applyNameToFormik(name);
                                  setQuery(name);
                                  setShowSuggestions(false);
                                }}
                                onMouseEnter={() => setHighlightIndex(idx)}
                                className={`px-3 py-2 cursor-pointer ${
                                  idx === highlightIndex
                                    ? "bg-slate-100"
                                    : ""
                                }`}
                              >
                                {name}
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                    {formik.touched.username && formik.errors.username && (
                      <div className="text-red-500 text-xs mt-1 ml-1">
                        {formik.errors.username}
                      </div>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="text-xs text-[#7A7A7A] mb-1 ml-3 block">
                      Email ID <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="text"
                      name="email"
                      placeholder="Enter email address"
                      value={formik.values.email}
                      onChange={formik.handleChange}
                      className="border border-[#80808059] shadow-none px-3 py-2 rounded-[10px]"
                    />
                    {formik.touched.email && formik.errors.email && (
                      <div className="text-red-500 text-xs mt-1 ml-1">
                        {formik.errors.email}
                      </div>
                    )}
                  </div>
                </div>

                {/* FIRST & LAST NAME */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-[#7A7A7A] mb-1 ml-3 block">
                      First name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      name="firstName"
                      placeholder="Enter first name"
                      value={formik.values.firstName}
                      onChange={formik.handleChange}
                      className="border border-[#80808059] shadow-none px-3 py-2 rounded-[10px]"
                    />
                    {formik.touched.firstName && formik.errors.firstName && (
                      <div className="text-red-500 text-xs mt-1 ml-1">
                        {formik.errors.firstName}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs text-[#7A7A7A] mb-1 ml-3 block">
                      Last name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      name="lastName"
                      placeholder="Enter last name"
                      value={formik.values.lastName}
                      onChange={formik.handleChange}
                      className="border border-[#80808059] shadow-none px-3 py-2 rounded-[10px]"
                    />
                    {formik.touched.lastName && formik.errors.lastName && (
                      <div className="text-red-500 text-xs mt-1 ml-1">
                        {formik.errors.lastName}
                      </div>
                    )}
                  </div>
                </div>

                <hr className="border-gray-200 my-3" />

                {/* ROLE SELECT + EMPLOYEE ACCESS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Role */}
                  <div>
                    <label className="text-xs text-[#7A7A7A] mb-1 ml-1 block">
                      Assign Role to the user{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <p className="text-[11px] text-[#9CA3AF] leading-[14px] mb-2 ml-1">
                      Assign the correct role permissions to this user.
                    </p>

                    <RoleSelect
                      value={formik.values.role || ""}
                      onValueChange={(v) => formik.setFieldValue("role", v)}
                    >
                      <SelectTrigger className="h-10 w-full rounded-xl border border-[#d1d5db] shadow-none">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent className="max-h-42 overflow-y-auto">
                        {[...new Map(roles.map((r) => [r.roleName, r])).values()]
                          .map((role) => (
                            <SelectItem key={role._id} value={role.roleName}>
                              {role.roleName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </RoleSelect>

                    {formik.touched.role && formik.errors.role && (
                      <div className="text-red-500 text-xs mt-1 ml-1">
                        {formik.errors.role}
                      </div>
                    )}
                  </div>

                  {/* Employee Access */}
                  <div>
                    <label className="text-xs text-[#7A7A7A] mb-1 ml-1 block">
                      Employee Access
                    </label>
                    <p className="text-[11px] text-[#9CA3AF] leading-[14px] mb-2 ml-1">
                      Select the employee location access.
                    </p>

                    <MultiSelect
                      options={employeeLocationOptions.map((loc) => ({
                        id: loc.locationName,
                        label: loc.locationName,
                      }))}
                      value={Array.isArray(formik.values.employeeLocations) ? formik.values.employeeLocations : []}
                      onChange={(selected) => {
                        formik.setFieldValue("employeeLocations", selected);
                        handleGetDepartments({ employeeLocations: selected });
                      }}
                      placeholder="Select employee access"
                    />
                  </div>
                </div>

                <hr className="border-gray-200 my-3" />
               camera access
                {/* LOCATION, NVR, DEPARTMENT, REGION MULTISELECTS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Locations */}
                  <div>
                    <label className="text-xs text-[#7A7A7A] mb-1 ml-3 block">
                      Location
                    </label>
                    <MultiSelect
                      options={locationOptions}
                      value={formik.values.locations}
                      onChange={async (selectedLocations) => {
                        const selectedObjects = locationOptions.filter((opt) =>
                          selectedLocations.includes(opt.id)
                        );

                        // 1) update locations
                        formik.setFieldValue("locations", selectedLocations);
                        formik.setFieldValue(
                          "locationObjects",
                          selectedObjects
                        );

                        // 2) fetch NVRs for new locations and get valid selected NVRs
                        const validSelectedNvrs = await handleGetNvrs({
                          selectedLocations,
                        });

                        // 3) fetch channels ONLY for valid selected NVRs
                        await handleGetChannels({
                          selectedLocations,
                          nvrIds: validSelectedNvrs,
                        });
                      }}
                      placeholder="Select locations"
                      type="location"
                    />
                  </div>

                  {/* NVRs */}
                  <div>
                    <label className="text-xs text-[#7A7A7A] mb-1 ml-3 block">
                      NVR
                    </label>
                    <MultiSelect
                      options={NvrOptions}
                      value={formik.values.nvrs}
                      onChange={(nvrIds) => {
                        const selectedObjects = NvrOptions.filter((opt) =>
                          nvrIds.includes(opt.id)
                        );
                        formik.setFieldValue("nvrs", nvrIds);
                        formik.setFieldValue("nvrObjects", selectedObjects);

                        // fetch Channels based on selected NVRs only
                        handleGetChannels({
                          selectedLocations: formik.values.locations,
                          nvrIds,
                        });
                      }}
                      msg={
                        formik.values.locations?.length === 0
                          ? "Please select locations first"
                          : "No options found"
                      }
                      placeholder="Select NVRs"
                    />
                  </div>

                  {/* Channels */}
                  <div>
                    <label className="text-xs text-[#7A7A7A] mb-1 ml-3 block">
                      Channels
                    </label>
                    <MultiSelect
                      options={channeloptions}
                      value={formik.values.channels}
                      onChange={(selectedIds) => {
                        const selectedObjects = channeloptions.filter((opt) =>
                          selectedIds.includes(opt.id)
                        );
                        formik.setFieldValue("channels", selectedIds);
                        formik.setFieldValue(
                          "channelObjects",
                          selectedObjects
                        );
                        const channelsIds = selectedIds;
                        handleGetDepartments({ channelsIds });
                      }}
                      msg={
                        formik.values.departments?.length === 0 &&
                        formik.values.nvrs?.length === 0
                          ? "Please select Departments or NVRs first"
                          : "No options found"
                      }
                      placeholder="Select channels"
                    />
                  </div>

                  {/* Departments */}
                  <div>
                    <label className="text-xs text-[#7A7A7A] mb-1 ml-3 block">
                      Department
                    </label>
                    <MultiSelect
                      options={departmentOptions}
                      value={formik.values.departments}
                      onChange={(departmentIds) => {
                        const selectedObjects = departmentOptions.filter(
                          (opt) => departmentIds.includes(opt.id)
                        );
                        formik.setFieldValue("departments", departmentIds);
                        formik.setFieldValue(
                          "departmentObjects",
                          selectedObjects
                        );
                      }}
                      placeholder="Select departments"
                    />
                  </div>
                </div>

                {/* PASSWORDS */}
                  <>
                    <hr className="border-gray-200 my-3" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-[#7A7A7A] mb-1 ml-3 block">
                          {mode === "edit" ? "Update password" : "New password"}{" "}
                          {mode === "create" && <span className="text-red-500">*</span>}
                        </label>
                        <div className="relative">
                          <Input
                            name="newPassword"
                            type={showNewPassword ? "text" : "password"}
                            placeholder="Enter new password"
                            value={formik.values.newPassword}
                            onChange={formik.handleChange}
                            className="border border-[#80808059] shadow-none px-3 py-2 pr-10 rounded-[10px]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowNewPassword(!showNewPassword)
                            }
                            className="absolute right-3 top-1/2 cursor-pointer -translate-y-1/2 text-gray-500 hover:text-gray-700"
                          >
                            {showNewPassword ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <EyeOff className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        {formik.touched.newPassword &&
                          formik.errors.newPassword && (
                            <div className="text-red-500 text-xs mt-1 ml-1">
                              {formik.errors.newPassword}
                            </div>
                          )}

                        {/* Password Action Buttons */}
                        <div className="flex flex-wrap justify-end gap-2 mt-2">
                          <Button
                            type="button"
                            onClick={handleGeneratePassword}
                            className="rounded-[7px] text-[10px] bg-[#E3F5FF] text-[#07486A] font-[500] hover:bg-[#E3F5FF]/60 cursor-pointer px-3 py-1 flex items-center gap-1.5"
                          >
                            <Shuffle className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            onClick={handleCopyPassword}
                            className="rounded-[7px] text-[10px] bg-[#EFEFEF] text-[#333333] font-[500] hover:bg-[#EFEFEF]/60 cursor-pointer px-3 py-1 flex items-center gap-1.5"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-[#7A7A7A] mb-1 ml-3 block">
                          Confirm password{" "}
                          {mode === "create" && <span className="text-red-500">*</span>}
                        </label>
                        <div className="relative">
                          <Input
                            name="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Re-enter password"
                            value={formik.values.confirmPassword}
                            onChange={formik.handleChange}
                            className="border border-[#80808059] shadow-none px-3 py-2 pr-10 rounded-[10px]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            className="absolute right-3 top-1/2 cursor-pointer -translate-y-1/2 text-gray-500 hover:text-gray-700"
                          >
                            {showConfirmPassword ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <EyeOff className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        {formik.touched.confirmPassword &&
                          formik.errors.confirmPassword && (
                            <div className="text-red-500 text-xs mt-1 ml-1">
                              {formik.errors.confirmPassword}
                            </div>
                          )}
                      </div>
                    </div>
                  </>

                {/* FOOTER BUTTONS */}
                <DialogFooter className="mt-10 flex flex-col gap-2 justify-center sm:flex-row sm:justify-center items-center">
                  <Button
                    type="submit"
                    className="rounded-[7px] bg-[#07486A] text-white hover:bg-[#07486A] px-6 py-5 cursor-pointer text-sm"
                  >
                    {mode === "edit" ? "Update User" : "Add User"}
                  </Button>
                </DialogFooter>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewPermissionForm;
