import type { ProductItem } from '../mockData';

interface ProductTableProps {
  products: ProductItem[];
  loading?: boolean;
  title?: string;
  selectedIds?: Set<number>;
  onToggleSelect?: (product: ProductItem) => void;
  quantities?: Record<number, string>;
  onQuantityChange?: (productId: number, value: string) => void;
}

export default function ProductTable({
  products,
  loading,
  title = '产品库存概览',
  selectedIds,
  onToggleSelect,
  quantities,
  onQuantityChange,
}: ProductTableProps) {
  const selectionEnabled = Boolean(selectedIds && onToggleSelect);

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-slate-400">库存</p>
          <h3 className="text-2xl font-semibold text-slate-900">{title}</h3>
        </div>
      </div>

      <div className="mt-6 hidden overflow-hidden rounded-xl border border-slate-100 lg:block">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
            <tr>
              {selectionEnabled && <th className="px-4 py-3">选择</th>}
              <th className="px-4 py-3">内部编号</th>
              <th className="px-4 py-3">规格型号</th>
              <th className="px-4 py-3 text-right">库存</th>
              {selectionEnabled && <th className="px-4 py-3 text-right">数量</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {loading && (
              <tr>
                <td colSpan={selectionEnabled ? 5 : 3} className="px-4 py-6 text-center text-sm text-slate-500">
                  正在加载库存…
                </td>
              </tr>
            )}
            {!loading && products.map((product) => {
              const isLowStock = product.stockQuantity < product.minStock;
              const isSelected = selectionEnabled ? selectedIds?.has(product.id) : false;
              return (
                <tr key={product.id}>
                  {selectionEnabled && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                        checked={Boolean(isSelected)}
                        onChange={() => onToggleSelect?.(product)}
                      />
                    </td>
                  )}
                  <td
                    className={`px-4 py-3 font-mono text-xs ${
                      isLowStock ? 'text-rose-600 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {product.internalCode}
                  </td>
                  <td className="px-4 py-3">{product.modelName}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {product.stockQuantity.toLocaleString()}
                  </td>
                  {selectionEnabled && (
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0"
                        disabled={!isSelected}
                        value={(quantities && quantities[product.id]) ?? ''}
                        onChange={(evt) => onQuantityChange?.(product.id, evt.target.value)}
                        className="w-28 rounded-full border border-slate-200 px-3 py-1 text-right disabled:bg-slate-50"
                        placeholder="数量"
                      />
                    </td>
                  )}
                </tr>
              );
            })}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={selectionEnabled ? 5 : 3} className="px-4 py-6 text-center text-sm text-slate-500">
                  当前分类暂无产品
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-3 lg:hidden">
        {loading && (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            正在加载库存…
          </p>
        )}
        {!loading &&
          products.map((product) => {
            const isLowStock = product.stockQuantity < product.minStock;
            const isSelected = selectionEnabled ? selectedIds?.has(product.id) : false;
            return (
              <div key={product.id} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">内部编号</p>
                    <p className={`font-mono text-sm ${isLowStock ? 'text-rose-600 font-semibold' : 'text-slate-800'}`}>
                      {product.internalCode}
                    </p>
                  </div>
                  {selectionEnabled && (
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                        checked={Boolean(isSelected)}
                        onChange={() => onToggleSelect?.(product)}
                      />
                      选择
                    </label>
                  )}
                </div>
                <p className="mt-2 text-base font-semibold text-slate-900">{product.modelName}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600">
                  <div>
                    <p className="text-xs text-slate-400">当前库存</p>
                    <p className={`text-lg font-semibold ${isLowStock ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {product.stockQuantity.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">安全库存</p>
                    <p>{product.minStock.toLocaleString()}</p>
                  </div>
                </div>
                {selectionEnabled && (
                  <div className="mt-4">
                    <label className="text-xs text-slate-500">调整数量</label>
                    <input
                      type="number"
                      min="0"
                      disabled={!isSelected}
                      value={(quantities && quantities[product.id]) ?? ''}
                      onChange={(evt) => onQuantityChange?.(product.id, evt.target.value)}
                      className="mt-1 w-full rounded-full border border-slate-200 px-3 py-2 text-right text-sm disabled:bg-slate-50"
                      placeholder="输入数量"
                    />
                  </div>
                )}
              </div>
            );
          })}
        {!loading && products.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            当前分类暂无产品
          </p>
        )}
      </div>
    </section>
  );
}
