import { useState } from 'react';
import StatusBadge from '../../common/StatusBadge';
import NavbarButton from '../../common/NavbarButton';

interface ShippingStatusTableProps {
  orders: any[];
  onUpdateStatus: (id: number, status: string) => Promise<void>;
  onRowClick: (id: number) => void;
  isSaving: number | null;
  activeFilter: string;
  onFilterChange: (val: string) => void;
}

const StatusTabs = ({ activeValue, onChange }: { activeValue: string, onChange: (val: string) => void }) => {
  const tabs = [
    { value: '', label: '全部' },
    { value: 'ORDERED', label: '已下单' },
    { value: 'PRODUCING', label: '生产中' },
    { value: 'SHIPPED', label: '发货中' },
    { value: 'COMPLETED', label: '已完成' },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-6 px-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`px-4 py-2 rounded-full text-xs md:text-sm font-semibold transition-all border ${
            activeValue === tab.value 
              ? 'bg-slate-900 text-white border-slate-900 shadow-lg' 
              : 'bg-white text-slate-500 border-slate-100'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default function ShippingStatusTable({ 
  orders, onUpdateStatus, onRowClick, isSaving, activeFilter, onFilterChange
}: ShippingStatusTableProps) {
  
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const STATUS_OPTIONS = [
    { value: 'ORDERED', label: '已下单' },
    { value: 'PRODUCING', label: '生产中' },
    { value: 'SHIPPED', label: '发货中' },
    { value: 'COMPLETED', label: '已完成' },
  ];

  return (
    <div className="space-y-4">
      <StatusTabs activeValue={activeFilter} onChange={onFilterChange} />

      {/* --- 桌面端视图 --- */}
      <div className="hidden md:block bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/50 text-slate-500 uppercase text-[15px] font-bold tracking-widest">
            <tr>
              <th className="px-6 py-4 text-left">客户 / 订单号</th>
              <th className="px-6 py-4 text-left">销售明细</th>
              <th className="px-6 py-4 text-center">发货进度</th>
              <th className="px-6 py-4 text-center">状态</th>
              <th className="px-6 py-4 text-right">管理操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {orders.map((order) => {
              const currentDraft = drafts[order.id] || order.status;
              return (
                <tr key={order.id} className="hover:bg-slate-50/50 cursor-pointer transition-colors" onClick={() => onRowClick(order.id)}>
                  <td className="px-6 py-4 align-top">
                    <p className="font-bold text-slate-800">{order.partner_name}</p>
                    <p className="text-[13px] font-mono text-slate-400 uppercase">{order.order_no}</p>
                  </td>
                  
                  {/* 销售明细：增大描述字号 */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-3">
                      {order.items?.map((item: any) => (
                        <div key={item.id} className="bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100 flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">{item.custom_product_name}</span>
                            <span className="text-xs font-medium text-slate-500">× {item.quantity}</span>
                          </div>
                          {item.detail_description && (
                            <p className="text-xs text-slate-500 leading-relaxed">
                              {item.detail_description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>

                  {/* 进度列高度同步 */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-3">
                      {order.items?.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-center min-h-[48px]">
                          <span className={`text-sm font-semibold ${Number(item.shipped_quantity) >= Number(item.quantity) ? 'text-emerald-500' : 'text-slate-900'}`}>
                            {item.shipped_quantity} <span className="text-slate-300 font-medium mx-0.5">/</span> {item.quantity}
                          </span>
                        </div>
                      ))}
                  </div>
                </td>

                  <td className="px-6 py-4 text-center align-middle"><StatusBadge kind="shipping" status={order.status} /></td>
                  
                  <td className="px-6 py-4 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-3">
                      <select value={currentDraft} onChange={(e) => setDrafts({...drafts, [order.id]: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2 text-sm font-medium text-slate-700">
                        {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                      <NavbarButton onClick={() => onUpdateStatus(order.id, currentDraft)} disabled={isSaving === order.id || currentDraft === order.status} className="px-5 py-2 text-sm font-semibold">
                        {isSaving === order.id ? '...' : '更新状态'}
                      </NavbarButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* --- 移动端视图：彻底修复描述消失问题 --- */}
      <div className="md:hidden space-y-4 px-2">
        {orders.map((order) => {
          const currentDraft = drafts[order.id] || order.status;
          return (
            <div key={order.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 space-y-5" onClick={() => onRowClick(order.id)}>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{order.partner_name}</h4>
                  <p className="text-[11px] font-mono text-slate-400 mt-1 uppercase">{order.order_no}</p>
                </div>
                <StatusBadge kind="shipping" status={order.status} />
              </div>

              <div className="space-y-3">
                {order.items?.map((item: any) => (
                  <div key={item.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800">{item.custom_product_name}</p>
                        {item.detail_description && (
                          <p className="text-xs text-slate-500 mt-1 pr-2">
                            {item.detail_description}
                          </p>
                        )}
                        <p className="text-xs text-slate-400 font-bold mt-2 uppercase tracking-widest">
                          应发总量: {item.quantity}
                        </p>
                      </div>
                      <div className="text-right ml-4">
                        <p className={`text-sm font-semibold ${Number(item.shipped_quantity) >= Number(item.quantity) ? 'text-emerald-500' : 'text-slate-900'}`}>
                          {item.shipped_quantity} / {item.quantity}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2" onClick={(e) => e.stopPropagation()}>
                <select value={currentDraft} onChange={(e) => setDrafts({...drafts, [order.id]: e.target.value})} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium">
                  {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <NavbarButton onClick={() => onUpdateStatus(order.id, currentDraft)} disabled={isSaving === order.id || currentDraft === order.status} className="px-5 py-2 text-sm">
                  {isSaving === order.id ? '...' : '更新状态'}
                </NavbarButton>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
