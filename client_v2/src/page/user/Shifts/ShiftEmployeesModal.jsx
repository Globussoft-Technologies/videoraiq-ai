import React, { useCallback, useEffect, useState } from 'react';
import { Search, Users, UserMinus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import Pagination from '@/components/Pagination';
import { fetchShiftEmployees, unassignShift } from './Api';

const PAGE_SIZE = 8;

const employeeName = (employee) =>
  `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() ||
  employee?.email ||
  'Unnamed employee';

const AVATAR_PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
const avatarColor = (key) => {
  const str = String(key || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

/**
 * Who is on this shift.
 *
 * Opened from the Assigned count in the shift table — that number was the only
 * place the roster was visible, with no way to see the names behind it.
 */
const ShiftEmployeesModal = ({ trigger, shift, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const load = useCallback(async () => {
    if (!open || !shift?._id) return;
    setLoading(true);
    try {
      const res = await fetchShiftEmployees(shift._id, {
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search,
      });
      const data = res?.data?.body?.data;
      setEmployees(data?.employees || []);
      setTotal(data?.total || 0);
    } catch {
      toast.error('Failed to load the shift roster');
    } finally {
      setLoading(false);
    }
  }, [open, shift?._id, page, search]);

  useEffect(() => {
    // Debounced so typing in the search box doesn't fire a request per key.
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleRemove = async (employee) => {
    setRemovingId(employee._id);
    try {
      await unassignShift([employee._id]);
      toast.success(`${employeeName(employee)} removed from ${shift.name}`);
      // Step back a page when the last row on it just went away.
      if (employees.length === 1 && page > 1) setPage((p) => p - 1);
      else load();
      onChanged?.();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to remove employee');
    } finally {
      setRemovingId(null);
    }
  };

  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next) {
      setSearch('');
      setPage(1);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[18px] p-4 sm:p-5 shadow-xl w-[94vw] max-w-[620px] max-h-[92vh] overflow-y-auto overflow-x-hidden top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] hide-scrollbar scrollbar-hide"
        closeBtn="text-[var(--tx2)] hover:text-[var(--tx)] transition-colors top-5 right-5"
      >
        <DialogHeader className="flex-row items-center gap-3 text-left space-y-0">
          <span
            className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
            style={{ background: `color-mix(in srgb, ${shift?.color || 'var(--blue)'} 18%, transparent)` }}
          >
            <Users className="w-5 h-5" style={{ color: shift?.color || 'var(--blue)' }} />
          </span>
          <div>
            <DialogTitle className="text-base sm:text-lg font-semibold text-[var(--tx)]">
              {shift?.name} · Assigned Staff
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--tx3)]">
              {shift?.startTime} – {shift?.endTime} · {total} employee{total === 1 ? '' : 's'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="relative mt-4">
          <Input
            type="text"
            placeholder="Search by name or email..."
            className="pl-4 pr-10 shadow-none border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] h-10 text-sm focus:border-[var(--blue)]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)]" />
        </div>

        <div className="mt-3 rounded-[12px] border border-[var(--bd)] bg-[var(--bg2)] divide-y divide-[var(--bd)] min-h-[220px]">
          {loading && (
            <div className="flex items-center justify-center py-16 text-[var(--tx3)]">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!loading && employees.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
              <Users className="w-7 h-7 text-[var(--tx3)]" />
              <p className="text-sm text-[var(--tx2)]">
                {search ? 'No one matches that search.' : 'No staff assigned to this shift yet.'}
              </p>
              {!search && (
                <p className="text-[11px] text-[var(--tx3)]">
                  Use Assign or Bulk Assign to add people.
                </p>
              )}
            </div>
          )}

          {!loading &&
            employees.map((employee) => (
              <div key={employee._id} className="flex items-center gap-3 px-3 py-2.5">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                  style={{ background: avatarColor(employee._id) }}
                >
                  {employeeName(employee).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[var(--tx)] truncate">
                    {employeeName(employee)}
                    {employee.status === 'suspended' && (
                      <span className="ml-2 text-[10px] text-[var(--warn)]">Suspended</span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--tx3)] truncate">
                    {[
                      employee.departmentId?.departmentName,
                      employee.location,
                      employee.designation,
                    ]
                      .filter(Boolean)
                      .join(' · ') || employee.email}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(employee)}
                  disabled={removingId === employee._id}
                  title="Remove from this shift"
                  className="text-[var(--crit)] hover:opacity-80 cursor-pointer p-1.5 rounded hover:bg-[var(--bg3)] transition-colors disabled:opacity-40"
                >
                  {removingId === employee._id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserMinus strokeWidth={1.5} className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
        </div>

        {totalPages > 1 && (
          <div className="pt-3">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              showGoTo={false}
              className="flex justify-center"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ShiftEmployeesModal;
