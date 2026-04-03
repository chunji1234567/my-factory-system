import type { ReactNode } from 'react';

interface FilterBarProps {
  children: ReactNode;
  actions?: ReactNode;
}

function FilterBarRoot({ children, actions }: FilterBarProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-wrap gap-3">{children}</div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}

interface FilterBarFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

function FilterBarField({ label, children, className = '' }: FilterBarFieldProps) {
  return (
    <label className={`flex min-w-[160px] flex-1 flex-col text-sm text-slate-600 ${className}`}>
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const FilterBar = Object.assign(FilterBarRoot, { Field: FilterBarField });

export default FilterBar;
