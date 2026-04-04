// src/components/panels/warehouse/ReceivingModal.tsx
import React from 'react';
import Modal from '../../common/Modal';
import NavbarButton from '../../common/NavbarButton';

interface ReceivingModalProps {
  open: boolean;
  onClose: () => void;
  order: any;
  draft: { purchaseItemId: number | null; quantity: string; remark: string };
  setDraft: (val: any) => void;
  onConfirm: () => void;
  error: string | null;
  saving: boolean;
}

export const ReceivingModal = ({ 
  open, onClose, order, draft, setDraft, onConfirm, error, saving 
}: ReceivingModalProps) => {
  if (!order) return null;

  return (
    <Modal 
      open={open} 
      onClose={onClose} 
      title="物料收货确认" 
      maxWidth="max-w-xl"
      footer={
        <div className="flex flex-col md:flex-row gap-3 w-full">
          <NavbarButton variant="outline" className="w-full md:flex-1 py-4 order-2 md:order-1 font-bold" onClick={onClose}>
            取消
          </NavbarButton>
          <NavbarButton 
            className="w-full md:flex-1 py-4 bg-slate-900 text-white order-1 md:order-2 font-black shadow-xl shadow-slate-200" 
            disabled={saving} 
            onClick={onConfirm}
          >
            {saving ? '同步中...' : '确认入库'}
          </NavbarButton>
        </div>
      }
    >
      <div className="space-y-6 py-2">
        {/* 订单预览卡片 */}
        <div className="bg-slate-900 rounded-[2rem] p-5 text-white shadow-lg">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Purchase Order Context</p>
          <p className="text-lg font-bold mt-2 leading-snug">{order.partner_name}</p>
          <p className="text-[11px] font-mono text-slate-500 mt-1 uppercase tracking-widest">{order.order_no}</p>
        </div>

        {error && (
          <div className="bg-rose-50 border-2 border-rose-100 p-5 rounded-2xl text-rose-600 text-sm font-black animate-in shake duration-300">
            ⚠️ 错误提示：{error}
          </div>
        )}

        <div className="space-y-5">
          {/* 物料选择器 */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest ml-2">选择收货物料</label>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-slate-900 focus:bg-white transition-all"
              value={draft.purchaseItemId ?? ''}
              onChange={(e) => setDraft({ ...draft, purchaseItemId: Number(e.target.value) })}
            >
              <option value="">请选择物料...</option>
              {order.items.map((item: any) => {
                const remaining = Number(item.quantity) - Number(item.received_quantity ?? 0);
                return (
                  <option key={item.id} value={item.id} disabled={remaining <= 0}>
                    {item.product_detail?.model_name} (待收: {Math.max(remaining, 0)})
                  </option>
                );
              })}
            </select>
          </div>

          {/* 数量输入 */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest ml-2">本次到货数量</label>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-bold text-slate-900 outline-none focus:border-slate-900 focus:bg-white transition-all placeholder:text-slate-300"
              placeholder="0"
              value={draft.quantity}
              onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
            />
          </div>

          {/* 备注输入 */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest ml-2">收货备注 (选填)</label>
            <input
              type="text"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none focus:border-slate-900 focus:bg-white transition-all placeholder:text-slate-300"
              placeholder="记录批次、损坏情况等..."
              value={draft.remark}
              onChange={(e) => setDraft({ ...draft, remark: e.target.value })}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};
