// src/components/common/PriceTag.tsx
export const PriceTag = ({ value }: { value: number | string }) => (
    <span className="font-semibold text-slate-900">
      ¥ {Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );