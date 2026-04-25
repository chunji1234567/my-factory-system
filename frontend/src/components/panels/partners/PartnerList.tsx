// src/components/panels/partners/PartnerList.tsx
import React from 'react';

export const PartnerList = ({ partners, typeFilter, onTypeChange, onSelect }: any) => {
  const labels = { CUSTOMER: '客户', SUPPLIER: '供应商', BOTH: '全能' };

  return (
    <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-8 md:p-10 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">合作方库</h3>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Partner & Financial Directory</p>
        </div>
        
        {/* 分类切换器 */}
        <div className="flex flex-wrap gap-2">
          {['ALL', 'CUSTOMER', 'SUPPLIER', 'BOTH'].map((t) => (
            <button
              key={t}
              onClick={() => onTypeChange(t)}
              className={`px-5 py-2 rounded-full text-xs font-black transition-all border-2 ${
                typeFilter === t ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
              }`}
            >
              {t === 'ALL' ? '全部' : labels[t as keyof typeof labels] || t}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="bg-slate-50/50 text-slate-500 uppercase text-[13px] font-black tracking-widest">
            <tr>
              <th className="px-10 py-5 text-left">机构名称 / ID</th>
              <th className="px-8 py-5 text-left">业务属性</th>
              <th className="px-10 py-5 text-right">往来余额</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {partners.map((p: any) => (
              <tr 
                key={p.id} 
                onClick={() => onSelect(p)}
                className="hover:bg-slate-50/50 cursor-pointer group transition-all"
              >
                <td className="px-10 py-7">
                  <p className="text-lg font-black text-slate-900 group-hover:text-blue-600 transition-colors">{p.name}</p>
                  <p className="text-xs font-mono text-slate-400 mt-1 uppercase tracking-widest">UID-{p.id}</p>
                </td>
                <td className="px-8 py-7">
                  <span className="px-3 py-1 bg-slate-100 rounded-lg text-[11px] font-black text-slate-500 uppercase">
                    {labels[p.partner_type as keyof typeof labels]}
                  </span>
                </td>
                <td className="px-10 py-7 text-right">
                  <p className={`text-xl font-black font-mono ${p.balance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {p.balance.toFixed(2)}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};