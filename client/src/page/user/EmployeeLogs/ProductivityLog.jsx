import React, { useMemo, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import ReusableTablePage from './ReusableTablePage';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'; // Import Select components

const sampleLogs = [
  { id: 'a1', image: 'https://picsum.photos/seed/a1/200/300', name: 'Eleanor Pena', department: 'Digital Marketing', date: '12/09/2025', productiveHours: '6h 30m', nonProductiveHours: '1h 30m', totalHours: '8h 00m' },
  { id: 'a2', image: 'https://picsum.photos/seed/a2/200/300', name: 'Guy Hawkins', department: 'Digital Marketing', date: '12/09/2025', productiveHours: '7h 15m', nonProductiveHours: '0h 45m', totalHours: '8h 00m' },
  { id: 'a3', image: 'https://picsum.photos/seed/a3/200/300', name: 'Kristin Watson', department: 'Digital Marketing', date: '12/09/2025', productiveHours: '5h 45m', nonProductiveHours: '2h 15m', totalHours: '8h 00m' },
  { id: 'a4', image: 'https://picsum.photos/seed/a4/200/300', name: 'Ralph Edwards', department: 'Digital Marketing', date: '12/09/2025', productiveHours: '8h 00m', nonProductiveHours: '0h 00m', totalHours: '8h 00m' },
  { id: 'a5', image: 'https://picsum.photos/seed/a5/200/300', name: 'Savannah Nguyen', department: 'Digital Marketing', date: '12/09/2025', productiveHours: '7h 30m', nonProductiveHours: '0h 30m', totalHours: '8h 00m' },
];

const styles = {
  text: 'text-[#333333] text-xs font-normal',
};

const ProductivityLog = () => {
  const columns = useMemo(() => [
    {
      accessorKey: 'image',
      header: 'Image',
      cell: ({ row }) => (
        <div className="w-8 h-8 rounded-full overflow-hidden bg-white border border-[#E6E6E6]">
          <img src={row.original.image} alt={row.original.name} className="w-8 h-8 object-cover" />
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: () => <span className="flex items-center gap-1">Name <ArrowDownUp className="w-4 h-4" /></span>,
      cell: ({ row }) => <span className={styles.text}>{row.original.name}</span>,
    },
    {
      accessorKey: 'department',
      header: 'Department',
      cell: ({ row }) => <span className={styles.text}>{row.original.department}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => <span className={styles.text}>{row.original.date}</span>,
    },
    {
      accessorKey: 'productiveHours',
      header: 'Productive Hours',
      cell: ({ row }) => <span className={styles.text}>{row.original.productiveHours}</span>,
    },
    {
      accessorKey: 'nonProductiveHours',
      header: 'Non-Productive Hours',
      cell: ({ row }) => <span className={styles.text}>{row.original.nonProductiveHours}</span>,
    },
    {
      accessorKey: 'totalHours',
      header: 'Total Hours',
      cell: ({ row }) => <span className={styles.text}>{row.original.totalHours}</span>,
    },
  ], []);

  const [nvrValue, setNvrValue] = useState(''); // State for NVR select
  const [cameraValue, setCameraValue] = useState(''); // State for Camera select

  return (
    <ReusableTablePage
      title="Productivity Logs"
      data={sampleLogs}
      columns={columns}
      searchKeys={['name', 'department']}
    >
      <div className="w-full md:w-[25%] xl:w-[15%]">
        <Select value={nvrValue} onValueChange={setNvrValue}> {/* Add value and onValueChange */}
          <SelectTrigger className="w-full h-10 border border-[#C7C7C7] rounded-lg text-sm px-3 bg-white font-500 text-[#595959]">
            <SelectValue placeholder="Select NVR" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nvr1" className="font-500 text-[#595959]">NVR 1</SelectItem>
            <SelectItem value="nvr2" className="font-500 text-[#595959]">NVR 2</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="w-full md:w-[30%] xl:w-[15%]">
        <Select value={cameraValue} onValueChange={setCameraValue}> {/* Add value and onValueChange */}
          <SelectTrigger className="w-full h-10 border border-[#C7C7C7] rounded-lg text-sm px-3 bg-white font-500 text-[#595959]">
            <SelectValue placeholder="Select Camera" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cam1" className="font-500 text-[#595959]">Camera 1</SelectItem>
            <SelectItem value="cam2" className="font-500 text-[#595959]">Camera 2</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </ReusableTablePage>
  );
};

export default ProductivityLog;