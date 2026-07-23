import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownUp } from 'lucide-react';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import ReusableTablePage from '@/pages/AttendanceLogs/components/ReusableTablePage';
import MultiSelect from '@/pages/AttendanceLogs/components/MultiSelect';

// Mock rows — Productivity Logs has no backend endpoint yet (ported as-is
// from the v1 stub); swap for a real fetch once the API exists.
const sampleLogs = [
  { id: 'a1', image: 'https://picsum.photos/seed/a1/200/300', name: 'Eleanor Pena', department: 'Digital Marketing', date: '12/09/2025', productiveHours: '6h 30m', nonProductiveHours: '1h 30m', totalHours: '8h 00m' },
  { id: 'a2', image: 'https://picsum.photos/seed/a2/200/300', name: 'Guy Hawkins', department: 'Digital Marketing', date: '12/09/2025', productiveHours: '7h 15m', nonProductiveHours: '0h 45m', totalHours: '8h 00m' },
  { id: 'a3', image: 'https://picsum.photos/seed/a3/200/300', name: 'Kristin Watson', department: 'Digital Marketing', date: '12/09/2025', productiveHours: '5h 45m', nonProductiveHours: '2h 15m', totalHours: '8h 00m' },
  { id: 'a4', image: 'https://picsum.photos/seed/a4/200/300', name: 'Ralph Edwards', department: 'Digital Marketing', date: '12/09/2025', productiveHours: '8h 00m', nonProductiveHours: '0h 00m', totalHours: '8h 00m' },
  { id: 'a5', image: 'https://picsum.photos/seed/a5/200/300', name: 'Savannah Nguyen', department: 'Digital Marketing', date: '12/09/2025', productiveHours: '7h 30m', nonProductiveHours: '0h 30m', totalHours: '8h 00m' },
];

const NVR_OPTIONS = [
  { id: 'nvr1', label: 'NVR 1' },
  { id: 'nvr2', label: 'NVR 2' },
];
const CAMERA_OPTIONS = [
  { id: 'cam1', label: 'Camera 1' },
  { id: 'cam2', label: 'Camera 2' },
];

const ProductivityLog = () => {
  const navigate = useNavigate();
  const { permissions, loading: permissionsLoading } = usePermissions();

  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.productivityLogs?.[action] === 'boolean') return logs.productivityLogs[action];
    if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
    if (typeof logs[action] === 'boolean') return logs[action];
    return false;
  };
  const canView = resolveLogPerm('view');

  const [nvrIds, setNvrIds] = useState([]);
  const [cameraIds, setCameraIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'image',
        header: 'Image',
        cell: ({ row }) => (
          <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--bg2)] border border-[var(--bd)]">
            <img src={row.original.image} alt={row.original.name} className="w-8 h-8 object-cover" />
          </div>
        ),
      },
      {
        accessorKey: 'name',
        header: () => (
          <span className="flex items-center gap-1">
            Name <ArrowDownUp className="w-4 h-4" />
          </span>
        ),
        cell: ({ row }) => <span className="text-[var(--tx2)] text-xs font-normal">{row.original.name}</span>,
      },
      {
        accessorKey: 'department',
        header: 'Department',
        cell: ({ row }) => <span className="text-[var(--tx2)] text-xs font-normal">{row.original.department}</span>,
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => <span className="text-[var(--tx2)] text-xs font-normal">{row.original.date}</span>,
      },
      {
        accessorKey: 'productiveHours',
        header: 'Productive Hours',
        cell: ({ row }) => <span className="text-[var(--tx2)] text-xs font-normal">{row.original.productiveHours}</span>,
      },
      {
        accessorKey: 'nonProductiveHours',
        header: 'Non-Productive Hours',
        cell: ({ row }) => <span className="text-[var(--tx2)] text-xs font-normal">{row.original.nonProductiveHours}</span>,
      },
      {
        accessorKey: 'totalHours',
        header: 'Total Hours',
        cell: ({ row }) => <span className="text-[var(--tx2)] text-xs font-normal">{row.original.totalHours}</span>,
      },
    ],
    []
  );

  if (permissionsLoading) return null;
  if (!canView) {
    return (
      <AccessDenied
        message="You don't have permission to view Productivity Logs."
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      <ReusableTablePage
        title="Productivity Logs"
        data={sampleLogs}
        columns={columns}
        searchKeys={['name', 'department']}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
      >
        <div className="w-full md:w-[200px]">
          <MultiSelect
            options={NVR_OPTIONS}
            value={nvrIds}
            onChange={setNvrIds}
            placeholder="Select NVR"
            searchable
            maxHeight="max-h-40"
            msg="No NVR Found"
          />
        </div>
        <div className="w-full md:w-[200px]">
          <MultiSelect
            options={CAMERA_OPTIONS}
            value={cameraIds}
            onChange={setCameraIds}
            placeholder="Select Camera"
            searchable
            maxHeight="max-h-40"
            msg="No Camera Found"
          />
        </div>
      </ReusableTablePage>
    </div>
  );
};

export default ProductivityLog;
