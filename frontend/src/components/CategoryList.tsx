import type { CategoryResponse } from '../hooks/useCategories';

interface Props {
  categories: CategoryResponse[];
  loading?: boolean;
  error?: string | null;
}

const typeLabels: Record<string, string> = {
  RAW_MATERIAL: '原材料',
  SELF_MADE: '自产件',
  FINISHED: '成品',
};

export default function CategoryList({ categories, loading, error }: Props) {
  const list = Array.isArray(categories) ? categories : [];
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-slate-400">分类</p>
          <h3 className="text-2xl font-semibold text-slate-900">产品分类</h3>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <ul className="mt-4 space-y-3 text-sm text-slate-600">
        {loading && <li className="text-slate-500">正在加载分类…</li>}
        {!loading && list.map((cat) => (
          <li key={cat.id} className="rounded-xl border border-slate-200 px-3 py-2">
            <div className="flex items-center justify-between text-slate-800">
              <span>{cat.name}</span>
              <span className="text-xs font-semibold text-slate-500">{typeLabels[cat.category_type] ?? cat.category_type}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
