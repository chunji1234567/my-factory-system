// src/components/panels/warehouse/ReceivingOrderTable.tsx
import React from 'react';
import StatusBadge from '../../common/StatusBadge';
import NavbarButton from '../../common/NavbarButton';

interface ReceivingOrderTableProps {
  orders: any[];
  onOpenModal: (orderId: number, itemId: number) => void;
}

export const ReceivingOrderTable = ({ orders, onOpenModal }: ReceivingOrderTableProps) => {
  return (
    <div className="space-y-6">
      {orders.map((order) => (
        <div key={order.id} className="bg-white rounded-[2rem] md:rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in duration-500">
          
          {/* 1. 头部：供应商信息 */}
          <div className="px-6 py-5 md:px-8 md:py-6 flex justify-between items-start border-b border-slate-50 bg-slate-50/30">
            <div className="min-w-0">
              <p className="text-lg md:text-xl font-bold text-slate-900 truncate leading-snug">
                {order.partner_name || `供应商 #${order.partner}`}
              </p>
              <p className="text-[12px] md:text-[13px] font-mono text-slate-400 uppercase tracking-[0.3em]">
                {order.order_no}
              </p>
            </div>
            <StatusBadge kind="purchase" status={order.status} />
          </div>

          {/* 2. 桌面端视图 (md 以上显示) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/50 text-slate-500 uppercase text-[15px] font-bold tracking-widest">
                <tr>
                  <th className="px-6 py-4 text-left">采购物料明细</th>
                  <th className="px-6 py-4 text-center">收货进度 (实收/应收)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {order.items.map((item: any) => {
                  const received = Number(item.received_quantity ?? 0);
                  const total = Number(item.quantity);
                  const isDone = received >= total;
                  return (
                    <tr key={item.id} className="group hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="bg-white rounded-2xl px-6 py-4 border border-slate-100 shadow-sm group-hover:border-slate-300 transition-all">
                          <p className="text-base font-semibold text-slate-800">
                            {item.product_detail?.model_name || `物料#${item.product}`}
                          </p>
                          {item.product_detail?.description && (
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {item.product_detail.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <p className={`text-sm font-semibold ${isDone ? 'text-emerald-500' : 'text-slate-900'}`}>
                            {received} <span className="text-slate-300 mx-1">/</span> {total}
                          </p>
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-slate-900'}`} 
                              style={{ width: `${Math.min((received/total)*100, 100)}%` }} 
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <NavbarButton 
                          disabled={isDone} 
                          onClick={() => onOpenModal(order.id, item.id)}
                          className="px-6 py-2 text-xs font-semibold shadow-sm shadow-slate-100 active:scale-95"
                        >
                          {isDone ? '已入库' : '确认收货'}
                        </NavbarButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 3. 移动端视图 (md 以下显示) */}
          <div className="md:hidden p-5 space-y-4">
            {order.items.map((item: any) => {
              const received = Number(item.received_quantity ?? 0);
              const total = Number(item.quantity);
              const isDone = received >= total;
              const progress = Math.min((received / total) * 100, 100);

              return (
                <div key={item.id} className="bg-slate-50 rounded-[2rem] p-4 border border-slate-100 space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 leading-tight">
                        {item.product_detail?.model_name || `物料#${item.product}`}
                      </p>
                      {item.product_detail?.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {item.product_detail.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${isDone ? 'text-emerald-500' : 'text-slate-900'}`}>
                        {received}/{total}
                      </p>
                    </div>
                  </div>

                  {/* 移动端进度条 */}
                  <div className="h-2.5 bg-white border border-slate-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-700 ${isDone ? 'bg-emerald-500' : 'bg-slate-900'}`} 
                      style={{ width: `${progress}%` }} 
                    />
                  </div>

                  <NavbarButton 
                    disabled={isDone} 
                    onClick={() => onOpenModal(order.id, item.id)}
                    className="w-full py-3 text-xs font-semibold active:scale-95 shadow-sm shadow-slate-200"
                  >
                    {isDone ? '✅ 该项物料已全部入库' : '录入到货数量'}
                  </NavbarButton>
                </div>
              ); // <-- 确保这里闭合了 map 的箭头函数体
            })}  {/* <-- 这一行就是报错的地方，原来的代码可能漏掉了上面的右括号 */}
          </div>
        </div>
      ))}
    </div>
  );
};
