import { FormEvent, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { PartnerResponse } from '../../hooks/usePartners';
import NavbarButton from '../common/NavbarButton';

interface Props {
  partners: PartnerResponse[];
  loading: boolean;
  error: string | null;
  onRefresh(): Promise<void> | void;
}

type DetailView = 'orders' | 'transactions' | 'ledger';

type LedgerEntryResponse = {
  id: number;
  entry_type: string;
  amount: string;
  debit_amount: string;
  credit_amount: string;
  note: string;
  created_at: string;
  sales_order_id?: number | null;
  sales_order_no?: string | null;
  purchase_order_id?: number | null;
  purchase_order_no?: string | null;
  transaction_id?: number | null;
};

type LedgerPagination = {
  page: number;
  page_size: number;
  total_pages: number;
  total_items: number;
};

type FinancePartnerDetailResponse = {
  partner_id: number;
  partner_name: string;
  partner_type: string;
  balance: string;
  outstanding_amount: string;
  orders: Array<{ id: number; order_no: string; status: string; total_amount: string; paid_amount: string; created_at: string; outstanding_amount: string }>;
  transactions: Array<{ id: number; amount: string; note: string; operator: string; created_at: string }>;
  total_transactions: string;
  ledger_entries: LedgerEntryResponse[];
  ledger_pagination: LedgerPagination;
};

const PARTNER_TYPE_LABEL: Record<string, string> = {
  CUSTOMER: '客户',
  SUPPLIER: '供应商',
  BOTH: '客户/供应商',
};

const LEDGER_ENTRY_TYPE_LABEL: Record<string, string> = {
  SALES: '销售订单',
  PURCHASE: '采购订单',
  FINANCE: '财务流水',
  ADJUST: '余额调整',
  OPENING: '期初余额',
};

function formatLedgerSource(entry: LedgerEntryResponse) {
  if (entry.sales_order_no) {
    return `销售单 ${entry.sales_order_no}`;
  }
  if (entry.purchase_order_no) {
    return `采购单 ${entry.purchase_order_no}`;
  }
  if (entry.transaction_id) {
    return `财务流水 #${entry.transaction_id}`;
  }
  return '-';
}

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
  const [ledgerFilterFrom, setLedgerFilterFrom] = useState('');
  const [ledgerFilterTo, setLedgerFilterTo] = useState('');
  const [appliedLedgerFrom, setAppliedLedgerFrom] = useState<string | null>(null);
  const [appliedLedgerTo, setAppliedLedgerTo] = useState<string | null>(null);
  const [ledgerExporting, setLedgerExporting] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER' | 'BOTH'>('ALL');
  const hasAppliedLedgerFilters = Boolean(appliedLedgerFrom || appliedLedgerTo);

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

  const openDetail = async (
    partner: PartnerResponse,
    view: DetailView = 'orders',
    options: { ledgerPage?: number; ledgerFrom?: string | null; ledgerTo?: string | null } = {},
  ) => {
    const switchingPartner = partner.id !== selectedPartner?.id;
    setSelectedPartner(partner);
    setDetailView(view);
    setDetailError(null);
    setDetailLoading(true);
    setDetail(null);
    if (switchingPartner) {
      setLedgerFilterFrom('');
      setLedgerFilterTo('');
      setAppliedLedgerFrom(null);
      setAppliedLedgerTo(null);
    }
    try {
      const financeType = resolveFinanceType(partner.partner_type);
      const ledgerFrom = options.ledgerFrom !== undefined ? options.ledgerFrom : appliedLedgerFrom;
      const ledgerTo = options.ledgerTo !== undefined ? options.ledgerTo : appliedLedgerTo;
      const ledgerPage = options.ledgerPage ?? 1;
      const params: {
        ledgerPage?: number;
        ledgerFrom?: string;
        ledgerTo?: string;
      } = { ledgerPage };
      if (ledgerFrom) {
        params.ledgerFrom = ledgerFrom;
      }
      if (ledgerTo) {
        params.ledgerTo = ledgerTo;
      }
      const data = await api.getFinancePartnerDetail(partner.id, financeType, params);
      if (options.ledgerFrom !== undefined) {
        setAppliedLedgerFrom(options.ledgerFrom || null);
      }
      if (options.ledgerTo !== undefined) {
        setAppliedLedgerTo(options.ledgerTo || null);
      }
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
    setDetailView('orders');
    setLedgerFilterFrom('');
    setLedgerFilterTo('');
    setAppliedLedgerFrom(null);
    setAppliedLedgerTo(null);
  };

  const handleExportLedger = async () => {
    if (!selectedPartner) {
      return;
    }
    try {
      setLedgerExporting(true);
      const financeType = resolveFinanceType(selectedPartner.partner_type);
      const blob = await api.exportFinancePartnerLedger(selectedPartner.id, financeType, {
        ledgerFrom: appliedLedgerFrom,
        ledgerTo: appliedLedgerTo,
        summary: true,
      });
      const partnerName = detail?.partner_name || selectedPartner.name || 'partner';
      const safeName = partnerName.replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
      const timestamp = new Date().toISOString().slice(0, 10);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeName || 'partner'}_ledger_${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setLedgerExporting(false);
    }
  };

  const handleApplyLedgerFilters = () => {
    if (!selectedPartner) {
      return;
    }
    openDetail(selectedPartner, 'ledger', {
      ledgerPage: 1,
      ledgerFrom: ledgerFilterFrom || null,
      ledgerTo: ledgerFilterTo || null,
    });
  };

  const handleResetLedgerFilters = () => {
    if (!selectedPartner) {
      return;
    }
    setLedgerFilterFrom('');
    setLedgerFilterTo('');
    setAppliedLedgerFrom(null);
    setAppliedLedgerTo(null);
    openDetail(selectedPartner, 'ledger', {
      ledgerPage: 1,
      ledgerFrom: null,
      ledgerTo: null,
    });
  };

  return (
    <div className="mt-8 space-y-6">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {formError && <p className="text-sm text-rose-600">{formError}</p>}
      {formSuccess && <p className="text-sm text-emerald-600">{formSuccess}</p>}
      {detailError && <p className="text-sm text-rose-600">{detailError}</p>}

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-slate-900">创建合作方</h3>
        <p className="text-sm text-slate-500">支持客户/供应商/双重角色</p>
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
            <table className="hidden min-w-full divide-y divide-slate-100 text-sm lg:table">
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
          <div className="mt-4 space-y-3 lg:hidden">
            {sortedPartners.map((partner) => (
              <button
                key={partner.id}
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"
                onClick={() => openDetail(partner, 'orders')}
              >
                <p className="text-base font-semibold text-slate-900">{partner.name}</p>
                <p className="text-xs text-slate-500">{PARTNER_TYPE_LABEL[partner.partner_type] ?? partner.partner_type}</p>
                <p className="mt-2 text-sm text-slate-600">余额：{partner.balance.toFixed(2)}</p>
              </button>
            ))}
            {!sortedPartners.length && (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                暂无合作方记录。
              </p>
            )}
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
                  <button
                    className={`rounded-full px-3 py-1 ${detailView === 'ledger' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                    onClick={() => setDetailView('ledger')}
                  >
                    台账
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
              <table className="hidden min-w-full divide-y divide-slate-100 text-sm lg:table">
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
              <div className="mt-3 space-y-2 lg:hidden">
                {detail.orders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                    <p className="font-semibold text-slate-800">{order.order_no}</p>
                    <p className="text-slate-500">状态：{order.status}</p>
                    <p className="text-slate-500">金额：{Number(order.total_amount).toFixed(2)}</p>
                    <p className="text-slate-500">已付：{Number(order.paid_amount).toFixed(2)}</p>
                  </div>
                ))}
                {!detail.orders.length && <p className="text-center text-sm text-slate-500">暂无订单记录。</p>}
              </div>
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
          {!detailLoading && detail && detailView === 'ledger' && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-end gap-3 text-sm text-slate-600">
                <label className="text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">开始日期</span>
                  <input
                    type="date"
                    className="mt-1 rounded-lg border border-slate-200 px-3 py-1 text-sm"
                    value={ledgerFilterFrom}
                    onChange={(event) => setLedgerFilterFrom(event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">结束日期</span>
                  <input
                    type="date"
                    className="mt-1 rounded-lg border border-slate-200 px-3 py-1 text-sm"
                    value={ledgerFilterTo}
                    onChange={(event) => setLedgerFilterTo(event.target.value)}
                  />
                </label>
                <div className="flex gap-2">
                  <NavbarButton
                    type="button"
                    variant="outline"
                    onClick={handleApplyLedgerFilters}
                    disabled={!selectedPartner || detailLoading}
                  >
                    筛选
                  </NavbarButton>
                  <NavbarButton
                    type="button"
                    variant="outline"
                    onClick={handleResetLedgerFilters}
                    disabled={
                      (!ledgerFilterFrom && !ledgerFilterTo && !hasAppliedLedgerFilters) || !selectedPartner || detailLoading
                    }
                  >
                    重置筛选
                  </NavbarButton>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="hidden min-w-full divide-y divide-slate-100 text-sm lg:table">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-4 py-3">日期</th>
                      <th className="px-4 py-3">类型</th>
                      <th className="px-4 py-3 text-right">借方</th>
                      <th className="px-4 py-3 text-right">贷方</th>
                      <th className="px-4 py-3 text-right">净额</th>
                      <th className="px-4 py-3">备注</th>
                      <th className="px-4 py-3">来源</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {detail.ledger_entries.map((entry) => {
                      const debit = Number(entry.debit_amount);
                      const credit = Number(entry.credit_amount);
                      const net = Number(entry.amount);
                      const netColor = net >= 0 ? 'text-emerald-600' : 'text-rose-600';
                      return (
                        <tr key={entry.id}>
                          <td className="px-4 py-3 text-xs text-slate-500">{new Date(entry.created_at).toLocaleString()}</td>
                          <td className="px-4 py-3">{LEDGER_ENTRY_TYPE_LABEL[entry.entry_type] || entry.entry_type}</td>
                          <td className="px-4 py-3 text-right">{debit ? `¥ ${debit.toFixed(2)}` : '-'}</td>
                          <td className="px-4 py-3 text-right">{credit ? `¥ ${credit.toFixed(2)}` : '-'}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${netColor}`}>
                            {net ? `¥ ${Math.abs(net).toFixed(2)}` : '-'}
                          </td>
                          <td className="px-4 py-3">{entry.note || '-'}</td>
                          <td className="px-4 py-3">{formatLedgerSource(entry)}</td>
                        </tr>
                      );
                    })}
                    {!detail.ledger_entries.length && (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 text-center text-sm text-slate-500">
                          暂无台账记录。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                <span>
                  第 {detail.ledger_pagination.page} / {detail.ledger_pagination.total_pages} 页 ，
                  共 {detail.ledger_pagination.total_items} 条
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 disabled:opacity-50"
                    onClick={handleExportLedger}
                    disabled={ledgerExporting || detailLoading}
                  >
                    {ledgerExporting ? '导出中…' : '导出台账'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 disabled:opacity-50"
                    onClick={() =>
                      selectedPartner &&
                      openDetail(
                        selectedPartner,
                        'ledger',
                        {
                          ledgerPage: Math.max(detail.ledger_pagination.page - 1, 1),
                        },
                      )
                    }
                    disabled={detail.ledger_pagination.page <= 1 || detailLoading}
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 disabled:opacity-50"
                    onClick={() =>
                      selectedPartner &&
                      openDetail(
                        selectedPartner,
                        'ledger',
                        {
                          ledgerPage: Math.min(
                            detail.ledger_pagination.page + 1,
                            detail.ledger_pagination.total_pages,
                          ),
                        },
                      )
                    }
                    disabled={
                      detail.ledger_pagination.page >= detail.ledger_pagination.total_pages || detailLoading
                    }
                  >
                    下一页
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
