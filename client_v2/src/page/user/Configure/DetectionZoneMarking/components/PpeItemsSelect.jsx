import { useId } from 'react';
import MultiSelect from '@/components/MultiSelect';

const PPE_ITEMS = [
  { id: 'head_cap', label: 'Head cap' },
  { id: 'mask', label: 'Mask' },
  { id: 'dangri', label: 'Dangri' },
  { id: 'helmet', label: 'Helmet' },
  { id: 'vest', label: 'Vest' },
];

export default function PpeItemsSelect({ value, onChange, disabled }) {
  const id = useId();
  return (
    <fieldset disabled={disabled} aria-labelledby={id} style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
      <legend id={id} style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)', marginBottom: 5 }}>Required PPE items</legend>
      <MultiSelect
        options={PPE_ITEMS}
        value={value || []}
        onChange={onChange}
        placeholder="Select PPE items"
        searchable={false}
        inlinePanel
        wrapSelection
      />
    </fieldset>
  );
}
