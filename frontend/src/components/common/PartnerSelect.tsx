// src/components/common/PartnerSelect.tsx
import { usePartnerSearch } from '../../hooks/usePartnerSearch';
import type { PartnerResponse } from '../../hooks/usePartners';

interface PartnerSelectProps {
  label?: string;
  value: string;
  onChange: (value: string, id: number | null) => void;
  partners: PartnerResponse[];
  placeholder?: string;
  id: string; // 用于关联 datalist
  required?: boolean;
  className?: string;
}

export default function PartnerSelect({
  label,
  value,
  onChange,
  partners,
  placeholder = "输入名称或 #ID",
  id,
  required,
  className = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
}) {
  const { suggestions, resolvedId } = usePartnerSearch(partners, value);

  return (
    <label className="block text-sm text-slate-600">
      {label && <span className="mb-1 block font-medium">{label}</span>}
      <input
        list={`dl-${id}`}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value, resolvedId)}
        placeholder={placeholder}
        required={required}
      />
      <datalist id={`dl-${id}`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </label>
  );
}