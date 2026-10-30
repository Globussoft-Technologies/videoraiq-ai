import { useRef, useState } from 'react';
import useMetadataEffect from '@/hooks/useMetadataEffect';
import SelectField from './SelectField';
import { fetchShifts } from '@/page/user/Shifts/Api';

const PAGE_SIZE = 5;

export default function ShiftSelect({ value, onChange, currentShift }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const page = useRef({ skip: 0, more: true, loading: false, generation: 0 });

  const loadMore = async () => {
    if (page.current.loading || !page.current.more) return;
    page.current.loading = true;
    const generation = page.current.generation;
    const offset = page.current.skip;
    setLoading(true);
    setError('');
    try {
      const response = await fetchShifts(offset, PAGE_SIZE, '', { dropdownCache: true });
      if (generation !== page.current.generation) return;
      if (response?.data?.body?.status !== 'success') throw new Error('Failed to load shifts');
      const data = response.data.body.data;
      const batch = data?.shifts || [];
      page.current.skip += batch.length;
      page.current.more = batch.length > 0 && page.current.skip < data.total;
      setShifts(previous => offset === 0 ? batch : [...new Map([...previous, ...batch].map(shift => [shift._id, shift])).values()]);
    } catch {
      if (generation !== page.current.generation) return;
      setError('Unable to load shifts.');
    } finally {
      if (generation === page.current.generation) {
        page.current.loading = false;
        setLoading(false);
      }
    }
  };

  // The API puts the organisation's default first, within the initial five.
  useMetadataEffect(() => {
    page.current = { skip: 0, more: true, loading: false, generation: page.current.generation + 1 };
    loadMore();
    return () => { page.current.generation++; };
  }, [], ['shifts']); // eslint-disable-line react-hooks/exhaustive-deps

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
