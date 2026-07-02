import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  addempUsers,
  addEmpEmails,
  getEmpUsers,
  getEmpEmails,
  deleteEmpEmail,
  getLocationByEmpEmail,
  importUsersProgress,
} from './Api';

const ImportEmpUsersModal = ({ open, onClose, fetchUsers, refreshLocations, refreshDepartments }) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [showDeleteProgress, setShowDeleteProgress] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');

  const [employees, setEmployees] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [orgEmailList, setOrgEmailList] = useState([]);
  const [orgEmailInput, setOrgEmailInput] = useState('');
  const [orgEmployeeCount] = useState(10);
  const [pageSize] = useState(10);

  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchEmployees = async (knownCount = null) => {
    if (!open) return;
    try {
      setLoading(true);
      const basePayload = { skip: 0, limit: 10, name: debouncedSearch };
      if (orgEmailList.length > 0) basePayload.organization_emails = orgEmailList.map((i) => i.email);
      if (orgEmployeeCount && Number(orgEmployeeCount) > 0)
        basePayload.employeeCount = Number(orgEmployeeCount);
      if (selectedLocation?.location_id) basePayload.location_id = selectedLocation.location_id;

      let count = knownCount;
      if (!count) {
        const countRes = await getEmpUsers(basePayload);
        count =
          countRes?.body?.data?.count ||
          countRes?.body?.data?.empOrgDataArray?.[0]?.total_count ||
          0;
        setTotalCount(count);
      }
      if (count > 0) {
        const allRes = await getEmpUsers({ ...basePayload, limit: count });
        setEmployees(allRes?.body?.data?.empOrgDataArray || allRes?.body?.data?.users || []);
      } else {
        setEmployees([]);
      }
      setSelected([]);
    } catch (err) {
      console.error('API Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminEmails = async () => {
    try {
      const res = await getEmpEmails();
      if (res?.statusCode === 200 && res?.body?.status === 'success') {
        const data = res?.body?.data || [];
        setOrgEmailList(data.map((item) => ({ email: item.email, status: item.status || 'success' })));
      } else {
        toast.error(res?.body?.message || 'Failed to load employee emails.');
      }
    } catch (err) {
      console.error('Get Emp Emails Error:', err);
      toast.error('Failed to load employee emails.');
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await getLocationByEmpEmail();
      if (res?.statusCode === 200 && res?.body?.status === 'success') {
        setLocations(res?.body?.data?.locations || []);
      }
    } catch (err) {
      console.error('Fetch Locations Error:', err);
    }
  };

  useEffect(() => {
    if (open) fetchEmployees();
  }, [currentPage, open, debouncedSearch, pageSize, selectedLocation, orgEmailList]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) {
      fetchAdminEmails();
      fetchLocations();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const handleSelect = (emp) => {
    setSelected((prev) =>
      prev.some((e) => e.id === emp.id) ? prev.filter((e) => e.id !== emp.id) : [...prev, emp]
    );
  };

  const handleSelectAll = () => {
    const selectable = employees.filter((emp) => !emp.importedStatus);
    const allSelected =
      selectable.length > 0 && selectable.every((emp) => selected.some((s) => s.id === emp.id));
    setSelected(allSelected ? [] : selectable);
  };

  const handleOrgEmailAdd = async () => {
    const email = orgEmailInput.trim().replace(/,$/, '');
    if (!email) {
      toast.error('Please enter a valid email address.');
      return;
    }
    if (orgEmailList.some((item) => item.email === email)) {
      toast.error('Email already added.');
      setOrgEmailInput('');
      return;
    }
    try {
      setLoading(true);
      const res = await addEmpEmails({ emails: [email] });
      if (res?.statusCode === 200 && res?.body?.status === 'success') {
        toast.success(res?.body?.message || 'Employee email added successfully.');
        fetchLocations();
        const data = res?.body?.data || [{ email, status: 'success' }];
        const mapped = data.map((item) => ({ email: item.email, status: item.status || 'success' }));
        setOrgEmailList((prev) => {
          const withoutExisting = prev.filter((i) => !mapped.some((m) => m.email === i.email));
          return [...withoutExisting, ...mapped];
        });
      } else {
        toast.error(res?.body?.message || 'Failed to add employee email.');
      }
    } catch (err) {
      console.error('Add Emp Email Error:', err);
      toast.error(err?.response?.data?.body?.message || 'Failed to add employee email.');
    } finally {
      setLoading(false);
      setOrgEmailInput('');
    }
  };

  const handleDeleteAdminEmail = async (email) => {
    try {
      setLoading(true);
      const res = await deleteEmpEmail({ email });
      if (res?.statusCode === 200 && res?.body?.status === 'success') {
        toast.success(`"${email}" removed successfully`);
        await fetchAdminEmails();
        await fetchLocations();
      } else {
        toast.error(res?.body?.message || 'Failed to delete email.');
      }
    } catch (err) {
      console.error('Delete Error:', err);
      toast.error(err?.response?.data?.body?.message || 'Failed to delete email.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUsers = async () => {
    const selectedEmails = selected.map((emp) => emp.email).filter(Boolean);
    const orgEmails = orgEmailList.map((item) => item.email);
    const finalEmails = orgEmails.length > 0 ? orgEmails : selectedEmails;

    if (finalEmails.length === 0) {
      toast.error('Please add organization email IDs or select employee rows to import.');
      return;
    }

    let interval;
    try {
      setLoading(true);
      const payloadForApi = {
        usersData: selected.map((emp) => {
          const { importedStatus, ...rest } = emp;
          return {
            ...rest,
            name: emp.name || emp.first_name,
            employee_unique_id: emp.employee_unique_id || emp.email,
          };
        }),
      };

      const res = await addempUsers(payloadForApi);
      if (res?.statusCode === 200 && res?.body?.status === 'success') {
        toast.warning('Importing employees...');
        setProgressLabel('Import');
        setShowDeleteProgress(true);
        setDeleteProgress(0);

        interval = setInterval(async () => {
          try {
            const data = await importUsersProgress();
            if (data?.statusCode === 200) {
              const progress = data?.body?.data?.percentage || 0;
              setDeleteProgress(progress);
              if (progress >= 100) {
                clearInterval(interval);
                setTimeout(async () => {
                  toast.success(res?.body?.message || 'Import completed successfully');
                  setSelected([]);
                  await fetchEmployees();
                  fetchUsers?.();
                  await refreshLocations?.();
                  await refreshDepartments?.();
                  setShowDeleteProgress(false);
                  setDeleteProgress(0);
                  setLoading(false);
                  setProgressLabel('');
                }, 1500);
              }
            }
          } catch (err) {
            console.error('Import Progress API Error:', err);
            clearInterval(interval);
            setShowDeleteProgress(false);
            setLoading(false);
            setProgressLabel('');
          }
        }, 800);
      } else {
        toast.error(res?.body?.message || 'Import failed');
        setLoading(false);
      }
    } catch (err) {
      console.error('IMPORT ERROR:', err);
      toast.error(err?.response?.data?.body?.message || 'Import failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[70]">
      <div className="w-full h-[95vh] sm:h-auto sm:max-h-[90vh] sm:w-[95%] lg:w-[90%] max-w-6xl bg-[var(--bg1solid)] border border-[var(--bd)] rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-4 sm:px-6 py-3 bg-[var(--blue)] text-white">
          <h2 className="text-sm sm:text-base md:text-lg font-semibold">
            Import Employees by Organization Email ID
          </h2>
          <button onClick={onClose} className="cursor-pointer hover:opacity-80">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col p-3 sm:p-4 md:p-6 overflow-hidden">
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative w-full sm:w-[280px]">
                <input
                  type="text"
                  placeholder="Search employees by name..."
                  className="w-full border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Search className="absolute right-2 top-2.5 w-4 h-4 text-[var(--tx3)]" />
              </div>

              <div className="flex items-center gap-2 text-sm text-[var(--tx2)] bg-[var(--bg2)] border border-[var(--bd)] rounded-md px-3 py-2 whitespace-nowrap">
                Total Employees:
                <span className="font-bold text-[var(--blue)]">{totalCount}</span>
              </div>

              <button
                onClick={handleAddUsers}
                disabled={selected.length === 0 && orgEmailList.length === 0}
                className="bg-[var(--blue)] hover:opacity-90 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm cursor-pointer"
              >
                Import Employees ({selected.length})
              </button>
            </div>

            {/* Org email chips */}
            <div>
              <label className="block text-xs font-medium text-[var(--tx2)] mb-1">
                Import Employees by Organization Email ID
                {orgEmailList.length > 0 && (
                  <span className="ml-1 text-[var(--blue)] font-semibold">({orgEmailList.length})</span>
                )}
              </label>
              <div className="flex gap-2">
                <div className="flex-1 flex flex-wrap items-center gap-1.5 border border-[var(--bd)] bg-[var(--bg2)] rounded-md px-2 py-1.5 cursor-text min-h-[38px] focus-within:ring-1 focus-within:ring-[var(--blue)]">
                  {orgEmailList.map(({ email, status }, idx) => {
                    const isNotFound = status === 'not_found';
                    return (
                      <span
                        key={idx}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                          isNotFound
                            ? 'bg-[var(--crit)]/15 text-[var(--crit)] border border-[var(--crit)]/30'
                            : 'bg-[var(--blue)] text-white'
                        }`}
                      >
                        {email}
                        {isNotFound && <span className="text-[10px] ml-1">not found</span>}
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
                    type="email"
                    placeholder={
                      orgEmailList.length === 0
                        ? 'Enter organization email IDs'
                        : 'Add another organization...'
                    }
                    className="flex-1 min-w-[150px] outline-none text-sm py-0.5 bg-transparent text-[var(--tx)]"
                    value={orgEmailInput}
                    onChange={(e) => setOrgEmailInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleOrgEmailAdd())}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleOrgEmailAdd}
                  className="bg-[var(--blue)] hover:opacity-90 text-white px-3 py-2 rounded-md text-sm whitespace-nowrap cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Location filter */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-[var(--tx2)] mb-1">Select Location</label>
            <select
              value={selectedLocation?.location_id || ''}
              onChange={(e) => {
                const found = locations.find((loc) => loc.location_id === parseInt(e.target.value, 10));
                setSelectedLocation(found);
                setCurrentPage(1);
              }}
              className="w-full border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
            >
              <option value="">-- Select a Location --</option>
              {locations.map((location) => (
                <option key={location.location_id} value={location.location_id}>
                  {location.location} ({location.timezone})
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="flex-1 border border-[var(--bd)] rounded-md overflow-auto vq-scroll">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-[var(--bg2)] sticky top-0 text-[var(--tx2)]">
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
              <tbody className="text-[var(--tx)]">
                {showDeleteProgress ? (
                  <tr>
                    <td colSpan="8" className="text-center p-8">
                      <div className="w-full max-w-md mx-auto">
                        <div className="flex justify-between text-xs text-[var(--ok)] mb-1">
                          <span className="font-semibold">
                            {deleteProgress >= 100 ? `${progressLabel} Complete!` : 'Importing Employees...'}
                          </span>
                          <span className="font-bold">{deleteProgress}%</span>
                        </div>
                        <div className="w-full bg-[var(--bg3)] rounded-full h-3 overflow-hidden">
                          <div
                            className="bg-[var(--ok)] h-full transition-all duration-500 ease-out"
                            style={{ width: `${deleteProgress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan="8" className="text-center p-12">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-[var(--blue)] border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-[var(--tx3)]">Loading employees...</span>
                      </div>
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center p-4 text-[var(--tx3)]">
                      No Data Found
                    </td>
                  </tr>
                ) : (
                  employees.map((emp, index) => (
                    <tr key={emp.id} className="border-t border-[var(--bd)] hover:bg-[var(--bg2)]">
                      <td className="p-2 text-center">
                        {emp.importedStatus ? (
                          <span className="text-xs text-[var(--ok)] font-medium">Imported</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={selected.some((s) => s.id === emp.id)}
                            onChange={() => handleSelect(emp)}
                          />
                        )}
                      </td>
                      <td className="p-2">{(currentPage - 1) * pageSize + index + 1}</td>
                      <td className="p-2">{emp.email || '-'}</td>
                      <td className="p-2">{emp.first_name || emp.name || '-'}</td>
                      <td className="p-2">{emp.emp_code || '-'}</td>
                      <td className="p-2">{emp.department || '-'}</td>
                      <td className="p-2">{emp.location || '-'}</td>
                      <td className="p-2">{emp.organization_id || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center mt-4 text-sm text-[var(--tx2)]">
            {selected.length > 0 && (
              <span className="text-[var(--blue)] font-medium">{selected.length} selected</span>
            )}
          </div>
        </div>
      </div>

      {/* Remove confirmation */}
      {removeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80]">
          <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-lg shadow-xl w-[90%] max-w-sm p-5">
            <p className="text-sm text-[var(--tx2)] leading-relaxed mb-5">
              Are you sure you want to remove this email?{' '}
              <span className="font-semibold text-[var(--crit)] bg-[var(--crit)]/10 px-1 py-0.5 rounded">
                {removeConfirm.email}
              </span>
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRemoveConfirm(null)}
                className="px-4 py-1.5 border border-[var(--bd)] rounded-md text-sm text-[var(--tx2)] hover:bg-[var(--bg3)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const emailToDelete = removeConfirm?.email;
                  setRemoveConfirm(null);
                  if (emailToDelete) {
                    await handleDeleteAdminEmail(emailToDelete);
                    await fetchEmployees();
                  }
                }}
                className="px-4 py-1.5 bg-[var(--crit)] hover:opacity-90 text-white rounded-md text-sm cursor-pointer"
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
