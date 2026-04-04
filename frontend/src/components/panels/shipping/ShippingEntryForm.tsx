// src/components/panels/shipping/ShippingEntryForm.tsx
import React from 'react';
import NavbarButton from '../../common/NavbarButton';

interface ShippingEntryDraft {
  orderId: string;
  itemId: string;
  quantity: string;
  trackingNo: string;
}

interface ShippingEntryFormProps {
  orders: any[];
  drafts: ShippingEntryDraft[];
  onDraftChange: (index: number, field: keyof ShippingEntryDraft, value: string) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onSubmit: (records: Array<{ orderId: number; itemId: number; quantity: number; trackingNo?: string }>) => void;
  isSaving: boolean;
}

export const ShippingEntryForm = ({
  orders,
  drafts,
  onDraftChange,
  onAddRow,
  onRemoveRow,
  onSubmit,
  isSaving
}: ShippingEntryFormProps) => {

  const activeOrderOptions = orders.filter(o => o.status !== 'COMPLETED');
  
  const getAvailableItems = (orderId: string) => {
    const order = orders.find(o => String(o.id) === orderId);
    return (order?.items || []).filter((item: any) => 
      Number(item.quantity) > Number(item.shipped_quantity || 0)
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const validRecords = drafts
      .filter((draft) => draft.orderId && draft.itemId && Number(draft.quantity) > 0)
      .map((draft) => ({
        orderId: Number(draft.orderId),
        itemId: Number(draft.itemId),
        quantity: Number(draft.quantity),
        trackingNo: draft.trackingNo.trim() || undefined,
      }));
    if (!validRecords.length) {
      alert('请填写至少一条有效的发货记录');
      return;
    }
    onSubmit(validRecords);
  };

  return (
    <section className="bg-white rounded-[1.5rem] md:rounded-[3rem] p-5 md:p-10 border border-slate-100 shadow-sm animate-in fade-in duration-500">
      {/* 头部区域适配 */}
      <div className="mb-6 md:mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">记录发货</h2>
          <p className="text-xs md:text-sm text-slate-500 mt-1 md:mt-2 leading-relaxed">
            先选择订单，再选择该订单下的客户明细，可一次批量创建多条发货记录。
          </p>
        </div>
        {/* 移动端快捷添加按钮 */}
        <button 
          type="button" 
          onClick={onAddRow} 
          className="md:hidden w-10 h-10 flex items-center justify-center bg-slate-900 text-white rounded-full shadow-lg active:scale-90 transition-transform"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 md:space-y-6">
        <div className="space-y-4 md:space-y-6">
          {drafts.map((draft, idx) => {
            const availableItems = getAvailableItems(draft.orderId);

            return (
              <div 
                key={idx} 
                className="relative group bg-slate-50/50 p-4 md:p-7 rounded-[1.75rem] border border-slate-100 transition-all hover:border-slate-300 hover:bg-slate-50"
              >
                {/* 移动端：显示行号标记 */}
                <div className="md:hidden absolute -top-2 -left-2 w-7 h-7 bg-white border border-slate-200 rounded-full flex items-center justify-center text-[10px] font-black text-slate-400 shadow-sm">
                  {idx + 1}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1.5fr_1fr_1.5fr_40px] gap-4 md:gap-5 items-end">
                  {/* 1. 销售订单 */}
                  <div className="space-y-2">
                    <label className="text-[10px] md:text-[12px] font-semibold text-slate-500 uppercase tracking-[0.3em] ml-1">销售订单</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-xl md:rounded-2xl px-4 py-2.5 md:py-3 text-sm md:text-base font-medium text-slate-700 outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all"
                      value={draft.orderId}
                      onChange={(e) => onDraftChange(idx, 'orderId', e.target.value)}
                      required
                    >
                      <option value="">请选择订单</option>
                      {activeOrderOptions.map(o => (
                        <option key={o.id} value={o.id}>{o.order_no} · {o.partner_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* 2. 销售明细 */}
                  <div className="space-y-2">
                    <label className="text-[10px] md:text-[12px] font-semibold text-slate-500 uppercase tracking-[0.3em] ml-1">销售明细</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-xl md:rounded-2xl px-4 py-2.5 md:py-3 text-sm md:text-base font-medium text-slate-700 outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 disabled:opacity-40 transition-all"
                      value={draft.itemId}
                      disabled={!draft.orderId}
                      onChange={(e) => onDraftChange(idx, 'itemId', e.target.value)}
                      required
                    >
                      <option value="">请选择明细</option>
                      {availableItems.map((item: any) => (
                        <option key={item.id} value={item.id}>
                          {item.custom_product_name} (待发: {Number(item.quantity) - Number(item.shipped_quantity)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3. 发货数量 */}
                  <div className="space-y-2">
                    <label className="text-[10px] md:text-[12px] font-semibold text-slate-500 uppercase tracking-[0.3em] ml-1">发货数量</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full bg-white border border-slate-200 rounded-xl md:rounded-2xl px-4 py-2.5 md:py-3 text-sm md:text-base font-medium text-slate-900 outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all"
                      placeholder="0"
                      value={draft.quantity}
                      onChange={(e) => onDraftChange(idx, 'quantity', e.target.value)}
                      required
                    />
                  </div>

                  {/* 4. 物流单号 */}
                  <div className="space-y-2">
                    <label className="text-[10px] md:text-[12px] font-semibold text-slate-500 uppercase tracking-[0.3em] ml-1">物流单号</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-200 rounded-xl md:rounded-2xl px-4 py-2.5 md:py-3 text-sm md:text-base font-medium text-slate-900 outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all"
                      placeholder="选填"
                      value={draft.trackingNo}
                      onChange={(e) => onDraftChange(idx, 'trackingNo', e.target.value)}
                    />
                  </div>

                  {/* 5. 删除按钮 - 移动端位置适配 */}
                  {drafts.length > 1 && (
                    <div className="flex justify-end md:justify-center pt-2 md:pt-0">
                      <button 
                        type="button" 
                        onClick={() => onRemoveRow(idx)} 
                        className="p-2 md:p-3 text-slate-300 hover:text-rose-500 transition-colors bg-white md:bg-transparent rounded-full border border-slate-100 md:border-0 shadow-sm md:shadow-none"
                      >
                        <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部按钮适配 */}
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 pt-4 md:pt-6">
          <NavbarButton 
            type="button" 
            variant="outline" 
            className="w-full md:w-auto px-8 py-2.5 md:py-3 text-sm md:text-base font-semibold border-slate-200 hover:bg-slate-50"
            onClick={onAddRow}
          >
            添加更多明细
          </NavbarButton>
          <NavbarButton 
            type="submit" 
            disabled={isSaving}
            className="w-full md:flex-1 px-10 py-2.5 md:py-3 text-sm md:text-base font-semibold bg-slate-900 text-white shadow-xl shadow-slate-200 active:scale-[0.98]"
          >
            {isSaving ? '正在记录中…' : '确认记录发货'}
          </NavbarButton>
        </div>
      </form>
    </section>
  );
};
