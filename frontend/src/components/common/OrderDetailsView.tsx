import React from 'react';
import NavbarButton from './NavbarButton';

interface Props {
  items: any[];
  events: any[];
  mode: 'purchase' | 'sales';
  orderId?: number;
}

export default function OrderDetailsView({ items, events, mode }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 p-6 bg-slate-50/50 rounded-b-3xl border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
      
      {/* 1. 左侧明细区域 (占据 2 栏) */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1 h-4 bg-slate-900 rounded-full" />
          <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">项目明细清单</h4>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item) => (
            <div key={item.id} className="bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm hover:border-slate-300 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <p className="font-bold text-slate-800 text-sm">
                  {mode === 'purchase' ? (item.product_detail?.model_name || `物料#${item.product}`) : item.custom_product_name}
                </p>
                <span className="text-[10px] font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-500">
                   {item.quantity} {item.unit || 'PCS'}
                </span>
              </div>
              
              {/* 销售单详情描述 */}
              {mode === 'sales' && item.detail_description && (
                <p className="text-[11px] text-slate-500 italic mt-2 leading-relaxed border-l-2 border-slate-200 pl-2">
                  {item.detail_description}
                </p>
              )}
              
              <div className="mt-3 flex justify-between items-center text-[15px] text-slate-400 border-t border-slate-50 pt-2">
                <span>单价: ¥ {Number(item.price).toFixed(2)}</span>
                <span className="font-bold text-slate-700">小计: ¥ {(Number(item.price) * Number(item.quantity)).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. 右侧事件/日志区域 (占据 1 栏) */}
      <div className="border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-8 pt-6 lg:pt-0">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="w-1 h-4 bg-amber-400 rounded-full" />
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">订单执行日志</h4>
          </div>
        </div>

        <div className="relative space-y-6 before:absolute before:inset-0 before:ml-2 before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-200">
          {events?.length ? events.map((event) => (
            <div key={event.id} className="relative pl-8 group">
              {/* 时间轴圆点 */}
              <div className="absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white border-2 border-slate-300 group-hover:border-slate-900 transition-colors" />
              
              <div className="flex flex-col bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-bold text-slate-900 uppercase">
                    {event.event_type_label || event.event_type}
                  </span>
                  <span className="text-[12px] text-slate-400 font-mono">
                    {new Date(event.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-[12px] text-slate-600 leading-relaxed whitespace-pre-line">
                  {event.content}
                </p>
                {event.operator && (
                  <p className="mt-2 text-[12px] text-slate-400 text-right italic">—— {event.operator}</p>
                )}
              </div>
            </div>
          )) : (
            <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-2xl">
              <p className="text-[10px] text-slate-400 font-mono italic uppercase tracking-tighter">No events recorded</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}