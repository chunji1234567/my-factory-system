import { FormEvent, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { PartnerResponse } from '../../hooks/usePartners';

interface Props {
  partners: PartnerResponse[];
  loading: boolean;
  error: string | null;
  onRefresh(): Promise<void> | void;
}

type DetailView = 'orders' | 'transactions';

type FinancePartnerDetailResponse = {
  partner_id: number;
  partner_name: string;
  partner_type: string;
  balance: string;
  outstanding_amount: string;
  orders: Array<{ id: number; order_no: string; status: string; total_amount: string; paid_amount: string; created_at: string; outstanding_amount: string }>;
  transactions: Array<{ id: number; amount: string; note: string; operator: string; created_at: string }>;
  total_transactions: string;
};

const PARTNER_TYPE_LABEL: Record<string, string> = {
  CUSTOMER: '客户',
  SUPPLIER: '供应商',
  BOTH: '客户/供应商',
};

export default function PartnerManagementPanel({ partners, loading, error, onRefresh }: Props) {
  const [name, setName] = useState('');
  const [partnerType, setPartnerType] = useState<'CUSTOMER' | 'SUPPLIER' | 'BOTH'>('CUSTOMER');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [detail, setDetail] = useState<FinancePartnerDetailResponse | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<PartnerResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailView, setDetailView] = useState<DetailView>('orders');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER' | 'BOTH'>('ALL');

  const filteredPartners = useMemo(() => {
    if (typeFilter === 'ALL') {
      return partners;
    }
    return partners.filter((partner) => partner.partner_type === typeFilter);
  }, [partners, typeFilter]);

  const sortedPartners = useMemo(() => {
    return [...filteredPartners].sort((a, b) => b.balance - a.balance);
  }, [filteredPartners]);

  const handleCreatePartner = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setFormError('请输入名称');
      return;
    }
    try {
      setFormSubmitting(true);
      setFormError(null);
      setFormSuccess(null);
      await api.createPartner({ name: name.trim(), partner_type: partnerType });
      setFormSuccess('合作方已创建');
      setName('');
      setPartnerType('CUSTOMER');
      await Promise.resolve(onRefresh());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setFormSubmitting(false);
    }
  };

  const resolveFinanceType = (type: string): 'receivable' | 'payable' => {
    return type === 'SUPPLIER' ? 'payable' : 'receivable';
  };

  const openDetail = async (partner: PartnerResponse, view: DetailView = 'orders') => {
    setSelectedPartner(partner);
    setDetailView(view);
    setDetailError(null);
    setDetailLoading(true);
    setDetail(null);
    try {
      const financeType = resolveFinanceType(partner.partner_type);
      const data = await api.getFinancePartnerDetail(partner.id, financeType);
      setDetail(data);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : '加载详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedPartner(null);
    setDetail(null);
    setDetailError(null);
  };

  return (
    <div className="mt-8 space-y-6">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {formError && <p className="text-sm text-rose-600">{formError}</p>}
      {formSuccess && <p className="text-sm text-emerald-600">{formSuccess}</p>}
      {detailError && <p className="text-sm text-rose-600">{detailError}</p>}

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-slate-900">创建合作方</h3>
        <p className="text-sm text-slate-500">仅经理可创建，支持客户/供应商/双重角色</p>
        <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={handleCreatePartner}>
          <label className="text-sm text-slate-600">
            <span className="block">名称</span>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="text-sm text-slate-600">
            <span className="block">类型</span>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={partnerType}
              onChange={(event) => setPartnerType(event.target.value as typeof partnerType)}
            >
              <option value="CUSTOMER">客户</option>
              <option value="SUPPLIER">供应商</option>
              <option value="BOTH">客户 + 供应商</option>
            </select>
          </label>
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white sm:self-end disabled:opacity-60"
            disabled={formSubmitting}
          >
            {formSubmitting ? '创建中…' : '创建'}
          </button>
        </form>
      </section>

      {!selectedPartner && (
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-slate-900">合作方列表</h3>
              <p className="text-sm text-slate-500">点击任意合作方进入详情页面查看订单与流水</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {(['ALL', 'CUSTOMER', 'SUPPLIER', 'BOTH'] as const).map((type) => (
                <button
                  key={type}
                  className={`rounded-full px-3 py-1 ${
                    typeFilter === type ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                  onClick={() => setTypeFilter(type)}
                >
                  {type === 'ALL'
                    ? '全部'
                    : type === 'CUSTOMER'
                    ? '客户（应收）'
                    : type === 'SUPPLIER'
                    ? '供应商（应付）'
                    : '客户/供应商'}
                </button>
              ))}
              {loading && <span className="text-slate-500">加载中…</span>}
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">名称</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3 text-right">往来余额</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {sortedPartners.map((partner) => (
                  <tr
                    key={partner.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                    onClick={() => openDetail(partner, 'orders')}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-800">{partner.name}</td>
                    <td className="px-4 py-3">{PARTNER_TYPE_LABEL[partner.partner_type] ?? partner.partner_type}</td>
                    <td className="px-4 py-3 text-right font-mono">{partner.balance.toFixed(2)}</td>
                  </tr>
                ))}
                {!sortedPartners.length && (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-sm text-slate-500">
                      暂无合作方记录。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedPartner && (
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold text-slate-900">合作方详情</h3>
              {detail ? (
                <p className="text-sm text-slate-500">
                  {detail.partner_name} · 余额 {Number(detail.balance).toFixed(2)}
                </p>
              ) : (
                <p className="text-sm text-slate-500">{selectedPartner.name}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              {detail && (
                <>
                  <button
                    className={`rounded-full px-3 py-1 ${detailView === 'orders' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                    onClick={() => setDetailView('orders')}
                  >
                    订单
                  </button>
                  <button
                    className={`rounded-full px-3 py-1 ${detailView === 'transactions' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                    onClick={() => setDetailView('transactions')}
                  >
                    转账记录
                  </button>
                </>
              )}
              <button
                className="rounded-full border border-slate-200 px-3 py-1 text-slate-600"
                onClick={closeDetail}
              >
                返回列表
              </button>
            </div>
          </div>
          {detailLoading && <p className="mt-4 text-sm text-slate-500">正在加载详情…</p>}
          {!detailLoading && detail && detailView === 'orders' && (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-4 py-3">订单号</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3 text-right">金额</th>
                    <th className="px-4 py-3 text-right">已付</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                  {detail.orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.order_no}</td>
                      <td className="px-4 py-3">{order.status}</td>
                      <td className="px-4 py-3 text-right">{Number(order.total_amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{Number(order.paid_amount).toFixed(2)}</td>
                    </tr>
                  ))}
                  {!detail.orders.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-center text-sm text-slate-500">
                        暂无订单记录。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!detailLoading && detail && detailView === 'transactions' && (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-4 py-3">金额</th>
                    <th className="px-4 py-3">备注</th>
                    <th className="px-4 py-3">操作人</th>
                    <th className="px-4 py-3">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                  {detail.transactions.map((txn) => (
                    <tr key={txn.id}>
                      <td className="px-4 py-3 text-right">{Number(txn.amount).toFixed(2)}</td>
                      <td className="px-4 py-3">{txn.note || '-'}</td>
                      <td className="px-4 py-3">{txn.operator || '-'}</td>
                      <td className="px-4 py-3">{new Date(txn.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {!detail.transactions.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-center text-sm text-slate-500">
                        暂无转账记录。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
