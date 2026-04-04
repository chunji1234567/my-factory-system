import React, { useMemo } from 'react';
import { buildPartnerSuggestions, resolvePartnerId } from '../../utils/orderUtils';
import type { PartnerResponse } from '../../hooks/usePartners';

interface Props {
  label: string;
  value: string;
  onChange: (value: string, id: number | null) => void;
  partners: PartnerResponse[];
  id: string; // 确保 datalist ID 唯一
  placeholder?: string;
}

export const PartnerSelect = ({ label, value, onChange, partners, id, placeholder }: Props) => {
  const suggestions = useMemo(() => buildPartnerSuggestions(partners, value), [partners, value]);

  return (
    <div className="flex-1 min-w-[200px] space-y-1.5">
      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
        {label}
      </label>
      <input
        list={`list-${id}`}
        className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          const resolvedId = resolvePartnerId(val, partners);
          onChange(val, resolvedId);
        }}
        placeholder={placeholder || "输入名称或 #ID"}
      />
      <datalist id={`list-${id}`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
};