import type { OrderSummary } from '../mockData';

interface OrderTableProps {
  orders: OrderSummary[];
  loading?: boolean;
  error?: string | null;
}

const statusColors: Record<string, string> = {
  ORDERED: 'bg-slate-100 text-slate-700',
  PRODUCING: 'bg-amber-100 text-amber-700',
  SHIPPED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
};

export default function OrderTable({ orders, loading, error }: OrderTableProps) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-slate-400">订单</p>
          <h3 className="text-2xl font-semibold text-slate-900">最近销售订单</h3>
        </div>
        <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          新建订单
        </button>
      </div>
      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-100">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-4 py-3">客户</th>
              <th className="px-4 py-3">订单号</th>
              <th className="px-4 py-3 text-right">金额</th>
              <th className="px-4 py-3 text-right">已收</th>
              <th className="px-4 py-3">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  正在加载订单…
                </td>
              </tr>
            )}
            {!loading && orders.map((order) => (
              <tr key={order.id}>
                <td className="px-4 py-3">{order.partner}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.orderNo}</td>
                <td className="px-4 py-3 text-right font-semibold">
                  ¥ {(order.totalAmount ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-slate-500">
                  ¥ {(order.paidAmount ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusColors[order.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {order.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
