import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { Search, CirclePlus, Trash, Users, Moon, Sun } from 'lucide-react';
import { FiEdit3 } from 'react-icons/fi';
import { toast } from 'sonner';
import DeleteConfirmation from '@/components/DeleteConfirmation';
import Pagination from '@/components/Pagination';
import PermissionTable from '@/components/PermissionTable';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/context/PermissionContext';
import { fetchShifts, deleteShift } from './Api';
import ShiftForm from './ShiftForm';
import AssignShiftModal from './AssignShiftModal';
import ShiftEmployeesModal from './ShiftEmployeesModal';
import { DAYS, DAY_TYPE_META, formatDuration, readWorkingDays, windowMinutes } from './shiftDays';

const styles = {
  text: 'text-[var(--tx)] text-xs md:text-sm 2xl:text-sm font-normal',
  muted: 'text-[var(--tx3)] text-xs md:text-sm font-normal',
};

const iconButton =
  'hover:opacity-80 cursor-pointer p-1 rounded hover:bg-[var(--bg2)] transition-colors';

/** The S M T W T F S strip from the shift table. */
const WorkingDayStrip = ({ shift }) => {
  const days = readWorkingDays(shift);
  return (
    <div className="flex items-center gap-1">
      {DAYS.map(({ key, letter, short }) => {
        const type = days[key]?.type || 'off';
        const meta = DAY_TYPE_META[type];
        return (
          <span
            key={key}
            title={`${short}: ${meta.label}${type === 'off' ? '' : ' day'}`}
            className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[11px] font-semibold border"
            style={{ background: meta.bg, color: meta.fg, borderColor: meta.border }}
          >
            {letter}
          </span>
        );
      })}
    </div>
  );
};

const Badge = ({ children, tint, title }) => (
  <span
    title={title}
    className="px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
    style={{
      color: tint,
      background: `color-mix(in srgb, ${tint} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tint} 34%, transparent)`,
    }}
  >
    {children}
  </span>
);

