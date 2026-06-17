// src/components/common/PriceTag.tsx
//
// 金额展示组件。**必须正确处理 null** —— 后端 MonetaryMaskMixin 对非
// manager 用户会把金额字段置为 null（不是 0）。原实现 Number(null) 会
// 静默变成 0，把"未授权查看"展示成"¥0.00"，是 §9.2 #16 登记的金额脱敏
// 地雷（2026-05-21 修复）。前端硬约束见 rules/frontend-rules.md §2.1。
export const PriceTag = ({
  value,
  fallback = '-',
}: {
  value: number | string | null | undefined;
  fallback?: string;
}) => {
  if (value === null || value === undefined || value === '') {
    return <span className="font-semibold text-slate-400">{fallback}</span>;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) {
    return <span className="font-semibold text-slate-400">{fallback}</span>;
  }
  return (
    <span className="font-semibold text-slate-900">
      ¥ {numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
};