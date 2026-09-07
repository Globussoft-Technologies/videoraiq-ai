import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, MapPin, Building2, UserRound, Loader2, AlertTriangle } from 'lucide-react';
import moment from 'moment';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import ConfirmationModal from '@/components/DeleteConfirmation';
import MultiSelect from '@/components/MultiSelect';
import SingleDatePicker from '@/components/SingleDatePicker';
import {
  assignShift,
  bulkAssignSchedule,
  fetchDepartments,
  fetchEmployeeLocations,
  fetchShiftList,
  previewAssignment,
  searchAssignableEmployees,
} from './Api';

const labelClass = 'text-xs text-[var(--tx2)] mb-1 ml-1 block';
const EMPLOYEE_PAGE_SIZE = 5000;

/** Small labelled switch — the modal needs three and there is no shared one. */
const Toggle = ({ checked, onChange, label, hint }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="w-full flex items-start gap-3 text-left p-3 rounded-[10px] border border-[var(--bd)] bg-[var(--bg2)] hover:bg-[var(--bg3)] transition-colors cursor-pointer"
    aria-pressed={checked}
  >
    <span
      className="mt-0.5 w-9 h-5 rounded-full shrink-0 relative transition-colors"
      style={{ background: checked ? 'var(--blue)' : 'var(--toggleoff)' }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
        style={{ left: checked ? '18px' : '2px' }}
      />
    </span>
    <span>
      <span className="block text-sm text-[var(--tx)]">{label}</span>
      {hint && <span className="block text-[11px] text-[var(--tx3)] mt-0.5">{hint}</span>}
    </span>
  </button>
);

const employeeName = (employee) =>
  `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() ||
  employee?.email ||
  'Unnamed employee';

/**
 * Assign one shift to a group of staff.
 *
 * `shift` pins the modal to a row's shift; without it the admin picks one, so
 * the same component backs both the row action and the toolbar's Bulk Assign.
 */
const AssignShiftModal = ({ trigger, shift = null, onAssigned }) => {
  const [open, setOpen] = useState(false);
  const [shiftOptions, setShiftOptions] = useState([]);
  const [selectedShiftId, setSelectedShiftId] = useState(shift?._id || '');
  const [locationOptions, setLocationOptions] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);

  // 'group' filters by location/department; 'individual' picks named staff.
  // Both post to the same endpoint — only the filter keys differ.
  const [mode, setMode] = useState('group');
  const [employeeIds, setEmployeeIds] = useState([]);
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [employeeLoadedCount, setEmployeeLoadedCount] = useState(0);
  const [employeeTotalCount, setEmployeeTotalCount] = useState(0);
  const [loadingMoreEmployees, setLoadingMoreEmployees] = useState(false);
  const employeeFetchRef = useRef({ generation: 0, loadingMore: false });
  const autoSelectedEmployeeIdsRef = useRef(new Set());

  // Optional effective range for "Specific employees". When `from` is set the
  // assignment is written as dated ShiftSchedule overrides rather than changing
  // the standing shift; `to` blank means a single day (to === from).
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');

  const [locations, setLocations] = useState([]);
  const [departmentIds, setDepartmentIds] = useState([]);
  const [allEmployees, setAllEmployees] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [includeSuspended, setIncludeSuspended] = useState(false);

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [conflictingEmployees, setConflictingEmployees] = useState([]);
  const [showAllConflicts, setShowAllConflicts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showMatchingEmployees, setShowMatchingEmployees] = useState(false);
  const [matchingEmployeeView, setMatchingEmployeeView] = useState('all');
  const [matchingEmployeeQuery, setMatchingEmployeeQuery] = useState('');
  const [matchingEmployees, setMatchingEmployees] = useState([]);
  const [matchingEmployeesLoading, setMatchingEmployeesLoading] = useState(false);

  const individual = mode === 'individual';
  const todayDate = moment().format('YYYY-MM-DD');
  const hasFilter = individual
    ? employeeIds.length > 0
    : locations.length > 0 || departmentIds.length > 0;
  const dated = individual && Boolean(effectiveFrom);
  const startDateInvalid = dated && effectiveFrom !== todayDate;
  const dateRangeInvalid = dated && effectiveTo && effectiveTo < effectiveFrom;
  // An empty filter set means "everyone", so the server refuses it unless
  // `allEmployees` is set explicitly. Mirror that here rather than letting the
  // admin hit a 400.
  const canSubmit =
    Boolean(selectedShiftId) &&
    !startDateInvalid &&
    !dateRangeInvalid &&
    (hasFilter || (!individual && allEmployees));

  const filters = useMemo(
    () =>
      individual
        ? { employeeIds, overwriteExisting: true, includeSuspended: true }
        : {
            ...(locations.length ? { locations } : {}),
            ...(departmentIds.length ? { departmentIds } : {}),
            allEmployees,
            overwriteExisting,
            includeSuspended,
          },
    [
      individual,
      employeeIds,
      locations,
      departmentIds,
      allEmployees,
      overwriteExisting,
      includeSuspended,
    ],
  );

  // Options are fetched on first open rather than on mount so the page doesn't
  // pay for three requests nobody may use.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const [locationRes, departmentRes] = await Promise.all([
          fetchEmployeeLocations({ limit: 200 }),
          fetchDepartments(0, 200),
        ]);
        if (cancelled) return;

        setLocationOptions(
          (locationRes?.data?.body?.data?.locations || []).map((location) => ({
            id: location.locationName,
            label: location.locationName,
          })),
        );
        setDepartmentOptions(
          (departmentRes?.data?.body?.data?.data || []).map((department) => ({
            id: department._id,
            label: department.departmentName,
          })),
        );
      } catch {
        if (!cancelled) toast.error('Failed to load assignment filters');
      }

      if (shift) return;
      try {
        const shiftRes = await fetchShiftList();
        if (cancelled) return;
        const list = shiftRes?.data?.body?.data?.shifts || [];
        setShiftOptions(list);
        setSelectedShiftId((current) => current || list[0]?._id || '');
      } catch {
        if (!cancelled) toast.error('Failed to load shifts');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, shift]);

  // A different shift has a different existing roster. Clear both the visible
  // selection and the memory used to respect a user's manual deselection.
  useEffect(() => {
    setEmployeeIds([]);
    autoSelectedEmployeeIdsRef.current.clear();
  }, [selectedShiftId]);

  const selectNewlyLoadedAssignedEmployees = useCallback((employees) => {
    if (!selectedShiftId) return;
    const newlyAssignedIds = employees
      .filter((employee) => {
        const employeeShiftId = employee.shiftId?._id || employee.shiftId;
        return String(employeeShiftId || '') === String(selectedShiftId);
      })
      .map((employee) => String(employee._id))
      .filter((id) => !autoSelectedEmployeeIdsRef.current.has(id));

    employees.forEach((employee) => {
      const employeeShiftId = employee.shiftId?._id || employee.shiftId;
      if (String(employeeShiftId || '') === String(selectedShiftId)) {
        autoSelectedEmployeeIdsRef.current.add(String(employee._id));
      }
    });
    if (newlyAssignedIds.length) {
      setEmployeeIds((current) => [...new Set([...current, ...newlyAssignedIds])]);
    }
  }, [selectedShiftId]);

  // Debounced first page + server-side search. Further pages are appended when
  // the options panel is scrolled near the bottom.
  useEffect(() => {
    if (!open || !individual) return undefined;
    let cancelled = false;
    const generation = employeeFetchRef.current.generation + 1;
    employeeFetchRef.current = { generation, loadingMore: false };
    setLoadingMoreEmployees(false);
    setEmployeeLoadedCount(0);
    setEmployeeTotalCount(0);
    const timer = setTimeout(async () => {
      try {
        const res = await searchAssignableEmployees({
          search: employeeQuery,
          skip: 0,
          limit: EMPLOYEE_PAGE_SIZE,
          prioritizeShiftId: selectedShiftId,
        });
        if (cancelled || employeeFetchRef.current.generation !== generation) return;
        const found = res?.data?.body?.data?.employees || [];
        selectNewlyLoadedAssignedEmployees(found);
        setEmployeeOptions((previous) => {
          // Keep already-selected staff in the list, otherwise narrowing the
          // search would drop them from the trigger's summary.
          const kept = previous.filter((option) => employeeIds.includes(option.id));
          const merged = new Map(kept.map((option) => [option.id, option]));
          found.forEach((employee) => {
            merged.set(employee._id, {
              id: employee._id,
              label: [
                employeeName(employee),
                employee.departmentId?.departmentName || employee.location,
              ]
                .filter(Boolean)
                .join(' · '),
            });
          });
          return [...merged.values()];
        });
        setEmployeeLoadedCount(found.length);
        setEmployeeTotalCount(res?.data?.body?.data?.matched ?? found.length);
      } catch {
        /* the picker just stays as it was */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `employeeIds` is read only inside the state updater, so it is intentionally
    // not a trigger — re-running on every tick would fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, individual, employeeQuery, selectedShiftId, selectNewlyLoadedAssignedEmployees]);

  const loadMoreEmployees = useCallback(async () => {
    if (
      employeeFetchRef.current.loadingMore ||
      employeeLoadedCount >= employeeTotalCount
    ) return;

    const generation = employeeFetchRef.current.generation;
    employeeFetchRef.current.loadingMore = true;
    setLoadingMoreEmployees(true);
    try {
      const res = await searchAssignableEmployees({
        search: employeeQuery,
        skip: employeeLoadedCount,
        limit: EMPLOYEE_PAGE_SIZE,
        prioritizeShiftId: selectedShiftId,
      });
      if (employeeFetchRef.current.generation !== generation) return;
      const found = res?.data?.body?.data?.employees || [];
      selectNewlyLoadedAssignedEmployees(found);
      setEmployeeOptions((previous) => {
        const merged = new Map(previous.map((option) => [option.id, option]));
        found.forEach((employee) => {
          merged.set(employee._id, {
            id: employee._id,
            label: [
              employeeName(employee),
              employee.departmentId?.departmentName || employee.location,
            ]
              .filter(Boolean)
              .join(' · '),
          });
        });
        return [...merged.values()];
      });
      setEmployeeLoadedCount((count) => count + found.length);
      setEmployeeTotalCount(res?.data?.body?.data?.matched ?? 0);
    } catch {
      toast.error('Failed to load more employees');
    } finally {
      if (employeeFetchRef.current.generation === generation) {
        employeeFetchRef.current.loadingMore = false;
        setLoadingMoreEmployees(false);
      }
    }
  }, [
    employeeLoadedCount,
    employeeTotalCount,
    employeeQuery,
    selectedShiftId,
    selectNewlyLoadedAssignedEmployees,
  ]);

  const runPreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const res = await previewAssignment({ ...filters, limit: 8 });
      setPreview(res?.data?.body?.data || null);
    } catch {
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!open || individual || !showMatchingEmployees) return undefined;
    const timer = setTimeout(async () => {
      setMatchingEmployeesLoading(true);
      try {
        const res = await previewAssignment({
          ...filters,
          ...(matchingEmployeeView === 'unassigned' ? { overwriteExisting: false } : {}),
          search: matchingEmployeeQuery,
          limit: 5000,
        });
        setMatchingEmployees(res?.data?.body?.data?.employees || []);
      } catch {
        setMatchingEmployees([]);
      } finally {
        setMatchingEmployeesLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, individual, showMatchingEmployees, matchingEmployeeView, matchingEmployeeQuery, filters]);

  // Debounced so dragging through a long location list doesn't fire a request
  // per checkbox.
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(runPreview, 300);
    return () => clearTimeout(timer);
  }, [open, runPreview]);

  const reset = () => {
    setMode('group');
    setEmployeeIds([]);
    setEmployeeOptions([]);
    setEmployeeQuery('');
    setEmployeeLoadedCount(0);
    setEmployeeTotalCount(0);
    setLoadingMoreEmployees(false);
    employeeFetchRef.current = {
      generation: employeeFetchRef.current.generation + 1,
      loadingMore: false,
    };
    autoSelectedEmployeeIdsRef.current.clear();
    setEffectiveFrom('');
    setEffectiveTo('');
    setLocations([]);
    setDepartmentIds([]);
    setAllEmployees(false);
    setOverwriteExisting(true);
    setIncludeSuspended(false);
    setPreview(null);
    setCheckingConflicts(false);
    setConflictingEmployees([]);
    setShowAllConflicts(false);
    setShowMatchingEmployees(false);
    setMatchingEmployeeView('all');
    setMatchingEmployeeQuery('');
    setMatchingEmployees([]);
    setSelectedShiftId(shift?._id || '');
  };

  const handleOpenChange = (next) => {
    // The conflict confirmation is portalled outside the Radix dialog. Treat
    // interactions with it as belonging to the flow instead of letting Radix
    // close and reset the assignment modal underneath it.
    if (!next && conflictingEmployees.length > 0) return;
    setOpen(next);
    if (!next) reset();
  };

  const commitAssignment = async () => {
    setSubmitting(true);
    try {
      if (dated) {
        // "To" is optional — a blank end means a single day.
        const res = await bulkAssignSchedule({
          employeeIds,
          shiftId: selectedShiftId,
          from: effectiveFrom,
          to: effectiveTo || effectiveFrom,
        });
        const data = res?.data?.body?.data;
        toast.success(res?.data?.body?.message || 'Shift scheduled');
        onAssigned?.(data);
        setOpen(false);
        reset();
        return;
      }
      const res = await assignShift(selectedShiftId, filters);
      const data = res?.data?.body?.data;
      toast.success(res?.data?.body?.message || `${data?.modified ?? 0} employees assigned`);
      onAssigned?.(data);
      setOpen(false);
      reset();
    } catch (err) {
      const body = err?.response?.data?.body;
      const detail = Array.isArray(body?.error) ? body.error[0] : body?.error;
      toast.error(detail || body?.message || 'Failed to assign shift');
    } finally {
      setSubmitting(false);
    }
  };

  const findConflictingEmployees = async () => {
    const employees = [];
    let skip = 0;
    let total = employeeIds.length;

    while (skip < total) {
      const res = await previewAssignment({
        employeeIds,
        includeSuspended: true,
        skip,
        limit: 200,
      });
      const data = res?.data?.body?.data || {};
      const page = data.employees || [];
      total = data.matched ?? total;
      employees.push(...page);
      if (!page.length) break;
      skip += page.length;
    }

    return employees.filter((employee) => {
      const currentShiftId = employee.shiftId?._id || employee.shiftId;
      return currentShiftId && String(currentShiftId) !== String(selectedShiftId);
    });
  };

  const handleAssign = async () => {
    if (!canSubmit || checkingConflicts || submitting) return;

    // Date-range assignments are temporary overrides and do not replace the
    // employee's standing shift, so only the standing individual flow warns.
    if (individual && !dated) {
      setCheckingConflicts(true);
      try {
        const conflicts = await findConflictingEmployees();
        if (conflicts.length) {
          setConflictingEmployees(conflicts);
          setShowAllConflicts(false);
          return;
        }
      } catch {
        toast.error('Could not check existing shift assignments');
        return;
      } finally {
        setCheckingConflicts(false);
      }
    }

    await commitAssignment();
  };

  const activeShiftName =
    shift?.name || shiftOptions.find((option) => option._id === selectedShiftId)?.name || '';

  const firstConflict = conflictingEmployees[0] || null;
  const otherConflictCount = Math.max(0, conflictingEmployees.length - 1);

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[18px] p-4 sm:p-5 shadow-xl w-[94vw] max-w-[640px] max-h-[92vh] overflow-y-auto overflow-x-hidden top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] hide-scrollbar scrollbar-hide"
        closeBtn="text-[var(--tx2)] hover:text-[var(--tx)] transition-colors top-5 right-5"
        onInteractOutside={(event) => {
          if (conflictingEmployees.length > 0) {
            event.preventDefault();
            return;
          }
          // The date pickers portal their calendar to <body>, so a click inside
          // one reads as "outside" the dialog — don't let it close the modal.
          if (event.target instanceof Element && event.target.closest('.vq-datepicker-pop')) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="flex-row items-center gap-3 text-left space-y-0">
          <span
            className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
            style={{ background: 'color-mix(in srgb, var(--violet) 16%, transparent)' }}
          >
            <Users className="w-5 h-5 text-[var(--violet)]" />
          </span>
          <div>
            <DialogTitle className="text-base sm:text-lg font-semibold text-[var(--tx)]">
              Assign Shift
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--tx3)]">
              Assign to named staff, or in bulk by location &amp; department
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <label className={labelClass}>Shift</label>
            {shift ? (
              <div className="flex items-center gap-2.5 h-11 px-3.5 rounded-[10px] border border-[var(--bd)] bg-[var(--bg3)]">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: shift.color || 'var(--blue)' }}
                />
                <span className="text-sm text-[var(--tx)]">{shift.name}</span>
                <span className="text-xs text-[var(--tx3)] ml-auto">
                  {shift.startTime} – {shift.endTime}
                </span>
              </div>
            ) : (
              <select
                value={selectedShiftId}
                onChange={(e) => setSelectedShiftId(e.target.value)}
                className="w-full h-11 px-3 rounded-[10px] border border-[var(--bd)] bg-[var(--bg3)] text-[var(--tx)] text-sm outline-none focus:border-[var(--blue)]"
              >
                <option value="">Select a shift…</option>
                {shiftOptions.map((option) => (
                  <option key={option._id} value={option._id}>
                    {option.name} ({option.startTime} – {option.endTime})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-[10px] bg-[var(--bg2)] border border-[var(--bd)]">
            {[
              { id: 'group', label: 'By location / department', icon: Building2 },
              { id: 'individual', label: 'Specific employees', icon: UserRound },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                className="flex items-center justify-center gap-2 py-2 rounded-[8px] text-xs font-medium transition-colors cursor-pointer"
                style={{
                  background: mode === tab.id ? 'var(--bg3)' : 'transparent',
                  color: mode === tab.id ? 'var(--tx)' : 'var(--tx3)',
                }}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {individual ? (
            <div>
              <label className={labelClass}>
                <UserRound className="w-3 h-3 inline mr-1 -mt-0.5" />
                Employees
              </label>
              <MultiSelect
                options={employeeOptions}
                value={employeeIds}
                onChange={setEmployeeIds}
                onSearchChange={setEmployeeQuery}
                onLoadMore={loadMoreEmployees}
                hasMore={employeeLoadedCount < employeeTotalCount}
                loadingMore={loadingMoreEmployees}
                placeholder="Select employees…"
                searchPlaceholder="Search by name or email…"
                msg="No employees found"
                tint="#22c55e"
                maxHeight="max-h-[320px]"
              />
              <p className="text-[11px] text-[var(--tx3)] mt-1.5 ml-1">
                Scroll to load the full roster, or type to search by name or email.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className={labelClass}>From</label>
                  <SingleDatePicker
                    value={effectiveFrom}
                    minDate={todayDate}
                    maxDate={todayDate}
                    placeholder="Select start date"
                    clearable
                    onChange={(date) => {
                      const allowedDate = !date || date === todayDate ? date : '';
                      setEffectiveFrom(allowedDate);
                      // From gates the dated mode — clearing it (or moving it
                      // past the end) drops a now-invalid end date too.
                      if (
                        !allowedDate ||
                        (effectiveTo && allowedDate && effectiveTo < allowedDate)
                      ) setEffectiveTo('');
                    }}
                  />
                </div>
                <div>
                  <label className={labelClass}>To (optional)</label>
                  <SingleDatePicker
                    value={effectiveTo}
                    minDate={effectiveFrom || undefined}
                    placeholder={effectiveFrom ? 'Select end date' : 'Pick a start date first'}
                    clearable
                    onChange={(date) => effectiveFrom && setEffectiveTo(date)}
                  />
                </div>
              </div>
              <p className="text-[11px] text-[var(--tx3)] mt-1.5 ml-1">
                {startDateInvalid
                  ? 'The start date must be today.'
                  : dateRangeInvalid
                  ? 'The end date is before the start date.'
                  : dated
                  ? 'Scheduled for the selected day(s) only — the standing shift is unchanged.'
                  : 'Leave the dates blank to set this as the standing shift.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>
                    <MapPin className="w-3 h-3 inline mr-1 -mt-0.5" />
                    Location
                  </label>
                  <MultiSelect
                    options={locationOptions}
                    value={locations}
                    onChange={setLocations}
                    placeholder="All locations"
                    searchPlaceholder="Search locations…"
                    msg="No locations"
                    tint="#22d3ee"
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <Building2 className="w-3 h-3 inline mr-1 -mt-0.5" />
                    Department
                  </label>
                  <MultiSelect
                    options={departmentOptions}
                    value={departmentIds}
                    onChange={setDepartmentIds}
                    placeholder="All departments"
                    searchPlaceholder="Search departments…"
                    msg="No departments"
                    tint="#a855f7"
                  />
                </div>
              </div>

              {hasFilter && (
                <p className="text-[11px] text-[var(--tx3)] ml-1">
                  Filters are combined — an employee must match every one of them.
                </p>
              )}

              <div className="space-y-2">
                {!hasFilter && (
                  <Toggle
                    checked={allEmployees}
                    onChange={setAllEmployees}
                    label="Assign to every employee"
                    hint="Required while no location or department is selected."
                  />
                )}
                <Toggle
                  checked={overwriteExisting}
                  onChange={setOverwriteExisting}
                  label="Replace existing shifts"
                  hint="Off: only employees with no shift yet are assigned."
                />
                <Toggle
                  checked={includeSuspended}
                  onChange={setIncludeSuspended}
                  label="Include suspended employees"
                />
              </div>
            </>
          )}

          <div className="rounded-[12px] border border-[var(--bd)] bg-[var(--bg2)] p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[var(--tx2)]">Matching employees</span>
              {previewing ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--tx3)]" />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMatchingEmployees((visible) => !visible)}
                  className="text-lg font-semibold text-[var(--blue)] underline underline-offset-2 decoration-dotted cursor-pointer"
                  title="View matching employees"
                >
                  {preview?.matched ?? 0}
                </button>
              )}
            </div>

            {preview?.matched > 0 && (
              <>
                <div className="text-[11px] text-[var(--tx3)] mt-1">
                  <button type="button" onClick={() => { setMatchingEmployeeView('all'); setShowMatchingEmployees(true); }} className="text-[var(--blue)] underline underline-offset-2 decoration-dotted cursor-pointer">{preview.alreadyAssigned} already on a shift</button>
                  {' · '}
                  <button type="button" onClick={() => { setMatchingEmployeeView('unassigned'); setShowMatchingEmployees(true); }} className="text-[var(--blue)] underline underline-offset-2 decoration-dotted cursor-pointer">{preview.unassigned} unassigned</button>
                  <span className="hidden">
                  {preview.alreadyAssigned} already on a shift · {preview.unassigned} unassigned
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(preview.employees || []).map((employee) => (
                    <span
                      key={employee._id}
                      className="px-2 py-1 rounded-md bg-[var(--bg3)] border border-[var(--bd)] text-[11px] text-[var(--tx2)]"
                      title={[employee.location, employee.departmentId?.departmentName]
                        .filter(Boolean)
                        .join(' · ')}
                    >
                      {employeeName(employee)}
                    </span>
                  ))}
                  {preview.matched > (preview.employees || []).length && (
                    <span className="px-2 py-1 text-[11px] text-[var(--tx3)]">
                      +{preview.matched - preview.employees.length} more
                    </span>
                  )}
                </div>
                {showMatchingEmployees && (
                  <div className="mt-3 rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] overflow-hidden">
                    <div className="flex items-center gap-1 p-2 border-b border-[var(--bd)]">
                      <button type="button" onClick={() => setMatchingEmployeeView('all')} className={`px-2 py-1 rounded text-[11px] ${matchingEmployeeView === 'all' ? 'bg-[var(--blue)] text-white' : 'text-[var(--tx2)]'}`}>All</button>
                      <button type="button" onClick={() => setMatchingEmployeeView('unassigned')} className={`px-2 py-1 rounded text-[11px] ${matchingEmployeeView === 'unassigned' ? 'bg-[var(--blue)] text-white' : 'text-[var(--tx2)]'}`}>Unassigned</button>
                      <input
                        value={matchingEmployeeQuery}
                        onChange={(event) => setMatchingEmployeeQuery(event.target.value)}
                        placeholder="Search matching employees..."
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-md border border-[var(--bd)] bg-[var(--bg2)] text-xs text-[var(--tx)] outline-none focus:border-[var(--blue)]"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto customscrollbar divide-y divide-[var(--bd)]">
                      {matchingEmployeesLoading ? (
                        <div className="flex justify-center py-5"><Loader2 className="w-4 h-4 animate-spin text-[var(--tx3)]" /></div>
                      ) : matchingEmployees.length ? (
                        matchingEmployees.map((employee) => (
                          <div key={employee._id} className="px-2.5 py-2 text-xs text-[var(--tx)]">
                            {employeeName(employee)}
                            {(employee.departmentId?.departmentName || employee.location) && (
                              <span className="ml-1 text-[var(--tx3)]">· {employee.departmentId?.departmentName || employee.location}</span>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-5 text-center text-xs text-[var(--tx3)]">No matching employees found.</div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {!previewing && preview?.matched === 0 && (
              <div className="flex items-center gap-2 text-[11px] text-[var(--warn)] mt-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                No employees match these filters.
              </div>
            )}

            {!overwriteExisting && preview?.alreadyAssigned > 0 && (
              <div className="text-[11px] text-[var(--tx3)] mt-2">
                {preview.alreadyAssigned} will be skipped because they already hold a shift.
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-5 flex flex-row justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="rounded-[10px] border-[var(--bd)] text-[var(--tx2)] hover:bg-[var(--bg3)] hover:text-[var(--tx)] bg-transparent transition-colors"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAssign}
            disabled={!canSubmit || checkingConflicts || submitting || preview?.matched === 0}
            className="bg-[var(--blue)] hover:opacity-95 active:scale-95 text-white rounded-[10px] transition-all cursor-pointer shadow-sm shadow-[var(--blue)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checkingConflicts
              ? 'Checking…'
              : submitting
              ? 'Assigning…'
              : dated
              ? 'Schedule shift'
              : `Assign${activeShiftName ? ` to ${activeShiftName}` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmationModal
      open={conflictingEmployees.length > 0}
      title="Replace existing shifts?"
      icon={<AlertTriangle className="w-5 h-5 text-[var(--warn)]" />}
      confirmLabel="Replace and assign"
      confirmClass="bg-[var(--warn)] text-white hover:opacity-90 shadow-sm shadow-[var(--warn)]/20"
      loading={submitting}
      onClose={() => {
        if (submitting) return;
        setConflictingEmployees([]);
        setShowAllConflicts(false);
      }}
      onConfirm={async () => {
        setConflictingEmployees([]);
        setShowAllConflicts(false);
        await commitAssignment();
      }}
      message={firstConflict ? (
        <div className="text-left">
          <p className="text-center">
            <strong className="text-[var(--tx)]">{employeeName(firstConflict)}</strong>{' '}
            <span className="text-[11px] text-[var(--tx3)]">
              ({firstConflict.shiftId?.name || 'Current shift'})
            </span>
            {otherConflictCount > 0 && (
              <>
                {' '}and{' '}
                <button
                  type="button"
                  onClick={() => setShowAllConflicts((shown) => !shown)}
                  className="font-semibold text-[var(--brand)] underline underline-offset-2 cursor-pointer"
                >
                  {otherConflictCount} other{otherConflictCount === 1 ? '' : 's'}
                </button>
              </>
            )}{' '}
            {conflictingEmployees.length === 1 ? 'is' : 'are'} already assigned to another shift.
          </p>

          {showAllConflicts && (
            <div className="mt-3 max-h-44 overflow-y-auto customscrollbar rounded-lg border border-[var(--bd)] bg-[var(--bg2)] divide-y divide-[var(--bd)]">
              {conflictingEmployees.map((employee) => (
                <div key={employee._id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-xs text-[var(--tx)]">
                    {employeeName(employee)}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--tx3)]">
                    ({employee.shiftId?.name || 'Current shift'})
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-center text-xs text-[var(--tx3)]">
            Continuing will replace their existing shift with {activeShiftName || 'the selected shift'}.
          </p>
        </div>
      ) : null}
    />
    </>
  );
};

export default AssignShiftModal;
