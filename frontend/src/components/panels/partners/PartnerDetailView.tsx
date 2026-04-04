// src/components/panels/partners/PartnerDetailView.tsx
import React from 'react';
import NavbarButton from '../common/NavbarButton';

export const PartnerDetailView = ({ detail, view, onViewChange, onBack, onExport, ledgerContent }: any) => {
  if (!detail) return null;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-300">
      {/* 头部详情摘要 */}
      <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
             <h3 className="text-lg font-black text-slate-900">{detail.partner_name}</h3>
             <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded font-bold text-slate-600 uppercase">UID-{detail.partner_id}</span>
          </div>
          <p className="text-sm text-slate-500 mt-1 font-bold">当前总余额：<span className="text-slate-900 font-mono">¥{Number(detail.balance).toFixed(2)}</span></p>
        </div>
        <div className="flex gap-2 bg-white p-1 rounded-xl border border-slate-200">
          {['orders', 'transactions', 'ledger'].map(v => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === v ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              {v === 'orders' ? '订单' : v === 'transactions' ? '转账' : '台账'}
            </button>
          ))}
          <button onClick={onBack} className="px-4 py-1.5 text-xs font-bold text-rose-500">关闭详情</button>
        </div>
      </div>

      {/* 视图内容区 */}
      <div className="p-6 min-h-[300px]">
        {view === 'ledger' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">财务对账流水</span>
              <NavbarButton onClick={onExport} variant="outline" className="text-[10px] py-1">导出流水</NavbarButton>
            </div>
            {/* 这里渲染原本的台账 Table，保持字号在 text-xs 到 text-sm */}
            {ledgerContent}
          </div>
        )}
        {/* 其他视图 (orders, transactions) 同理渲染 */}
      </div>
    </div>
  );
};