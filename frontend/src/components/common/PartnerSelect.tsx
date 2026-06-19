import { useMemo } from 'react';
import { buildPartnerSuggestions, resolvePartnerId } from '../../utils/orderUtils';
import type { PartnerResponse } from '../../hooks/usePartners';

/**
 * 合作方搜索输入框（Stage C-12 redesign，2026-06-18）。
 *
 * design tokens：
 *   - label 用 micro 字号 + ink-faint 灰
 *   - 输入框 rounded-input border-line + focus:border-line-focus
 *     （替代 rounded-full + slate-200 + focus:border-slate-900）
 *
 * label 可选——FilterBar.Field 等容器会在外层渲染 label，此时 PartnerSelect
 * 内部不再重复。Modal/Form 等无外层容器的场景再传 label。
 */

interface Props {
  label?: string;
  value: string;
  onChange: (value: string, id: number | null) => void;
  partners: PartnerResponse[];
  id: string; // datalist ID 去重用
  placeholder?: string;
}

export const PartnerSelect = ({
  label,
  value,
  onChange,
  partners,
  id,
  placeholder,
}: Props) => {
  const suggestions = useMemo(
    () => buildPartnerSuggestions(partners, value),
    [partners, value],
  );

  return (
    <div className="flex-1 min-w-[200px] space-y-1">
      {label && (
        <label className="block text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5">
          {label}
        </label>
      )}
      <input
        list={`list-${id}`}
        className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body text-ink outline-none
                   focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          const resolvedId = resolvePartnerId(val, partners);
          onChange(val, resolvedId);
        }}
        placeholder={placeholder || '输入名称或 #ID'}
      />
      <datalist id={`list-${id}`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
};
