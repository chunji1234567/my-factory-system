import type { ProductItem } from '../mockData';

interface ProductTableProps {
  products: ProductItem[];
  loading?: boolean;
  title?: string;
}

export default function ProductTable({ products, loading, title = '产品库存概览' }: ProductTableProps) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-slate-400">库存</p>
          <h3 className="text-2xl font-semibold text-slate-900">{title}</h3>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-100">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-4 py-3">内部编号</th>
              <th className="px-4 py-3">规格型号</th>
              <th className="px-4 py-3 text-right">库存</th>
              <th className="px-4 py-3 text-right">预警值</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  正在加载库存…
                </td>
              </tr>
            )}
            {!loading && products.map((product) => (
              <tr key={product.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{product.internalCode}</td>
                <td className="px-4 py-3">{product.modelName}</td>
                <td className="px-4 py-3 text-right font-semibold">
                  {product.stockQuantity.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-slate-500">
                  {product.minStock.toLocaleString()}
                </td>
              </tr>
            ))}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  当前分类暂无产品
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
