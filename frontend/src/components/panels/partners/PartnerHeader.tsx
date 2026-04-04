// src/components/panels/partners/PartnerHeader.tsx
import React from 'react';
import NavbarButton from '../common/NavbarButton';

export const PartnerHeader = ({ name, setName, type, setType, onSubmit, submitting, typeFilter, onTypeFilter }: any) => {
  return (
    <div className="space-y-4">
      {/* 快速创建行 */}
      <section className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">新增合作方名称</label>
          <input 
            className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-slate-900"
            placeholder="输入机构名称..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="w-40">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">业务类型</label>
          <select 
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-slate-900"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="CUSTOMER">客户</option>
            <option value="SUPPLIER">供应商</option>
            <option value="BOTH">双重角色</option>
          </select>
        </div>
        <NavbarButton onClick={onSubmit} disabled={submitting} className="px-8 py-2 text-sm">
          {submitting ? '...' : '创建'}
        </NavbarButton>
      </section>

      {/* 列表类型快速切换 */}
      <div className="flex gap-2">
        {['ALL', 'CUSTOMER', 'SUPPLIER', 'BOTH'].map(t => (
          <button
            key={t}
            onClick={() => onTypeFilter(t)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
              typeFilter === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-100 hover:border-slate-200'
            }`}
          >
            {t === 'ALL' ? '全部' : t === 'CUSTOMER' ? '客户' : t === 'SUPPLIER' ? '供应商' : '全能'}
          </button>
        ))}
      </div>
    </div>
  );
};