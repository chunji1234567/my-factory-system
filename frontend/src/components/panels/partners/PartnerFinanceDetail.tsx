// src/components/panels/partners/PartnerFinanceDetail.tsx
import React from 'react';
import NavbarButton from '../../common/NavbarButton';



export const PartnerFinanceDetail = ({ detail, view, onViewChange, onBack, onExport }: any) => {
  if (!detail) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 1. 顶部数据大牌 */}
      <div className="bg-slate-900 rounded-[3rem] p-10 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-8 shadow-2xl shadow-slate-200">
        <div>
          <button onClick={onBack} className="text-slate-500 hover:text-white mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-colors">
            ← 返回列表
          </button>
          <h2 className="text-4xl font-black tracking-tight">{detail.partner_name}</h2>
          <div className="mt-4 flex gap-4">
            <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">往来余额</p>
              <p className="text-2xl font-black font-mono mt-1">¥ {Number(detail.balance).toFixed(2)}</p>
            </div>
          </div>
        </div>
        
        {/* 视图切换按钮 */}
        <div className="flex bg-white/5 p-2 rounded-3xl border border-white/10">
          {['orders', 'transactions', 'ledger'].map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={`px-8 py-3 rounded-2xl text-xs font-black transition-all ${
                view === v ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'
              }`}
            >
              {v === 'orders' ? '订单' : v === 'transactions' ? '流水' : '台账'}
            </button>
          ))}
        </div>
      </div>

      {/* 2. 内容区域：根据 view 渲染不同的 Table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-2 shadow-sm">
        {view === 'ledger' && (
           <div className="p-8">
             <div className="flex justify-between items-center mb-8">
                <h4 className="text-xl font-black text-slate-900">对账台账记录</h4>
                <NavbarButton onClick={onExport} variant="outline" className="text-xs">导出 CSV 数据</NavbarButton>
             </div>
             {/* 此处放置台账表格... */}
           </div>
        )}
        {/* 其他视图内容... */}
      </div>
    </div>
  );
};