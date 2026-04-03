// src/components/common/OrderDetailsView.tsx
export default function OrderDetailsView({ items, events, mode }) {
    const isCompact = items.length > 3 || mode === 'purchase';
  
    return (
      <div className={`grid gap-6 p-4 bg-slate-50/50 rounded-b-xl ${isCompact ? 'grid-cols-1' : 'lg:grid-cols-3'}`}>
        {/* 明细区域 */}
        <div className={isCompact ? '' : 'lg:col-span-2'}>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">项目明细</h4>
          <div className={isCompact ? 'grid grid-cols-1 md:grid-cols-2 gap-2' : 'space-y-3'}>
            {items.map(item => (
              <div key={item.id} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                <div className="flex justify-between font-medium text-slate-900">
                  <span>{item.product_detail?.model_name || item.custom_product_name}</span>
                  <span>{item.quantity} {item.unit || 'pcs'}</span>
                </div>
                {item.detail_description && (
                  <p className="mt-1 text-xs text-slate-500 italic">{item.detail_description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
  
        {/* 事件/日志区域 */}
        <div className="border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">订单事件</h4>
          <div className="space-y-4">
            {events.map(event => (
              <div key={event.id} className="relative pl-4 border-l-2 border-slate-200">
                <div className="absolute -left-[9px] top-1 w-4 h-4 bg-white border-2 border-slate-300 rounded-full" />
                <p className="text-xs font-semibold text-slate-700">{event.event_type_label}</p>
                <p className="text-[11px] text-slate-500">{event.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }