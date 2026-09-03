import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, MapPin, Building2, UserRound, Loader2, AlertTriangle } from 'lucide-react';
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
import MultiSelect from '@/components/MultiSelect';
import {
  assignShift,
  fetchDepartments,
  fetchEmployeeLocations,
  fetchShiftList,
  previewAssignment,
  searchAssignableEmployees,
} from './Api';

const labelClass = 'text-xs text-[var(--tx2)] mb-1 ml-1 block';

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

  const [locations, setLocations] = useState([]);
  const [departmentIds, setDepartmentIds] = useState([]);
  const [allEmployees, setAllEmployees] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [includeSuspended, setIncludeSuspended] = useState(false);

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const individual = mode === 'individual';
  const hasFilter = individual
    ? employeeIds.length > 0
    : locations.length > 0 || departmentIds.length > 0;
  // An empty filter set means "everyone", so the server refuses it unless
  // `allEmployees` is set explicitly. Mirror that here rather than letting the
  // admin hit a 400.
  const canSubmit = Boolean(selectedShiftId) && (hasFilter || (!individual && allEmployees));

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

  // Debounced server-side search: the picker has to work on a roster too large
  // to ship to the browser in one go.
  useEffect(() => {
    if (!open || !individual) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await searchAssignableEmployees(employeeQuery, 50);
        if (cancelled) return;
        const found = res?.data?.body?.data?.employees || [];
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
      } catch {
        /* the picker just stays as it was */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `employeeIds` is read only to preserve selections, so it is intentionally
    // not a trigger — re-running on every tick would fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, individual, employeeQuery]);

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
    setLocations([]);
    setDepartmentIds([]);
    setAllEmployees(false);
    setOverwriteExisting(true);
    setIncludeSuspended(false);
    setPreview(null);
    setSelectedShiftId(shift?._id || '');
  };

  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleAssign = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
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

  const activeShiftName =
    shift?.name || shiftOptions.find((option) => option._id === selectedShiftId)?.name || '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[18px] p-4 sm:p-5 shadow-xl w-[94vw] max-w-[640px] max-h-[92vh] overflow-y-auto overflow-x-hidden top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] hide-scrollbar scrollbar-hide"
        closeBtn="text-[var(--tx2)] hover:text-[var(--tx)] transition-colors top-5 right-5"
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
                placeholder="Select employees…"
                searchPlaceholder="Search by name or email…"
                msg="No employees found"
                tint="#22c55e"
              />
              <p className="text-[11px] text-[var(--tx3)] mt-1.5 ml-1">
                Type to search the full roster — the list shows the first 50 matches.
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
                <span className="text-lg font-semibold text-[var(--tx)]">
                  {preview?.matched ?? 0}
                </span>
              )}
            </div>

            {preview?.matched > 0 && (
              <>
                <div className="text-[11px] text-[var(--tx3)] mt-1">
                  {preview.alreadyAssigned} already on a shift · {preview.unassigned} unassigned
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
            disabled={!canSubmit || submitting || preview?.matched === 0}
            className="bg-[var(--blue)] hover:opacity-95 active:scale-95 text-white rounded-[10px] transition-all cursor-pointer shadow-sm shadow-[var(--blue)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Assigning…' : `Assign${activeShiftName ? ` to ${activeShiftName}` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignShiftModal;
