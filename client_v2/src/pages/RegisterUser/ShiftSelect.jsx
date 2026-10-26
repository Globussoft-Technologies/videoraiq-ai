import { useEffect, useRef, useState } from 'react';
import SelectField from './SelectField';
import { fetchShifts } from '@/page/user/Shifts/Api';

const PAGE_SIZE = 5;

export default function ShiftSelect({ value, onChange, currentShift }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const page = useRef({ skip: 0, more: true, loading: false });

  const loadMore = async () => {
    if (page.current.loading || !page.current.more) return;
    page.current.loading = true;
    setLoading(true);
    setError('');
    try {
      const response = await fetchShifts(page.current.skip, PAGE_SIZE);
      if (response?.data?.body?.status !== 'success') throw new Error('Failed to load shifts');
      const data = response.data.body.data;
      const batch = data?.shifts || [];
      page.current.skip += batch.length;
      page.current.more = batch.length > 0 && page.current.skip < data.total;
      setShifts(previous => [...new Map([...previous, ...batch].map(shift => [shift._id, shift])).values()]);
    } catch {
      setError('Unable to load shifts.');
    } finally {
      page.current.loading = false;
      setLoading(false);
    }
  };

  // The API puts the organisation's default first, within the initial five.
  useEffect(() => { loadMore(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultShift = shifts.find(shift => shift.isDefault && shift.isActive !== false);
  const selectedValue = value || (!currentShift ? defaultShift?._id : '') || '';

  const options = shifts.map(shift => ({
    value: shift._id,
    label: `${shift.name} (${shift.startTime} – ${shift.endTime})${shift.isDefault ? ' · Default' : ''}`,
  }));
  if (value && !options.some(option => option.value === value)) {
    options.unshift({ value, label: currentShift?.name || 'Current assigned shift' });
  }

  return <SelectField value={selectedValue} onChange={onChange} options={options}
    placeholder={currentShift ? 'Keep current shift' : 'Use default shift (if configured)'} loading={loading} error={error}
    onOpen={() => { if (!shifts.length) loadMore(); }}
    onLoadMore={() => { if (!error) loadMore(); }} onRetry={loadMore} />;
}
