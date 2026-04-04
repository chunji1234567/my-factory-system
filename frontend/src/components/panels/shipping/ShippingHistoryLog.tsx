import Pagination from '../../common/Pagination';
import { usePaginatedFilter } from '../../../hooks/usePaginatedFilter';

interface ShippingHistoryLogProps {
  logs: any[];
  loading: boolean;
}

const PAGE_SIZE = 8;

export const ShippingHistoryLog = ({ logs = [], loading }: ShippingHistoryLogProps) => {
  const { page, setPage, pagedData: pagedLogs, total } = usePaginatedFilter<any>({
    data: logs,
    pageSize: PAGE_SIZE,
  });

  const hasLogs = total > 0;

  return (
    <section className="bg-white rounded-[2rem] md:rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in duration-700">
      {/* 头部区域 */}
      <div className="p-8 md:p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
        <div>
          <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">最新发货日志</h3>
          <p className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">
            Recent 30 Shipping Activities
          </p>
        </div>
        {loading && (
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-100">
            <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] font-black uppercase text-slate-500">同步中</span>
          </div>
        )}
      </div>

      {/* --- 1. 桌面端视图 (md 以上) --- */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/50 text-slate-500 uppercase text-[15px] font-bold tracking-widest">
            <tr>
              <th className="px-6 py-4 text-left">客户 / 订单编号</th>
              <th className="px-6 py-4 text-left">发货产品明细</th>
              <th className="px-6 py-4 text-center">发货数量</th>
              <th className="px-6 py-4 text-right">物流状态 / 时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {hasLogs ? pagedLogs.map((log: any) => (
              <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-6 py-4 align-top">
                  <p className="font-bold text-slate-800">{log.partner_name}</p>
                  <p className="text-[13px] font-mono text-slate-400 uppercase">{log.order_no}</p>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-semibold text-slate-800">{log.sales_item_detail?.custom_product_name}</span>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-block text-sm font-semibold text-slate-900 px-3 py-1 rounded-full bg-slate-50 min-w-[56px]">
                    {log.quantity_shipped}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${log.tracking_no ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-slate-100 text-slate-500'}`}>
                      {log.tracking_no || '直接交付 / 无单号'}
                    </span>
                    <span className="text-[12px] font-medium text-slate-400">
                      {new Date(log.shipped_at).toLocaleString('zh-CN', { hour12: false })}
                    </span>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-slate-400 font-semibold">
                  暂无发货流水
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- 2. 移动端视图 (md 以下) --- */}
      <div className="md:hidden divide-y divide-slate-50">
        {hasLogs ? pagedLogs.map((log: any) => (
          <div key={log.id} className="p-5 space-y-4 active:bg-slate-50 transition-colors">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{log.partner_name}</p>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5 uppercase">{log.order_no}</p>
              </div>
              <span className="bg-slate-900 text-white px-3 py-1 rounded-full text-xs font-semibold ml-4">
                +{log.quantity_shipped}
              </span>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="text-sm font-semibold text-slate-800 leading-snug">
                {log.sales_item_detail?.custom_product_name}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 justify-between items-end">
                <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-100 max-w-[180px] truncate">
                  单号: {log.tracking_no || '无'}
                </span>
                <span className="text-[10px] font-medium text-slate-400 uppercase">
                  {new Date(log.shipped_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        )) : (
          <div className="py-20 text-center text-slate-300 font-bold italic">暂无发货流水</div>
        )}
      </div>

      <div className="border-t border-slate-50 bg-slate-50/30">
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </section>
  );
};
