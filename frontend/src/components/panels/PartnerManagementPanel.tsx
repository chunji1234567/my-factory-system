import { FormEvent, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { PartnerResponse } from '../../hooks/usePartners';
import NavbarButton from '../common/NavbarButton';
import FilterBar from '../common/FilterBar';

interface Props {
  partners: PartnerResponse[];
  loading: boolean;
  error: string | null;
  onRefresh(): Promise<void> | void;
}

// --- 核心子组件 1：创建与类型过滤 ---
const PartnerHeader = ({ 
  name, setName, type, setType, onSubmit, submitting, typeFilter, onTypeFilter 
}: any) => (
  <div className="space-y-6">
    <section className="bg-white rounded-[2rem] border border-slate-100 p-6 md:p-8 shadow-sm flex flex-col md:flex-row items-end gap-6 animate-in fade-in duration-500">
      <div className="flex-1 w-full">
        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block ml-2">新增合作方名称</label>
        <input 
          className="w-full rounded-2xl border border-slate-200 px-5 py-3.5 text-base font-bold outline-none focus:border-slate-900 transition-all placeholder:text-slate-300"
          placeholder="输入公司或个人名称..."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="w-full md:w-48">
        <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block ml-2">业务属性</label>
        <select 
          className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-base font-bold bg-white outline-none focus:border-slate-900 transition-all"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="CUSTOMER">客户 (应收)</option>
          <option value="SUPPLIER">供应商 (应付)</option>
          <option value="BOTH">双重身份</option>
        </select>
      </div>
      <NavbarButton 
        onClick={onSubmit} 
        disabled={submitting} 
        className="w-full md:w-auto px-10 py-4 font-black shadow-xl shadow-slate-100 active:scale-95"
      >
        {submitting ? '处理中...' : '确认创建'}
      </NavbarButton>
    </section>

    <div className="flex flex-wrap gap-2 px-1">
      {['ALL', 'CUSTOMER', 'SUPPLIER', 'BOTH'].map(t => (
        <button
          key={t}
          onClick={() => onTypeFilter(t)}
          className={`px-6 py-2 rounded-full text-sm font-black transition-all border-2 ${
            typeFilter === t 
              ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-105' 
              : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
          }`}
        >
          {t === 'ALL' ? '显示全部' : t === 'CUSTOMER' ? '仅客户' : t === 'SUPPLIER' ? '仅供应商' : '双重角色'}
        </button>
      ))}
    </div>
  </div>
);

// --- 核心子组件 2：台账流水表 ---
const LedgerTable = ({ entries }: { entries: any[] }) => {
  if (!entries.length) return (
    <div className="py-20 text-center bg-slate-50/50 rounded-[2rem] border border-dashed border-slate-200">
      <p className="text-sm text-slate-400 font-bold italic tracking-widest uppercase">No Ledger Records Found</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="hidden lg:block overflow-hidden rounded-[1.5rem] border border-slate-100 shadow-sm">
        <table className="min-w-full text-sm border-separate border-spacing-0">
          <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[11px] tracking-widest border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-left">时间</th>
              <th className="px-6 py-4 text-left">业务</th>
              <th className="px-6 py-4 text-right">借方(+)</th>
              <th className="px-6 py-4 text-right">贷方(-)</th>
              <th className="px-6 py-4 text-right">余额变动</th>
              <th className="px-6 py-4 text-left">备注/单据</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 bg-white">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-5 text-slate-400 font-mono text-[11px]">
                  {new Date(entry.created_at).toLocaleString('zh-CN', { hour12: false })}
                </td>
                <td className="px-6 py-5 font-black text-slate-700">
                  {entry.entry_type === 'SALES' ? '销售单' : entry.entry_type === 'PURCHASE' ? '采购单' : '财务流水'}
                </td>
                <td className="px-6 py-5 text-right font-mono text-emerald-600 font-bold">
                  {Number(entry.debit_amount) ? `+${Number(entry.debit_amount).toFixed(2)}` : '-'}
                </td>
                <td className="px-6 py-5 text-right font-mono text-rose-500 font-bold">
                  {Number(entry.credit_amount) ? `-${Number(entry.credit_amount).toFixed(2)}` : '-'}
                </td>
                <td className={`px-6 py-5 text-right font-black font-mono ${Number(entry.amount) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {Number(entry.amount).toFixed(2)}
                </td>
                <td className="px-6 py-5">
                  <div className="flex flex-col">
                    <span className="text-slate-600 font-bold truncate max-w-[200px]">{entry.note || '常规业务'}</span>
                    <span className="text-[10px] text-slate-300 font-mono">REF: {entry.sales_order_no || entry.purchase_order_no || entry.transaction_id || '-'}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100 flex justify-between items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-800">{entry.entry_type === 'SALES' ? '销售' : '采购'}</span>
                <span className="text-[10px] text-slate-400 font-mono">{new Date(entry.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-1">{entry.note || '流水记录'}</p>
            </div>
            <p className={`text-base font-black font-mono ${Number(entry.amount) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {Number(entry.amount) >= 0 ? '+' : ''}{Number(entry.amount).toFixed(2)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- 主面板入口 ---
export default function PartnerManagementPanel({ partners, loading, error, onRefresh }: Props) {
  const [name, setName] = useState('');
  const [partnerType, setPartnerType] = useState('CUSTOMER');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [submitting, setSubmitting] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<any>(null);
  const [detailView, setDetailView] = useState('orders');
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const filteredPartners = useMemo(() => {
    let result = typeFilter === 'ALL' ? partners : partners.filter(p => p.partner_type === typeFilter);
    return [...result].sort((a, b) => b.balance - a.balance);
  }, [partners, typeFilter]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setSubmitting(true);
      await api.createPartner({ name: name.trim(), partner_type: partnerType });
      setName('');
      await onRefresh();
    } catch (err: any) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  const handleOpenDetail = async (partner: any, view = 'orders') => {
    setSelectedPartner(partner);
    setDetailView(view);
    setDetailLoading(true);
    try {
      const type = partner.partner_type === 'SUPPLIER' ? 'payable' : 'receivable';
      const data = await api.getFinancePartnerDetail(partner.id, type, { ledgerPage: 1 });
      setDetailData(data);
    } catch (err: any) { alert(err.message); }
    finally { setDetailLoading(false); }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-32">
      {error && <div className="p-6 bg-rose-50 text-rose-600 rounded-3xl font-black">⚠️ 加载错误: {error}</div>}

      {!selectedPartner ? (
        <>
          <PartnerHeader 
            name={name} setName={setName} 
            type={partnerType} setType={setPartnerType} 
            onSubmit={handleCreate} submitting={submitting}
            typeFilter={typeFilter} onTypeFilter={setTypeFilter}
          />

          <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">合作方名录</h3>
              {loading && <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[11px] tracking-widest">
                  <tr>
                    <th className="px-10 py-5 text-left">名称</th>
                    <th className="px-8 py-5 text-left">类型</th>
                    <th className="px-10 py-5 text-right">往来余额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredPartners.map((p) => (
                    <tr key={p.id} onClick={() => handleOpenDetail(p)} className="hover:bg-slate-50 cursor-pointer transition-colors group">
                      <td className="px-10 py-6">
                        <p className="text-lg font-black text-slate-900 group-hover:text-blue-600">{p.name}</p>
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">UID-{p.id}</p>
                      </td>
                      <td className="px-8 py-6">
                        <span className="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-500 uppercase">
                          {p.partner_type === 'BOTH' ? '全能' : p.partner_type === 'CUSTOMER' ? '客户' : '供应商'}
                        </span>
                      </td>
                      <td className={`px-10 py-6 text-right font-black font-mono text-lg ${p.balance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {p.balance.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <section className="animate-in zoom-in-95 duration-300">
          <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden">
            {/* 详情头部 */}
            <div className="p-8 md:p-12 bg-slate-900 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
              <div>
                <button onClick={() => setSelectedPartner(null)} className="text-slate-500 hover:text-white mb-4 text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-2">
                  ← 返回名录列表
                </button>
                <h2 className="text-3xl md:text-4xl font-black tracking-tighter">{selectedPartner.name}</h2>
                {detailData && (
                  <div className="mt-4 flex gap-4">
                    <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">结算余额</p>
                      <p className={`text-2xl font-black font-mono mt-1 ${Number(detailData.balance) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ¥ {Number(detailData.balance).toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 overflow-x-auto max-w-full">
                {['orders', 'transactions', 'ledger'].map(v => (
                  <button
                    key={v}
                    onClick={() => setDetailView(v)}
                    className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
                      detailView === v ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {v === 'orders' ? '关联订单' : v === 'transactions' ? '资金流水' : '财务对账'}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-8 md:p-12 min-h-[400px]">
              {detailLoading ? (
                <div className="py-20 text-center animate-pulse text-slate-300 font-black tracking-widest uppercase">Syncing Data...</div>
              ) : (
                <>
                  {detailView === 'orders' && (
                    <div className="space-y-4">
                       <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">历史成交单据</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                         {detailData?.orders.map((order: any) => (
                           <div key={order.id} className="bg-slate-50 border border-slate-100 p-6 rounded-[2rem]">
                             <p className="text-xs font-mono text-slate-400 uppercase mb-2">{order.order_no}</p>
                             <p className="text-lg font-black text-slate-900">¥{Number(order.total_amount).toFixed(2)}</p>
                             <div className="mt-4 pt-4 border-t border-slate-200/50 flex justify-between items-center">
                               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{order.status}</span>
                               <span className="text-xs font-bold text-emerald-600">已付: {Number(order.paid_amount).toFixed(2)}</span>
                             </div>
                           </div>
                         ))}
                       </div>
                    </div>
                  )}
                  {detailView === 'transactions' && (
                    <div className="space-y-4">
                       <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">资金收付流水</h4>
                       <div className="space-y-3">
                         {detailData?.transactions.map((txn: any) => (
                           <div key={txn.id} className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex justify-between items-center">
                              <div>
                                <p className="text-sm font-bold text-slate-800">{txn.note || '常规转账'}</p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-mono">{new Date(txn.created_at).toLocaleString()}</p>
                              </div>
                              <p className="text-lg font-black text-slate-900">¥{Number(txn.amount).toFixed(2)}</p>
                           </div>
                         ))}
                       </div>
                    </div>
                  )}
                  {detailView === 'ledger' && (
                    <div className="space-y-6">
                       <div className="flex justify-between items-center">
                         <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">财务对账台账</h4>
                         <button className="text-xs font-black text-blue-600 border border-blue-100 bg-blue-50 px-4 py-2 rounded-full">导出对账单</button>
                       </div>
                       <LedgerTable entries={detailData?.ledger_entries || []} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}