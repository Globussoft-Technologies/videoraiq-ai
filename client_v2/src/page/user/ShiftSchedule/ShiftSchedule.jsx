import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { ChevronLeft, ChevronRight, Search, Plus, Loader2, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import MultiSelect from '@/components/MultiSelect';
import Pagination from '@/components/Pagination';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/context/PermissionContext';
import {
  fetchSchedule,
  assignScheduleDay,
  clearScheduleDays,
  fetchDesignations,
  fetchDepartments,
  fetchEmployeeLocations,
} from './Api';
import CellEditor from './CellEditor';

const PAGE_SIZES = [10, 25, 50, 100];
const WEEKDAY_LABEL = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** "2026-09" for a Date. */
const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const monthLabel = (key) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const shiftMonth = (key, delta) => {
  const [year, month] = key.split('-').map(Number);
  const at = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
};

const employeeName = (employee) =>
  `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() ||
  employee?.email ||
  'Unnamed';

/** One grid cell: a shift chip, an Off marker, or a "+" to assign. */
const ScheduleCell = memo(function ScheduleCell({ cell, onOpen, disabled }) {
  const handle = (e) => !disabled && onOpen(e.currentTarget);

  if (!cell || cell.type === 'none') {
    return (
      <button
        type="button"
        onClick={handle}
        disabled={disabled}
        title={disabled ? 'No permission to edit' : 'Assign a shift'}
        className="w-full h-full min-h-[38px] flex items-center justify-center text-[var(--tx3)] hover:text-[var(--blue)] hover:bg-[var(--bg2)] rounded-md transition-colors disabled:cursor-default disabled:hover:text-[var(--tx3)] disabled:hover:bg-transparent cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    );
  }

  if (cell.type === 'off') {
    return (
      <button
        type="button"
        onClick={handle}
        disabled={disabled}
        title={cell.source === 'override' ? 'Day off (set for this day)' : 'Week off'}
        className="w-full h-full min-h-[38px] flex items-center justify-center rounded-md bg-[var(--bg3)] text-[var(--tx3)] text-[11px] font-medium hover:opacity-80 transition-opacity disabled:cursor-default cursor-pointer"
      >
        Off
      </button>
    );
  }

  const color = cell.shift?.color || 'var(--blue)';
  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled}
      title={`${cell.shift?.name} (${cell.shift?.startTime}-${cell.shift?.endTime})${
        cell.type === 'half' ? ' · half day' : ''
      }${cell.source === 'override' ? ' · set for this day' : ''}`}
      className="w-full h-full min-h-[38px] flex items-center justify-center rounded-md px-1.5 text-[11px] font-medium leading-tight hover:opacity-85 transition-opacity disabled:cursor-default cursor-pointer relative"
      style={{
        background: `color-mix(in srgb, ${color} 22%, transparent)`,
        color,
        // An overridden cell is outlined so a deliberate change is
        // distinguishable at a glance from one inherited off the shift pattern.
        boxShadow: cell.source === 'override' ? `inset 0 0 0 1px ${color}` : 'none',
      }}
    >
      <span className="truncate">{cell.shift?.name}</span>
      {cell.type === 'half' && (
        <span className="absolute bottom-0.5 right-1 text-[8px] opacity-80">½</span>
      )}
    </button>
  );
});

const ShiftSchedule = () => {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [days, setDays] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [locations, setLocations] = useState([]);
  const [departmentIds, setDepartmentIds] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [locationOptions, setLocationOptions] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [designationOptions, setDesignationOptions] = useState([]);

  const [editing, setEditing] = useState(null); // { anchor, employeeId, date, cell }
  const [savingCell, setSavingCell] = useState(null);
  const scrollRef = useRef(null);

  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.shifts?.view;
  const canEdit = permissions?.shifts?.edit;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSchedule({
        month,
        search: debouncedSearch,
        locations,
        departmentIds,
        designations,
        skip: (page - 1) * pageSize,
        limit: pageSize,
      });
      const data = res?.data?.body?.data;
      setDays(data?.days || []);
      setEmployees(data?.employees || []);
      setShifts(data?.shifts || []);
      setTotal(data?.total || 0);
    } catch (err) {
      const body = err?.response?.data?.body;
      toast.error(
        (Array.isArray(body?.error) ? body.error[0] : body?.error) ||
          body?.message ||
          'Failed to load the schedule',
      );
    } finally {
      setLoading(false);
    }
  }, [month, debouncedSearch, locations, departmentIds, designations, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter options load once; they don't depend on the month.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [locationRes, departmentRes, designationRes] = await Promise.all([
          fetchEmployeeLocations({ limit: 200 }),
          fetchDepartments(0, 200),
          fetchDesignations(),
        ]);
        if (cancelled) return;
        setLocationOptions(
          (locationRes?.data?.body?.data?.locations || []).map((l) => ({
            id: l.locationName,
            label: l.locationName,
          })),
        );
        setDepartmentOptions(
          (departmentRes?.data?.body?.data?.data || []).map((d) => ({
            id: d._id,
            label: d.departmentName,
          })),
        );
        setDesignationOptions(
          (designationRes?.data?.body?.data?.designations || []).map((d) => ({
            id: d,
            label: d,
          })),
        );
      } catch {
        /* filters just stay empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  /**
   * Optimistic cell write: the grid is wide and a full refetch on every click
   * would repaint hundreds of cells and lose the horizontal scroll position.
   * On failure the previous cell is put back and the error surfaced.
   */
  const writeCell = async (employeeId, date, apply, previous) => {
    const key = `${employeeId}:${date}`;
    setSavingCell(key);
    setEditing(null);
    try {
      const cell = await apply();
      setEmployees((rows) =>
        rows.map((row) =>
          String(row._id) === String(employeeId)
            ? { ...row, cells: { ...row.cells, [date]: cell } }
            : row,
        ),
      );
    } catch (err) {
      setEmployees((rows) =>
        rows.map((row) =>
          String(row._id) === String(employeeId)
            ? { ...row, cells: { ...row.cells, [date]: previous } }
            : row,
        ),
      );
      const body = err?.response?.data?.body;
      toast.error(
        (Array.isArray(body?.error) ? body.error[0] : body?.error) ||
          body?.message ||
          'Failed to update the schedule',
      );
    } finally {
      setSavingCell(null);
    }
  };

  const handlePick = ({ shiftId, isOff }) => {
    const { employeeId, date, cell } = editing;
    writeCell(
      employeeId,
      date,
      async () => {
        const res = await assignScheduleDay({ employeeId, date, shiftId, isOff });
        return res?.data?.body?.data?.cell;
      },
      cell,
    );
  };

  const handleClear = async () => {
    const { employeeId, date } = editing;
    const key = `${employeeId}:${date}`;
    setEditing(null);
    setSavingCell(key);
    try {
      await clearScheduleDays({ employeeIds: [employeeId], dates: [date] });
      // What the cell falls back to is the server's call — standing shift plus
      // its working-day pattern — so refetch rather than guess. Clearing is
      // rare, unlike assigning, so the full reload is worth the correctness.
      await load();
    } catch (err) {
      const body = err?.response?.data?.body;
      toast.error(
        (Array.isArray(body?.error) ? body.error[0] : body?.error) ||
          body?.message ||
          'Failed to clear the day',
      );
    } finally {
      setSavingCell(null);
    }
  };

  if (permissionsLoading) return <PageLoader />;
  if (!canView) return <AccessDenied />;

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-[18px] min-h-full">
      <div className="w-full flex-1 flex flex-col p-3 sm:p-5 bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] gap-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] hover:text-[var(--tx)] hover:bg-[var(--bg3)] text-sm transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[var(--tx3)]" />
            <span className="text-sm sm:text-base font-semibold text-[var(--tx)]">
              {monthLabel(month)}
            </span>
            {month !== monthKey(new Date()) && (
              <button
                onClick={() => setMonth(monthKey(new Date()))}
                className="text-[11px] text-[var(--blue)] hover:underline cursor-pointer"
              >
                Today
              </button>
            )}
          </div>

          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] hover:text-[var(--tx)] hover:bg-[var(--bg3)] text-sm transition-colors cursor-pointer"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2">
          {shifts.map((shift) => (
            <span
              key={shift._id}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium"
              style={{
                background: `color-mix(in srgb, ${shift.color || 'var(--blue)'} 20%, transparent)`,
                color: shift.color || 'var(--blue)',
              }}
            >
              {shift.name} ({shift.startTime}-{shift.endTime})
            </span>
          ))}
          <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-[var(--bg3)] text-[var(--tx3)]">
            Off / Week-off
          </span>
        </div>

        {/* Search + filters */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px] gap-3">
          <div className="relative">
            <Input
              type="text"
              placeholder="Name, employee code, or email"
              className="pl-4 pr-10 shadow-none border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] h-10 text-sm focus:border-[var(--blue)]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)]" />
          </div>
          <MultiSelect
            options={departmentOptions}
            value={departmentIds}
            onChange={(v) => {
              setDepartmentIds(v);
              setPage(1);
            }}
            placeholder="All departments"
            tint="#a855f7"
          />
          <MultiSelect
            options={locationOptions}
            value={locations}
            onChange={(v) => {
              setLocations(v);
              setPage(1);
            }}
            placeholder="All locations"
            tint="#22d3ee"
          />
          <MultiSelect
            options={designationOptions}
            value={designations}
            onChange={(v) => {
              setDesignations(v);
              setPage(1);
            }}
            placeholder="All roles"
            tint="#22c55e"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--tx2)]">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-8 px-2 rounded-md border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] text-xs outline-none focus:border-[var(--blue)] cursor-pointer"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>entries</span>
          <span className="ml-auto text-[var(--tx3)]">{total} employees</span>
        </div>

        {/* The grid. The employee column is sticky-left and the date header
            sticky-top, so both stay put while scrolling a month of dates for a
            long roster. */}
        <div
          ref={scrollRef}
          className="relative overflow-auto customscrollbar border border-[var(--bd)] rounded-[12px] max-h-[calc(100vh-420px)] min-h-[320px]"
        >
          {loading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--bg1solid)]/70 backdrop-blur-[1px]">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--tx3)]" />
            </div>
          )}

          <table className="border-collapse w-max min-w-full">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 bg-[var(--bg2)] border-b border-r border-[var(--bd)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--tx2)] min-w-[220px]">
                  Employee
                </th>
                {days.map((day) => (
                  <th
                    key={day.key}
                    className="sticky top-0 z-10 bg-[var(--bg2)] border-b border-[var(--bd)] px-1 py-2 text-center min-w-[74px]"
                    style={
                      day.key === today
                        ? { boxShadow: 'inset 0 -2px 0 0 var(--blue)' }
                        : undefined
                    }
                  >
                    <div
                      className="text-[10px] font-semibold uppercase"
                      style={{ color: day.isWeekend ? 'var(--tx3)' : 'var(--tx2)' }}
                    >
                      {WEEKDAY_LABEL[day.weekdayIndex]}
                    </div>
                    <div
                      className="text-xs font-semibold"
                      style={{ color: day.key === today ? 'var(--blue)' : 'var(--tx)' }}
                    >
                      {day.day}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {employees.map((employee) => (
                <tr key={employee._id} className="group">
                  <td className="sticky left-0 z-10 bg-[var(--bg1solid)] group-hover:bg-[var(--bg2)] border-b border-r border-[var(--bd)] px-3 py-2 transition-colors">
                    <div className="text-sm text-[var(--tx)] font-medium truncate max-w-[200px]">
                      {employeeName(employee)}
                    </div>
                    <div className="text-[11px] text-[var(--tx3)] truncate max-w-[200px]">
                      {employee.employeeCode ?? employee.email}
                      {employee.department ? ` · ${employee.department}` : ''}
                    </div>
                  </td>

                  {days.map((day) => {
                    const cell = employee.cells?.[day.key];
                    const key = `${employee._id}:${day.key}`;
                    return (
                      <td
                        key={day.key}
                        className="border-b border-[var(--bd)] p-1 align-middle"
                        style={
                          day.isWeekend
                            ? { background: 'color-mix(in srgb, var(--bg2) 55%, transparent)' }
                            : undefined
                        }
                      >
                        {savingCell === key ? (
                          <div className="w-full min-h-[38px] flex items-center justify-center">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--tx3)]" />
                          </div>
                        ) : (
                          <ScheduleCell
                            cell={cell}
                            disabled={!canEdit}
                            onOpen={(anchor) =>
                              setEditing({
                                anchor,
                                employeeId: employee._id,
                                date: day.key,
                                cell,
                              })
                            }
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {!loading && employees.length === 0 && (
                <tr>
                  <td
                    colSpan={days.length + 1}
                    className="px-4 py-16 text-center text-sm text-[var(--tx2)]"
                  >
                    No employees match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pt-1 border-t border-[var(--bd)]">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {editing && (
        <CellEditor
          anchor={editing.anchor}
          cell={editing.cell}
          shifts={shifts}
          onPick={handlePick}
          onClear={handleClear}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

export default memo(ShiftSchedule);
