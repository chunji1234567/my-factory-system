// src/components/panels/partners/PartnerTable.tsx
import React from 'react';

export const PartnerTable = ({ partners, onSelect }: any) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* 桌面端表格 */}
      <div className="hidden md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-left">合作方名称</th>
              <th className="px-6 py-4 text-left">属性</th>
              <th className="px-6 py-4 text-right">账户余额</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {partners.map((p: any) => (
              <tr key={p.id} onClick={() => onSelect(p)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                <td className="px-6 py-4 font-bold text-slate-800">{p.name}</td>
                <td className="px-6 py-4 text-slate-500">{p.partner_type === 'BOTH' ? '全能' : p.partner_type === 'CUSTOMER' ? '客户' : '供应商'}</td>
                <td className={`px-6 py-4 text-right font-mono font-bold ${p.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {p.balance.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 移动端卡片列表 */}
      <div className="md:hidden divide-y divide-slate-50">
        {partners.map((p: any) => (
          <div key={p.id} onClick={() => onSelect(p)} className="p-4 active:bg-slate-50 flex justify-between items-center">
            <div>
              <p className="text-sm font-bold text-slate-800">{p.name}</p>
              <p className="text-[10px] text-slate-400 uppercase">{p.partner_type}</p>
            </div>
            <p className={`text-sm font-mono font-bold ${p.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {p.balance.toFixed(2)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};