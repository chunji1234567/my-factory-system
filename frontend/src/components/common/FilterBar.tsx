import { ReactNode } from 'react';

interface FilterBarProps {
  children: ReactNode;
  actions?: ReactNode;
}

function FilterBarRoot({ children, actions }: FilterBarProps) {
  return (
    // 升级为 3xl 圆角，并使用更细腻的 slate-100 边框
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        {/* 筛选输入区：优化包裹逻辑，确保在平板上也能对齐 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-1 lg:flex-wrap lg:items-end">
          {children}
        </div>

        {/* 操作区：移动端增加顶边框隔离，PC 端对齐底部 */}
        {actions && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-50 pt-4 lg:border-t-0 lg:pt-0">
            {actions}
          </div>
        )}
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
    <div className={`flex min-w-[200px] flex-1 flex-col space-y-1.5 ${className}`}>
      <span className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <div className="relative">
        {children}
      </div>
    </div>
  );
}

const FilterBar = Object.assign(FilterBarRoot, { Field: FilterBarField });

export default FilterBar;