import React from 'react';
import NavbarButton from '../../common/NavbarButton';

interface PartnerDetailViewProps {
  detail: any;
  view: 'orders' | 'transactions' | 'ledger';
  onViewChange: (view: any) => void;
  onBack: () => void;
  onExport: () => void;
  ledgerContent: React.ReactNode;
  ledgerExporting?: boolean;
  ordersPagination?: React.ReactNode;
  transactionsPagination?: React.ReactNode;
}

export const PartnerDetailView = ({ 
  detail, 
  view, 
  onViewChange, 
  onBack, 
  onExport, 
  ledgerContent,
  ledgerExporting,
  ordersPagination,
  transactionsPagination,
}: PartnerDetailViewProps) => {
  if (!detail) return null;

  const isSupplierPartner = detail.partner_type === 'SUPPLIER';

  const renderItemTitle = (item: any) => {
    if (isSupplierPartner) {
      return item.product_detail?.model_name || `物料#${item.product}`;
    }
    return item.custom_product_name;
  };

  const renderItemProgress = (item: any) => {
    const ordered = Number(item.quantity ?? 0);
    if (isSupplierPartner) {
      const received = Number(item.received_quantity ?? 0);
      return `已收 ${received} / 订购 ${ordered}`;
    }
    const shipped = Number(item.shipped_quantity ?? 0);
    return `已发 ${shipped} / 订购 ${ordered}`;
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-300">
      {/* 1. 头部详情摘要 */}
      <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-slate-900">{detail.partner_name}</h3>
            <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded font-bold text-slate-400 uppercase tracking-widest">
              UID-{detail.partner_id}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1 font-bold">
            往来账户总余额：
            <span className={`font-mono ml-1 ${Number(detail.balance) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              ¥{Number(detail.balance).toFixed(2)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2 bg-white p-1 rounded-xl border border-slate-200">
          {[
            { id: 'orders', label: '关联订单' },
            { id: 'transactions', label: '转账流水' },
            { id: 'ledger', label: '财务台账' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => onViewChange(tab.id as any)}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                view === tab.id 
                  ? 'bg-slate-900 text-white shadow-md' 
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="w-[1px] h-4 bg-slate-200 self-center mx-1" />
          <button 
            onClick={onBack} 
            className="px-4 py-1.5 text-xs font-black text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
          >
            关闭详情
          </button>
        </div>
      </div>

      {/* 2. 视图内容区 */}
      <div className="p-6 min-h-[400px]">
        {/* --- A. 订单视图 --- */}
        {view === 'orders' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Historical Orders</span>
            </div>
            <div className="space-y-4">
              {detail.orders && detail.orders.length > 0 ? (
                detail.orders.map((order: any) => (
                  <div key={order.id} className="bg-slate-50 border border-slate-100 p-5 rounded-2xl hover:border-slate-300 transition-colors">
                    <div className="flex justify-between gap-4 flex-wrap">
                      <div>
                        <span className="text-[11px] font-mono text-slate-400 font-bold uppercase">{order.order_no}</span>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {order.created_at ? new Date(order.created_at).toLocaleString() : '未知时间'}
                        </p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-500 font-black uppercase">
                        {order.status}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {order.items && order.items.length > 0 ? (
                        order.items.map((item: any, idx: number) => (
                          <div
                            key={item.id || `${order.id}-${idx}`}
                            className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="font-bold text-slate-800 text-sm">
                                  {renderItemTitle(item)}
                                </p>
                                {!isSupplierPartner && item.detail_description && (
                                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                    {item.detail_description}
                                  </p>
                                )}
                              </div>
                              <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 rounded text-slate-500 font-bold">
                                {Number(item.quantity ?? 0)} {item.product_detail?.unit || 'PCS'}
                              </span>
                            </div>
                            <div className="mt-3 text-[11px] font-bold text-slate-500">
                              {renderItemProgress(item)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">暂无明细</div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-20 text-center text-slate-300 font-bold italic">暂无订单历史记录</div>
              )}
            </div>
            {ordersPagination}
          </div>
        )}

        {/* --- B. 转账流水视图 --- */}
        {view === 'transactions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Transaction History</span>
            </div>
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
              {detail.transactions && detail.transactions.length > 0 ? (
                detail.transactions.map((txn: any) => (
                  <div key={txn.id} className="bg-white p-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{txn.note || '转账业务'}</p>
                      <p className="text-[10px] text-slate-400 mt-1 font-medium font-mono uppercase">
                        {new Date(txn.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-black text-slate-900">¥{Number(txn.amount).toFixed(2)}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">BY: {txn.operator || 'SYSTEM'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center text-slate-300 font-bold italic bg-white">暂无资金流水记录</div>
              )}
            </div>
            {transactionsPagination}
          </div>
        )}

        {/* --- C. 台账视图 (使用外部传入内容) --- */}
        {view === 'ledger' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Financial Ledger Audit</span>
              <NavbarButton 
                onClick={onExport} 
                variant="outline" 
                className="text-[10px] py-1.5 px-4 font-black border-slate-200 hover:bg-slate-50"
                disabled={ledgerExporting}
              >
                {ledgerExporting ? '导出中...' : '导出数据 (CSV)'}
              </NavbarButton>
            </div>
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {ledgerContent}
            </div>
          </div>
        )}
      </div>

      {/* 底部提示区 */}
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
        <p className="text-[10px] text-slate-400 font-medium text-center italic">
          所有账务数据均实时从系统财务模块同步，仅供内部对账使用。
        </p>
      </div>
    </div>
  );
};
