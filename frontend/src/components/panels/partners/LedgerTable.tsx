// src/components/panels/partners/LedgerTable.tsx
import React from 'react';

const LEDGER_ENTRY_TYPE_LABEL: Record<string, string> = {
  SALES: '销售单',
  PURCHASE: '采购单',
  FINANCE: '流水',
  ADJUST: '调账',
  OPENING: '期初',
};

export const LedgerTable = ({ entries }: { entries: any[] }) => {
  if (!entries.length) {
    return (
      <div className="py-20 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
        <p className="text-sm text-slate-400 italic">暂无对账流水记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 桌面端：标准财务对账表 */}
      <div className="hidden lg:block overflow-hidden rounded-xl border border-slate-100 shadow-sm">
        <table className="min-w-full text-[13px] border-separate border-spacing-0">
          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
            <tr>
              <th className="px-4 py-3 text-left">日期时间</th>
              <th className="px-4 py-3 text-left">业务类型</th>
              <th className="px-4 py-3 text-right">借方(+)</th>
              <th className="px-4 py-3 text-right">贷方(-)</th>
              <th className="px-4 py-3 text-right">净额变动</th>
              <th className="px-4 py-3 text-left">备注/单号</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {entries.map((entry) => {
              const net = Number(entry.amount);
              const source = entry.sales_order_no || entry.purchase_order_no || entry.transaction_id || '-';
              
              return (
                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-4 text-slate-400 font-mono text-[11px]">
                    {new Date(entry.created_at).toLocaleString('zh-CN', { hour12: false })}
                  </td>
                  <td className="px-4 py-4 font-bold text-slate-700">
                    {LEDGER_ENTRY_TYPE_LABEL[entry.entry_type] || entry.entry_type}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-emerald-600">
                    {Number(entry.debit_amount) ? `+${Number(entry.debit_amount).toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-rose-500">
                    {Number(entry.credit_amount) ? `-${Number(entry.credit_amount).toFixed(2)}` : '-'}
                  </td>
                  <td className={`px-4 py-4 text-right font-black font-mono ${net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {net.toFixed(2)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="text-slate-600 font-medium truncate max-w-[150px]">{entry.note || '无备注'}</span>
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">REF: {source}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 移动端：双行精简卡片流 */}
      <div className="lg:hidden space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-800">{LEDGER_ENTRY_TYPE_LABEL[entry.entry_type]}</span>
                <span className="text-[10px] text-slate-400 font-mono">{new Date(entry.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-[10px] text-slate-400 truncate mt-1">
                {entry.note || entry.sales_order_no || entry.purchase_order_no || '常规流水'}
              </p>
            </div>
            <div className="text-right ml-4">
              <p className={`text-sm font-black font-mono ${Number(entry.amount) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                {Number(entry.amount) >= 0 ? '+' : ''}{Number(entry.amount).toFixed(2)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};