const Shifts = () => {
  const [shifts, setShifts] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [onLoading, setOnLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(8);
  const [total, setTotal] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.shifts?.view;
  const canEdit = permissions?.shifts?.edit;
  const canDelete = permissions?.shifts?.delete;
  const canCreate = permissions?.shifts?.create;

  const loadShifts = useCallback(async () => {
    setOnLoading(true);
    try {
      const skip = (currentPage - 1) * limit;
      const resp = await fetchShifts(skip, limit, searchInput);
      if (resp?.data?.statusCode === 200) {
        const data = resp?.data?.body?.data;
        setShifts(data?.shifts || []);
        setTotal(data?.total || 0);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch shifts');
    } finally {
      setOnLoading(false);
    }
  }, [currentPage, limit, searchInput]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  // Refetching rather than merging locally: creating a shift can flip another
  // one's default flag, and assigning changes a different row's employee
  // count, so the whole page has to come back from the server anyway.
  useEffect(() => {
    const timer = setTimeout(() => setCurrentPage(1), 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleConfirmDelete = async () => {
    try {
      const response = await deleteShift(deleteTarget._id);
      if (response?.data?.statusCode === 200) {
        const unassigned = response?.data?.body?.data?.unassignedEmployees || 0;
        toast.success(
          unassigned
            ? `Shift deleted — ${unassigned} employee${unassigned === 1 ? '' : 's'} unassigned`
            : response?.data?.body?.message || 'Shift deleted successfully',
        );
        loadShifts();
      }
    } catch (error) {
      toast.error(error?.response?.data?.body?.message || 'Failed to delete shift');
    } finally {
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Shift Name',
        cell: ({ row }) => {
          const shift = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: shift.color || 'var(--blue)' }}
              />
              <span className={styles.text}>{shift.name}</span>
              {shift.isActive === false && <Badge tint="var(--tx3)">Inactive</Badge>}
            </div>
          );
        },
      },
      {
        accessorKey: 'timing',
        header: 'Timing',
        cell: ({ row }) => (
          <span className={styles.text}>
            {row.original.startTime} - {row.original.endTime}
          </span>
        ),
      },
      {
        accessorKey: 'breakMinutes',
        header: 'Break',
        cell: ({ row }) => <span className={styles.text}>{row.original.breakMinutes ?? 0}m</span>,
      },
      {
        accessorKey: 'duration',
        header: 'Payable',
        cell: ({ row }) => {
          const span = windowMinutes(row.original.startTime, row.original.endTime);
          // What the employee is actually paid for: the window less the break.
          const payable = span === null ? null : Math.max(0, span - (row.original.breakMinutes || 0));
          return <span className={styles.muted}>{formatDuration(payable)}</span>;
        },
      },
      {
        accessorKey: 'workingDays',
        header: 'Working Days',
        cell: ({ row }) => <WorkingDayStrip shift={row.original} />,
      },
      {
        accessorKey: 'grace',
        header: 'Grace (L/E)',
        cell: ({ row }) => (
          <span className={styles.muted}>
            {row.original.graceLateMinutes ?? 0}m / {row.original.graceEarlyMinutes ?? 0}m
          </span>
        ),
      },
      {
        accessorKey: 'assignedEmployees',
        header: 'Assigned',
        // The count is the way into the roster — it was the only place the
        // assignment was visible at all, with no way to see who was behind it.
        cell: ({ row }) => {
          const count = row.original.assignedEmployees ?? 0;
          if (!count) {
            return (
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[var(--tx3)]" />
                <span className={styles.muted}>0</span>
              </span>
            );
          }
          return (
            <ShiftEmployeesModal
              shift={row.original}
              onChanged={loadShifts}
              trigger={
                <button
                  title={`View the ${count} employee${count === 1 ? '' : 's'} on this shift`}
                  className="inline-flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-md hover:bg-[var(--bg2)] transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-[var(--blue)]" />
                  <span className="text-[var(--blue)] text-xs md:text-sm font-medium underline underline-offset-2 decoration-dotted">
                    {count}
                  </span>
                </button>
              }
            />
          );
        },
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            {row.original.isNightShift ? (
              <Badge tint="var(--violet)" title="Window crosses midnight">
                Night
              </Badge>
            ) : (
              <Badge tint="var(--warn)">Day</Badge>
            )}
            {row.original.isDefault && (
              <Badge tint="var(--ok)" title="New employees inherit this shift">
                Default
              </Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'actions',
        header: 'Action',
        cell: ({ row }) => (
          <div className="flex items-center gap-2 md:gap-3">
            {canEdit && (
              <AssignShiftModal
                shift={row.original}
                onAssigned={loadShifts}
                trigger={
                  <button
                    className={`text-[var(--violet)] ${iconButton}`}
                    title={`Assign staff to ${row.original.name}`}
                  >
                    <Users strokeWidth={1.5} className="w-4 h-4 2xl:w-[18px] 2xl:h-[18px]" />
                  </button>
                }
              />
            )}
            {canEdit && (
              <ShiftForm
                mode="edit"
                initialValues={row.original}
                onSave={loadShifts}
                trigger={
                  <button className={`text-[var(--blue)] ${iconButton}`} title="Edit shift">
                    <FiEdit3 strokeWidth={1.5} className="w-4 h-4 2xl:w-5 2xl:h-5" />
                  </button>
                }
              />
            )}
            {canDelete && (
              <button
                onClick={() => {
                  setDeleteTarget(row.original);
                  setShowDeleteModal(true);
                }}
                className={`text-[var(--crit)] ${iconButton}`}
                title="Delete shift"
              >
                <Trash strokeWidth={1.5} className="w-4 h-4 2xl:w-[18px] 2xl:h-[18px]" />
              </button>
            )}
          </div>
        ),
      },
    ],
    [canEdit, canDelete, loadShifts],
  );

  if (permissionsLoading) return <PageLoader />;
  if (!canView) return <AccessDenied />;

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-[18px] min-h-full">
      <div className="w-full flex-1 flex flex-col justify-between p-3 sm:p-6 bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] space-y-4">
        <div className="space-y-4 flex-1">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="relative w-full md:w-[30%]">
              <Input
                type="text"
                placeholder="Search shift..."
                className="pl-4 pr-10 shadow-none border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] h-10 text-sm focus:border-[var(--blue)] focus:ring-1 focus:ring-[var(--blue)]"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)]" />
            </div>

            <div className="flex items-center gap-2.5">
              {canEdit && (
                <AssignShiftModal
                  onAssigned={loadShifts}
                  trigger={
                    <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] hover:bg-[var(--bg3)] active:scale-95 transition-all cursor-pointer">
                      <Users className="w-4 h-4 text-[var(--violet)]" />
                      <span>Bulk Assign</span>
                    </button>
                  }
                />
              )}
              {canCreate && (
                <ShiftForm
                  mode="create"
                  onSave={loadShifts}
                  trigger={
                    <button
                      className="flex items-center gap-2 px-4 py-2 hover:opacity-95 active:scale-95 text-white rounded-lg text-sm font-medium transition-all cursor-pointer"
                      style={{
                        background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                        boxShadow: '0 4px 16px rgba(99,102,241,.28)',
                      }}
                    >
                      <CirclePlus className="w-4 h-4 text-white" />
                      <span>Create Shift</span>
                    </button>
                  }
                />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--tx3)] pl-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[4px]" style={{ background: 'var(--blue)' }} />
              Full day
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[4px]" style={{ background: 'var(--warn)' }} />
              Half day
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-[4px] border border-[var(--bd)]"
                style={{ background: 'var(--bg3)' }}
              />
              Week off
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Moon className="w-3 h-3 text-[var(--violet)]" /> Night shift
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sun className="w-3 h-3 text-[var(--ok)]" /> Default for new staff
            </span>
          </div>

          <div className="w-full overflow-x-auto pt-2">
            <PermissionTable data={shifts} columns={columns} loading={onLoading} />
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--bd)] mt-auto">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>

      <DeleteConfirmation
        open={showDeleteModal}
        icon={<Trash className="w-7 h-7 text-[var(--crit)]" />}
        message={
          deleteTarget ? (
            <>
              Are you sure you want to delete "{deleteTarget.name}"?
              {deleteTarget.assignedEmployees > 0 && (
                <>
                  {' '}
                  {deleteTarget.assignedEmployees} employee
                  {deleteTarget.assignedEmployees === 1 ? '' : 's'} will be left without a shift.
                </>
              )}
            </>
          ) : (
            'Are you sure you want to delete this shift?'
          )
        }
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    </div>
  );
};

export default memo(Shifts);
