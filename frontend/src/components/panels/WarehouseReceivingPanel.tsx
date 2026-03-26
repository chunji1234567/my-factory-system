import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { PurchaseOrderResponse } from '../../hooks/usePurchaseOrders';
import type { PartnerResponse } from '../../hooks/usePartners';
import { api } from '../../api/client';
import Pagination from '../common/Pagination';
import StatusBadge from '../common/StatusBadge';

interface Props {
  orders: PurchaseOrderResponse[];
  partners: PartnerResponse[];
  loading: boolean;
  error: string | null;
  onRefresh(): Promise<void> | void;
}

interface ReceivingDraft {
  purchaseItemId: number | null;
  quantity: string;
  remark: string;
}

const SUPPLIER_TYPES = new Set(['SUPPLIER', 'BOTH']);

export default function WarehouseReceivingPanel({ orders, partners, loading, error, onRefresh }: Props) {
  const [supplierFilter, setSupplierFilter] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [modalOrderId, setModalOrderId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ReceivingDraft>({ purchaseItemId: null, quantity: '', remark: '' });
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const supplierOptions = partners.filter((partner) => SUPPLIER_TYPES.has(partner.partner_type));

  const supplierSuggestions = useMemo(() => buildSupplierSuggestions(supplierOptions, supplierFilter), [supplierOptions, supplierFilter]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (selectedSupplierId && order.partner !== selectedSupplierId) {
        return false;
      }
      return true;
    });
  }, [orders, selectedSupplierId]);

  useEffect(() => {
    setPage(1);
  }, [selectedSupplierId, orders]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [filteredOrders.length, page, pageSize]);

  const pagedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, page, pageSize]);

  const currentOrder = modalOrderId ? orders.find((order) => order.id === modalOrderId) : null;

  const currentItems = currentOrder?.items ?? [];

  const remainingQuantity = (itemId: number) => {
    const item = currentItems.find((entry) => entry.id === itemId);
    if (!item) return 0;
    const received = Number((item as any).received_quantity ?? 0);
    return Number(item.quantity) - received;
  };

  const openModal = (orderId: number, itemId: number) => {
    setModalOrderId(orderId);
    setDraft({ purchaseItemId: itemId, quantity: '', remark: '' });
    setModalError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.purchaseItemId) {
      setModalError('请选择采购明细');
      return;
    }
    const qty = Number(draft.quantity);
    if (!qty || qty <= 0) {
      setModalError('请输入有效的收货数量');
      return;
    }
    const remaining = remainingQuantity(draft.purchaseItemId);
    if (remaining && qty > remaining) {
      setModalError(`本次收货不得超过剩余数量 ${remaining}`);
      return;
    }
    try {
      setSaving(true);
      setModalError(null);
      await api.createReceivingLog({
        purchase_item: draft.purchaseItemId,
        quantity_received: qty,
        remark: draft.remark || undefined,
      });
      setModalOrderId(null);
      await Promise.resolve(onRefresh());
    } catch (err) {
      setModalError(err instanceof Error ? err.message : '收货失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-8 space-y-6">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-semibold text-slate-500">供应商</label>
            <input
              list="warehouse-suppliers"
              className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm"
              value={supplierFilter}
              onChange={(event) => {
                const value = event.target.value;
                setSupplierFilter(value);
                const resolved = resolveSupplierId(value, supplierOptions);
                setSelectedSupplierId(resolved);
              }}
              placeholder="输入名称或 #ID"
            />
            <datalist id="warehouse-suppliers">
              {supplierSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
            onClick={() => {
              setSupplierFilter('');
              setSelectedSupplierId(null);
            }}
          >
            重置过滤
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-900">待收货的采购单</h3>
          {loading && <span className="text-sm text-slate-500">加载中…</span>}
        </div>
        <div className="mt-4 space-y-4">
          {pagedOrders.map((order) => (
            <div key={order.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{order.order_no}</p>
                  <p className="text-xs text-slate-500">{order.partner_name || `供应商#${order.partner}`}</p>
                </div>
                <StatusBadge kind="purchase" status={order.status} />
              </div>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-4 py-2">物料</th>
                      <th className="px-4 py-2 text-right">需求数量</th>
                      <th className="px-4 py-2 text-right">已收</th>
                      <th className="px-4 py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {order.items.map((item) => {
                      const received = Number((item as any).received_quantity ?? 0);
                      const remaining = Number(item.quantity) - received;
                      return (
                        <tr key={item.id}>
                          <td className="px-4 py-2">{item.product_detail?.model_name || `物料#${item.product}`}</td>
                          <td className="px-4 py-2 text-right">{item.quantity}</td>
                          <td className="px-4 py-2 text-right">{received}</td>
                          <td className="px-4 py-2">
                            <button
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
                              disabled={remaining <= 0}
                              onClick={() => openModal(order.id, item.id)}
                            >
                              确认收货
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {!filteredOrders.length && (
            <p className="text-center text-sm text-slate-500">暂无采购单。</p>
          )}
        </div>
        <div className="mt-4">
          <Pagination page={page} pageSize={pageSize} total={filteredOrders.length} onPageChange={setPage} />
        </div>
      </section>

      {modalOrderId && currentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">确认收货</h3>
                <p className="text-xs text-slate-500">采购单 {currentOrder.order_no}</p>
              </div>
              <button
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
                onClick={() => setModalOrderId(null)}
              >
                关闭
              </button>
            </div>
            {modalError && <p className="mt-2 text-sm text-rose-600">{modalError}</p>}
            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <label className="text-sm text-slate-600">
                <span className="block">采购明细</span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={draft.purchaseItemId ?? ''}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, purchaseItemId: Number(event.target.value) || null }))
                  }
                  required
                >
                  <option value="" disabled>
                    请选择明细
                  </option>
                  {currentOrder.items.map((item) => {
                    const received = Number((item as any).received_quantity ?? 0);
                    const remaining = Number(item.quantity) - received;
                    return (
                      <option key={item.id} value={item.id} disabled={remaining <= 0}>
                        {item.product_detail?.model_name || `物料#${item.product}`} · 剩余 {Math.max(remaining, 0)}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                <span className="block">本次收货数量</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  step="0.01"
                  value={draft.quantity}
                  onChange={(event) => setDraft((prev) => ({ ...prev, quantity: event.target.value }))}
                  required
                />
              </label>
              <label className="text-sm text-slate-600">
                <span className="block">备注（可选）</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={draft.remark}
                  onChange={(event) => setDraft((prev) => ({ ...prev, remark: event.target.value }))}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  onClick={() => setModalOrderId(null)}
                >
                  取消
                </button>
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? '提交中…' : '记录收货'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function buildSupplierSuggestions(partners: PartnerResponse[], keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  return partners
    .filter((partner) => {
      if (!normalized) return true;
      return partner.name.toLowerCase().includes(normalized) || String(partner.id).includes(normalized);
    })
    .slice(0, 50)
    .map((partner) => `${partner.name} (#${partner.id})`);
}

function resolveSupplierId(value: string, partners: PartnerResponse[]) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    return partners.find((partner) => partner.id === id) ? id : null;
  }
  const match = trimmed.match(/#(\d+)/);
  if (match) {
    const id = Number(match[1]);
    return partners.find((partner) => partner.id === id) ? id : null;
  }
  const exactMatches = partners.filter((partner) => partner.name.toLowerCase() === trimmed.toLowerCase());
  if (exactMatches.length === 1) {
    return exactMatches[0].id;
  }
  return null;
}
