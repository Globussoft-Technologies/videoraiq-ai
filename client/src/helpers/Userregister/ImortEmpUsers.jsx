import React, { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import {
  addempUsers,
  addEmpEmails,
  getEmpUsers,
  getEmpEmails,
  deleteEmpEmail,
  getLocationByEmpEmail,
  importUsersProgress,
} from "./Api/post";
import { toast } from "sonner";
const ImportEmpUsersModal = ({ open, onClose, fetchUsers, refreshLocations, refreshDepartments }) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [showDeleteProgress, setShowDeleteProgress] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");

  const [employees, setEmployees] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [orgEmailList, setOrgEmailList] = useState([]); // { email, status }
  const [orgEmailInput, setOrgEmailInput] = useState("");
  const [orgEmployeeCount, setOrgEmployeeCount] = useState(10);
  const [pageSize, setPageSize] = useState(10);

  const [removeConfirm, setRemoveConfirm] = useState(null);

  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);


  // 🔥 Debounce Logic
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  // 🔥 Fetch API — first get count, then fetch all
  const fetchEmployees = async (knownCount = null) => {
    if (!open) return;

    try {
      setLoading(true);

      const basePayload = {
        skip: 0,
        limit: 10,
        name: debouncedSearch,
      };

      if (orgEmailList.length > 0) {
        basePayload.organization_emails = orgEmailList.map((item) => item.email);
      }

      if (orgEmployeeCount && Number(orgEmployeeCount) > 0) {
        basePayload.employeeCount = Number(orgEmployeeCount);
      }

      // ✅ Add location_id to payload
      if (selectedLocation?.location_id) {
        basePayload.location_id = selectedLocation.location_id;
      }

      // Step 1: get count if not known
      let count = knownCount;
      if (!count) {
        const countRes = await getEmpUsers(basePayload);
        count = countRes?.body?.data?.count || countRes?.body?.data?.empOrgDataArray?.[0]?.total_count || 0;
        setTotalCount(count);
      }

      // Step 2: fetch all using count as limit
      if (count > 0) {
        const allRes = await getEmpUsers({ ...basePayload, limit: count });
        const dataArray = allRes?.body?.data?.empOrgDataArray || allRes?.body?.data?.users || [];
        setEmployees(dataArray);
      } else {
        setEmployees([]);
      }

      // Reset selection whenever data is re-fetched
      setSelected([]);
    } catch (err) {
      console.error("API Error:", err);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 Get saved admin emp emails
  const fetchAdminEmails = async () => {
    try {
      const res = await getEmpEmails();
      if (res?.statusCode === 200 && res?.body?.status === "success") {
        const data = res?.body?.data || [];
        // map backend saved emails into status objects, default status success
        setOrgEmailList(
          data.map((item) => ({
            email: item.email,
            status: item.status || "success",
          }))
        );
      } else {
        toast.error(res?.body?.message || "Failed to load employee emails.");
      }
    } catch (err) {
      console.error("Get Emp Emails Error:", err);
      toast.error("Failed to load employee emails.");
    }
  };

  // 🔥 Fetch locations by emp email
  const fetchLocations = async () => {
    try {
      const res = await getLocationByEmpEmail();
      if (res?.statusCode === 200 && res?.body?.status === "success") {
        const locationData = res?.body?.data?.locations || [];
        setLocations(locationData);
      } else {
        console.error("Failed to fetch locations:", res?.body?.message);
      }
    } catch (err) {
      console.error("Fetch Locations Error:", err);
    }
  };

  // 🔥 Trigger API
  useEffect(() => {
    if (open) {
      fetchEmployees();
    }
  }, [currentPage, open, debouncedSearch, pageSize, selectedLocation, orgEmailList]);

  useEffect(() => {
    if (open) {
      fetchAdminEmails();
      fetchLocations();
    }
  }, [open]);

  if (!open) return null;

  // ✅ Select Single
  const handleSelect = (emp) => {
    setSelected((prev) => {
      const exists = prev.some((e) => e.id === emp.id);

      if (exists) {
        return prev.filter((e) => e.id !== emp.id);
      } else {
        return [...prev, emp]; // ✅ full object stored
      }
    });
  };


  // ✅ Select All — selects all fetched employees
  const handleSelectAll = () => {
    const selectableEmployees = employees.filter((emp) => !emp.importedStatus);

    const isAllSelected =
      selectableEmployees.length > 0 &&
      selectableEmployees.every((emp) => selected.some((sel) => sel.id === emp.id));

    if (isAllSelected) {
      setSelected([]);
    } else {
      setSelected(selectableEmployees);
    }
  };

  // ✅ Update filters and reload employee list
  const handleFetchOrgUsers = () => {
    const count = Number(orgEmployeeCount);
    const nextPageSize = count > 0 ? count : 10;

    // These state updates will trigger the useEffect for fetchEmployees automatically
    setPageSize(nextPageSize);
    setCurrentPage(1);
  };

  // ✅ Add one organization email immediately (call API add-emp-emails)
  const handleOrgEmailAdd = async () => {
    const email = orgEmailInput.trim().replace(/,$/, "");

    if (!email) {
      toast.error("Please enter a valid email address.");
      return;
    }

    if (orgEmailList.some((item) => item.email === email)) {
      toast.error("Email already added.");
      setOrgEmailInput("");
      return;
    }

    try {
      setLoading(true);

      const payload = { emails: [email] };
      const res = await addEmpEmails(payload);

      if (res?.statusCode === 200 && res?.body?.status === "success") {
        toast.success(res?.body?.message || "Employee email added successfully.");
        fetchLocations()

        const data = res?.body?.data || [{ email, status: "success" }];
        const mapped = data.map((item) => ({ email: item.email, status: item.status || "success" }));

        setOrgEmailList((prev) => {
          const withoutExisting = prev.filter((i) => !mapped.some((m) => m.email === i.email));
          return [...withoutExisting, ...mapped];
        });

        // No need to call fetchEmployees() manually, 
        // updating orgEmailList triggers the useEffect.
      } else {
        toast.error(res?.body?.message || "Failed to add employee email.");
      }
    } catch (err) {
      console.error("Add Emp Email Error:", err);
      toast.error(err?.response?.data?.body?.message || "Failed to add employee email.");
    } finally {
      setLoading(false);
      setOrgEmailInput("");
    }
  };

  // // ✅ Delete an existing admin email
  // const handleDeleteAdminEmail = async (email) => {
  //   try {
  //     setLoading(true);
  //     const res = await deleteEmpEmail({ email });
  //     console.log("Delete Emp Email Response:", res);

  //     if (res?.statusCode === 200 && res?.body?.status === "success") {
  //       await fetchAdminEmails();
  //       await fetchLocations();
  //       toast.warning(
  //         `Organization "${email}" has been removed. All employees linked to this organization have been removed .`,
  //         { duration: 2000 }
  //       );
  //       setOrgEmailList((prev) => prev.filter((item) => item.email !== email));

  //     } else {
  //       toast.error(res?.body?.message || "Failed to delete email.");
  //     }
  //   } catch (err) {
  //     console.error("Delete Emp Email Error:", err);
  //     toast.error(err?.response?.data?.body?.message || "Failed to delete email.");
  //   } finally {
  //     setLoading(false);
  //   }
  // };
  const handleDeleteAdminEmail = async (email) => {
    try {
      setLoading(true);

      const res = await deleteEmpEmail({ email });

      if (res?.statusCode === 200 && res?.body?.status === "success") {
        toast.success(`"${email}" removed successfully ✅`);

        // We only need to fetch these once.
        // fetchAdminEmails will update orgEmailList, 
        // which will automatically trigger fetchEmployees via useEffect.
        await fetchAdminEmails();
        await fetchLocations();
      } else {
        toast.error(res?.body?.message || "Failed to delete email.");
      }
    } catch (err) {
      console.error("Delete Error:", err);
      toast.error(err?.response?.data?.body?.message || "Failed to delete email.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Add Users
  const handleAddUsers = async () => {

    const selectedEmails = selected.map((emp) => emp.email).filter(Boolean);
    const orgEmails = orgEmailList.map((item) => item.email);

    const finalEmails = orgEmails.length > 0 ? orgEmails : selectedEmails;

    if (finalEmails.length === 0) {
      toast.error(
        "Please add organization email IDs or select employee rows to import."
      );
      return;
    }

    // Declared at function scope so the unmount cleanup below can clear it.
    let interval;

    try {
      setLoading(true);

      // ✅ FINAL PAYLOAD (MATCH BACKEND)
      const payloadForApi = {
        usersData: selected.map((emp) => {
          const { importedStatus, ...rest } = emp; // ❌ remove UI field

          return {
            ...rest,

            // ✅ ensure required fields
            name: emp.name || emp.first_name,
            employee_unique_id:
              emp.employee_unique_id || emp.email,
          };
        }),
      };


      const res = await addempUsers(payloadForApi);

      if (res?.statusCode === 200 && res?.body?.status === "success") {
        toast.warning("Importing employees...");

        // ✅ Show the bar immediately for instant feedback
        setProgressLabel("Import");
        setShowDeleteProgress(true);
        setDeleteProgress(0);

        interval = setInterval(async () => {
          try {
            const data = await importUsersProgress();

            if (data?.statusCode === 200) {
              const progress = data?.body?.data?.percentage || 0;
              // ✅ Update progress for every received value
              setDeleteProgress(progress);

              // ✅ When completed
              if (progress >= 100) {
                clearInterval(interval);

                setTimeout(async () => {
                  // ✅ Increased delay so user can see 100% "Done" state
                  toast.success(res?.body?.message || "Import completed successfully ✅");

                  setSelected([]); // clear selection
                  await fetchEmployees(); // refresh list
                  fetchUsers(); // refresh parent user list
                  await refreshLocations?.();
                  await refreshDepartments?.();
                  // 🔥 RESET UI
                  setShowDeleteProgress(false);
                  setDeleteProgress(0);
                  setLoading(false);
                  setProgressLabel("");
                }, 1500); // 👈 more user friendly (1.5s)
              }
            }
          } catch (err) {
            console.error("Import Progress API Error:", err);
            clearInterval(interval);
            setShowDeleteProgress(false);
            setLoading(false);
            setProgressLabel("");
          }
        }, 800); // Poll faster (800ms) to ensure we capture all progress logs
      } else {
        toast.error(res?.body?.message || "Import failed");
        setLoading(false);
      }
    } catch (err) {
      console.error("IMPORT ERROR:", err);
      toast.error(err?.response?.data?.body?.message || "Import failed");
      setLoading(false);
    }

    // Cleanup interval if component unmounts
    return () => {
      if (interval) clearInterval(interval);
    };
  };


  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
      <div className="w-full h-[95vh] sm:h-auto sm:max-h-[90vh] sm:w-[95%] lg:w-[90%] max-w-6xl bg-white rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">

        {/* HEADER */}
        <div className="flex justify-between items-center px-4 sm:px-6 py-3 bg-[#07486A] text-white">
          <h2 className="text-sm sm:text-base md:text-lg font-semibold">
            Import Employees by Organization Email ID
          </h2>
          <button onClick={onClose}>✕</button>
        </div>

        {/* BODY */}
        <div className="flex-1 flex flex-col p-3 sm:p-4 md:p-6 overflow-hidden">

          {/* SEARCH + ORG EMAILS + ADD */}
          <div className="flex flex-col gap-3 mb-4">

            {/* Row: Search + Count + Add Button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative w-full sm:w-[280px]">
                <input
                  type="text"
                  placeholder="Search employees by name..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-[#07486A] focus:border-[#07486A]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Search className="absolute right-2 top-2.5 w-4 h-4 text-gray-400" />
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 border border-gray-200 rounded-md px-3 py-2 whitespace-nowrap">
                Total Employees:
                <span className="font-bold text-[#07486A]">{totalCount}</span>
              </div>

              <button
                onClick={handleAddUsers}
                disabled={selected.length === 0 && orgEmailList.length === 0}
                className="bg-[#07486A] hover:bg-[#07486A]/80 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm"
              >
                Import Employees ({selected.length})
              </button>
            </div>

            {/* Org Email Chips Input */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Import Employees by Organization Email ID
                {orgEmailList.length > 0 && (
                  <span className="ml-1 text-[#07486A] font-semibold">
                    ({orgEmailList.length})
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <div
                  className="flex-1 flex flex-wrap items-center gap-1.5 border border-gray-300 rounded-md px-2 py-1.5 bg-white cursor-text min-h-[38px] focus-within:ring-1 focus-within:ring-[#07486A] focus-within:border-[#07486A]"
                  onClick={() =>
                    document.getElementById("orgEmailInput")?.focus()
                  }
                >
                  {orgEmailList.map(({ email, status }, idx) => {
                    const isNotFound = status === "not_found";
                    const chipStyles = isNotFound
                      ? "inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 text-xs px-2 py-1 rounded-full"
                      : "inline-flex items-center gap-1 bg-[#07486A] text-white text-xs px-2 py-1 rounded-full";

                    return (
                      <span key={idx} className={chipStyles}>
                        {email}
                        {isNotFound && (
                          <span className="text-[10px] ml-1 bg-red-200 text-red-700 px-1 rounded">
                            not found
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRemoveConfirm({ email, idx });
                          }}
                          className="hover:bg-white/20 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                  <input
                    id="orgEmailInput"
                    type="email"
                    placeholder={
                      orgEmailList.length === 0
                        ? "Enter organization email IDs"
                        : "Add another organization..."
                    }
                    className="flex-1 min-w-[150px] outline-none text-sm py-0.5 bg-transparent"
                    value={orgEmailInput}
                    onChange={(e) => setOrgEmailInput(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleOrgEmailAdd}
                  className="bg-[#07486A] hover:bg-[#07486A]/80 text-white px-3 py-2 rounded-md text-sm whitespace-nowrap"
                >
                  Add
                </button>
              </div>

            </div>
          </div>


          {/* LOCATION FILTER */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Select Location
            </label>
            <select
              value={selectedLocation?.location_id || ""}
              onChange={(e) => {
                const selected = locations.find(loc => loc.location_id === parseInt(e.target.value));
                setSelectedLocation(selected);
                setCurrentPage(1); // Reset to first page when location changes
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#07486A] focus:border-[#07486A] bg-white"
            >
              <option value="">-- Select a Location --</option>
              {locations.map((location) => (
                <option key={location.location_id} value={location.location_id}>
                  {location.location} ({location.timezone})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 border rounded-md overflow-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-[#F5F7FA] sticky top-0">
                <tr>
                  <th className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={
                        employees.length > 0 &&
                        employees
                          .filter((emp) => !emp.importedStatus)
                          .every((emp) => selected.some((s) => s.id === emp.id)) &&
                        employees.some((emp) => !emp.importedStatus)
                      }
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="p-2 text-left">S.No</th>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Code</th>
                  <th className="p-2 text-left">Department</th>
                  <th className="p-2 text-left">Location</th>
                  <th className="p-2 text-left">Org Id</th>
                </tr>
              </thead>
              <tbody>
                {showDeleteProgress ? (
                  <tr>
                    <td colSpan="8" className="text-center p-8">
                      <div className="w-full max-w-md mx-auto">
                        <div className="flex justify-between text-xs text-green-600 mb-1">
                          <span className="font-semibold">
                            {deleteProgress >= 100
                              ? `${progressLabel} Complete! ✅`
                              : progressLabel === "Removal"
                                ? "Removing Employees..."
                                : "Importing Employees..."}
                          </span>
                          <span className="font-bold">{deleteProgress}%</span>
                        </div>

                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                          <div
                            className="bg-green-500 h-full transition-all duration-500 ease-out"
                            style={{ width: `${deleteProgress}%` }}
                          />
                        </div>
                        {deleteProgress >= 100 && (
                          <p className="text-[10px] text-gray-400 mt-2 italic text-center animate-pulse">
                            Finalizing cleanup...
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan="8" className="text-center p-12">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-[#07486A] border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-gray-500">Loading employees...</span>
                      </div>
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center p-4">
                      No Data Found
                    </td>
                  </tr>
                ) : (
                  employees.map((emp, index) => (
                    <tr key={emp.id} className="border-t hover:bg-gray-50">

                      {/* CHECKBOX */}
                      <td className="p-2 text-center">
                        {emp.importedStatus ? (
                          <span className="text-xs text-green-600 font-medium">
                            Imported
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={selected.some((s) => s.id === emp.id)}
                            onChange={() => handleSelect(emp)}
                          />
                        )}
                      </td>

                      {/* S.NO */}
                      <td className="p-2">
                        {(currentPage - 1) * pageSize + index + 1}
                      </td>

                      <td className="p-2">{emp.email || "-"}</td>
                      <td className="p-2">
                        {emp.first_name || emp.name || "-"}
                      </td>
                      <td className="p-2">{emp.emp_code || "-"}</td>
                      <td className="p-2">{emp.department || "-"}</td>
                      <td className="p-2">{emp.location || "-"}</td>
                      <td className="p-2">{emp.organization_id || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* FOOTER */}
          <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
            {/* <span>
                Showing <span className="font-semibold text-[#07486A]">{employees.length}</span> of <span className="font-semibold text-[#07486A]">{totalCount}</span> employees
              </span> */}
            {selected.length > 0 && (
              <span className="text-[#07486A] font-medium">
                {selected.length} selected
              </span>
            )}
          </div>

        </div>
      </div>

      {/* Remove Confirmation Dialog */}
      {removeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-[90%] max-w-sm p-5">
            {/* <h4 className="text-base font-semibold text-gray-900 mb-2">
              Remove Organization
            </h4> */}

            <p className="text-sm text-gray-600 leading-relaxed mb-5">
            Are you sure you want to remove this email?
              <span className="font-semibold text-red-600 bg-red-50 px-1 py-0.5 rounded">
                {removeConfirm.email}
              </span>
              
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRemoveConfirm(null)}
                className="px-4 py-1.5 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const emailToDelete = removeConfirm?.email;
                  setRemoveConfirm(null);
                  if (emailToDelete) {
                    await handleDeleteAdminEmail(emailToDelete);
                    await fetchAdminEmails();
                    await fetchLocations();
                    await fetchEmployees();
                  }
                }}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportEmpUsersModal;