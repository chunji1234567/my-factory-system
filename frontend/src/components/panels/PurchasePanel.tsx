import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { PurchaseOrderResponse } from '../../hooks/usePurchaseOrders';
import type { ProductResponse } from '../../hooks/useProducts';
import type { PartnerResponse } from '../../hooks/usePartners';
import { api } from '../../api/client';
import Pagination from '../common/Pagination';
import StatusBadge from '../common/StatusBadge';

interface Props {
  orders: PurchaseOrderResponse[];
  loading: boolean;
  error: string | null;
  onRefresh(): Promise<void> | void;
  products: ProductResponse[];
  partners: PartnerResponse[];
  isManager: boolean;
  canCreateEvents: boolean;
}

interface PurchaseItemDraft {
  id: number | null;
  category: string;
  product: string;
  price: string;
  quantity: string;
  receivedQuantity: number;
}

type PurchaseItemEditableField = 'category' | 'product' | 'price' | 'quantity';

function createEmptyPurchaseItemDraft(): PurchaseItemDraft {
  return { id: null, category: '', product: '', price: '', quantity: '', receivedQuantity: 0 };
}

const STATUS_OPTIONS = [
  { value: 'ORDERED', label: '已下单' },
  { value: 'PARTIAL', label: '部分入库' },
  { value: 'RECEIVED', label: '全部入库' },
];

const SUPPLIER_TYPES = new Set(['SUPPLIER', 'BOTH']);
const PURCHASE_EVENT_TYPES = [
  { value: 'RECEIVING', label: '收货记录' },
  { value: 'RETURN', label: '退货/异常' },
  { value: 'REMARK', label: '普通备注' },
];

export default function PurchasePanel({
  orders,
  loading,
  error,
  onRefresh,
  products,
  partners,
  isManager,
  canCreateEvents,
}: Props) {
  const [filterStatus, setFilterStatus] = useState('');
  const [supplierInput, setSupplierInput] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [supplierField, setSupplierField] = useState('');
  const [statusField, setStatusField] = useState<'ORDERED' | 'PARTIAL' | 'RECEIVED'>('ORDERED');
  const [itemDrafts, setItemDrafts] = useState<PurchaseItemDraft[]>([createEmptyPurchaseItemDraft()]);
  const [originalItemDrafts, setOriginalItemDrafts] = useState<PurchaseItemDraft[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [eventModalOrderId, setEventModalOrderId] = useState<number | null>(null);
  const [eventType, setEventType] = useState(PURCHASE_EVENT_TYPES[0].value);
  const [eventContent, setEventContent] = useState('');
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const supplierOptions = partners.filter((partner) => SUPPLIER_TYPES.has(partner.partner_type));

  const supplierSuggestions = useMemo(() => buildSupplierSuggestions(supplierOptions, supplierInput), [supplierOptions, supplierInput]);
  const modalSupplierSuggestions = useMemo(
    () => buildSupplierSuggestions(supplierOptions, supplierField),
    [supplierOptions, supplierField],
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filterStatus && order.status !== filterStatus) {
        return false;
      }
      if (selectedSupplierId && order.partner !== selectedSupplierId) {
        return false;
      }
      return true;
    });
  }, [orders, filterStatus, selectedSupplierId]);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, selectedSupplierId, orders]);

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
  const eventOrder = eventModalOrderId ? orders.find((order) => order.id === eventModalOrderId) : null;

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((product) => {
      const detail = product.category_detail;
      if (detail && detail.id != null) {
        map.set(String(detail.id), detail.name);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [products]);

  const productOptionsByCategory = useMemo(() => {
    const grouped = new Map<string, { value: string; label: string }[]>();
    products.forEach((product) => {
      const categoryId = product.category_detail?.id != null ? String(product.category_detail.id) : '';
      if (!grouped.has(categoryId)) {
        grouped.set(categoryId, []);
      }
      grouped.get(categoryId)?.push({
        value: String(product.id),
        label: `${product.model_name} (${product.internal_code})`,
      });
    });
    return grouped;
  }, [products]);

  const removedItemsWithReceipts = useMemo(() => {
    if (!originalItemDrafts) {
      return [] as PurchaseItemDraft[];
    }
    const currentIds = new Set(itemDrafts.map((item) => item.id).filter((id): id is number => id != null));
    return originalItemDrafts.filter((item) => item.id != null && item.receivedQuantity > 0 && !currentIds.has(item.id));
  }, [itemDrafts, originalItemDrafts]);
  const showReceivingWarning = modalMode === 'edit' && removedItemsWithReceipts.length > 0;

  const openCreateModal = () => {
    setModalMode('create');
    setDraftId(null);
    setSupplierField('');
    setStatusField('ORDERED');
    setItemDrafts([createEmptyPurchaseItemDraft()]);
    setOriginalItemDrafts(null);
    setFormError(null);
  };

  const openEditModal = (order: PurchaseOrderResponse) => {
    setModalMode('edit');
    setDraftId(order.id);
    setSupplierField(formatSupplier(order.partner_name, order.partner));
    setStatusField((order.status as any) ?? 'ORDERED');
    const mappedItems =
      order.items.length
        ? order.items.map((item) => ({
            id: item.id,
            receivedQuantity: Number(item.received_quantity ?? 0),
            category: item.product_detail?.category_detail?.id ? String(item.product_detail.category_detail.id) : '',
            product: item.product ? String(item.product) : '',
            price: String(item.price ?? ''),
            quantity: String(item.quantity ?? ''),
          }))
        : [createEmptyPurchaseItemDraft()];
    setItemDrafts(mappedItems);
    setOriginalItemDrafts(mappedItems.map((item) => ({ ...item })));
    setFormError(null);
  };

  const handleDelete = async (orderId: number) => {
    if (!window.confirm('确认删除该采购订单？')) {
      return;
    }
    try {
      await api.deletePurchaseOrder(orderId);
      await Promise.resolve(onRefresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSupplierFilterChange = (value: string) => {
    setSupplierInput(value);
    const resolved = resolveSupplierId(value, supplierOptions);
    setSelectedSupplierId(resolved);
  };

  const handleSupplierFieldChange = (value: string) => {
    setSupplierField(value);
  };

  const handleFormSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const supplierId = resolveSupplierId(supplierField, supplierOptions);
    if (!supplierId) {
      setFormError('请选择有效的供应商（可输入名称或 ID）');
      return;
    }
    const normalizedItems = itemDrafts
      .map((item) => {
        const payload: { id?: number; product: number; price: number; quantity: number } = {
          product: Number(item.product),
          price: Number(item.price),
          quantity: Number(item.quantity),
        };
        if (item.id != null) {
          payload.id = item.id;
        }
        return payload;
      })
      .filter((item) => item.product && item.price && item.quantity);
    if (!normalizedItems.length) {
      setFormError('请至少添加一条采购明细');
      return;
    }
    if (modalMode === 'edit' && removedItemsWithReceipts.length) {
      const confirmed = window.confirm('删除包含入库记录的明细会同时删除相关入库记录，确认继续？');
      if (!confirmed) {
        return;
      }
    }
    try {
      setFormSaving(true);
      setFormError(null);
      if (modalMode === 'create') {
        await api.createPurchaseOrder({
          order_no: '',
          partner: supplierId,
          items_payload: normalizedItems,
        });
      } else if (modalMode === 'edit' && draftId) {
        await api.updatePurchaseOrder(draftId, {
          partner: supplierId,
          status: statusField,
          items_payload: normalizedItems,
        });
      }
      setModalMode(null);
      await Promise.resolve(onRefresh());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setFormSaving(false);
    }
  };

  const handleItemChange = (index: number, field: PurchaseItemEditableField, value: string) => {
    setItemDrafts((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      if (field === 'category') {
        updated.product = '';
      }
      next[index] = updated;
      return next;
    });
  };

  const addItemRow = () => {
    setItemDrafts((prev) => [...prev, createEmptyPurchaseItemDraft()]);
  };

  const removeItemRow = (index: number) => {
      setItemDrafts((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  return (
    <div className="mt-8 space-y-6">
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">采购订单</h2>
          <p className="text-sm text-slate-500">查看供应商采购计划与入库状态</p>
        </div>
        {isManager && (
          <button
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={openCreateModal}
          >
            新建采购单
          </button>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-semibold text-slate-500">供应商</label>
            <input
              list="purchase-suppliers"
              className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm"
              value={supplierInput}
              onChange={(event) => handleSupplierFilterChange(event.target.value)}
              placeholder="输入名称或 #ID"
            />
            <datalist id="purchase-suppliers">
              {supplierSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500">状态</label>
            <select
              className="mt-1 rounded-full border border-slate-200 px-3 py-2 text-sm"
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
            >
              <option value="">全部状态</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
            onClick={() => {
              setSupplierInput('');
              setSelectedSupplierId(null);
              setFilterStatus('');
            }}
          >
            重置筛选
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-900">采购单列表</h3>
          {loading && <span className="text-sm text-slate-500">加载中…</span>}
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-3">供应商</th>
                <th className="px-4 py-3">采购单号</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3 text-right">金额</th>
                <th className="px-4 py-3">创建时间</th>
                {(isManager || canCreateEvents) && <th className="px-4 py-3">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {pagedOrders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3">{order.partner_name || `供应商#${order.partner}`}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.order_no}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      kind="purchase"
                      status={order.status}
                      label={STATUS_OPTIONS.find((option) => option.value === order.status)?.label || order.status}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">¥ {Number(order.total_amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{new Date(order.created_at).toLocaleString()}</td>
                  {(isManager || canCreateEvents) && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2 text-xs font-semibold">
                        {canCreateEvents && (
                          <button
                            className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50"
                            onClick={() => {
                              setEventModalOrderId(order.id);
                              setEventType(PURCHASE_EVENT_TYPES[0].value);
                              setEventContent('');
                              setEventError(null);
                            }}
                          >
                            记录事件
                          </button>
                        )}
                        <button
                          className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50"
                          onClick={() => openEditModal(order)}
                        >
                          编辑
                        </button>
                        <button
                          className="rounded-full border border-rose-200 px-3 py-1 text-rose-600 hover:bg-rose-50"
                          onClick={() => handleDelete(order.id)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!filteredOrders.length && (
                <tr>
                  <td colSpan={isManager || canCreateEvents ? 6 : 5} className="px-4 py-4 text-center text-sm text-slate-500">
                    暂无采购订单。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <Pagination page={page} pageSize={pageSize} total={filteredOrders.length} onPageChange={setPage} />
        </div>
      </section>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">{modalMode === 'create' ? '新建采购单' : '编辑采购单'}</h3>
              <button
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
                onClick={() => setModalMode(null)}
              >
                关闭
              </button>
            </div>
            {formError && <p className="mt-2 text-sm text-rose-600">{formError}</p>}
            <form className="mt-4 space-y-4" onSubmit={handleFormSubmit}>
              {modalMode === 'edit' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-600">
                    <span className="block">采购单号</span>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={draftId ? orders.find((o) => o.id === draftId)?.order_no ?? '' : ''}
                      disabled
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    <span className="block">状态</span>
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={statusField}
                      onChange={(event) => setStatusField(event.target.value as any)}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <label className="text-sm text-slate-600">
                <span className="block">供应商</span>
                <input
                  list="purchase-modal-suppliers"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={supplierField}
                  onChange={(event) => handleSupplierFieldChange(event.target.value)}
                  placeholder="输入名称或 ID"
                  required
                />
                <datalist id="purchase-modal-suppliers">
                  {modalSupplierSuggestions.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </label>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-slate-900">采购明细</h4>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
                    onClick={addItemRow}
                  >
                    添加明细
                  </button>
                </div>
                {showReceivingWarning && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    提醒：已入库的明细被删除后，其关联入库记录也会被删除，请谨慎操作。
                  </div>
                )}
                {itemDrafts.map((item, index) => (
                  <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-4">
                    <label className="text-sm text-slate-600">
                      <span className="block">分类</span>
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        value={item.category}
                        onChange={(event) =>
                          handleItemChange(index, 'category', event.target.value)
                        }
                        required
                      >
                        <option value="" disabled>
                          请选择分类
                        </option>
                        {categoryOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-slate-600">
                      <span className="block">物料</span>
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        value={item.product}
                        onChange={(event) => handleItemChange(index, 'product', event.target.value)}
                        required
                      >
                        <option value="" disabled>
                          请选择物料
                        </option>
                        {(item.category ? productOptionsByCategory.get(item.category) : undefined)?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-slate-600">
                      <span className="block">单价</span>
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        value={item.price}
                        onChange={(event) => handleItemChange(index, 'price', event.target.value)}
                        required
                      />
                    </label>
                    <label className="text-sm text-slate-600">
                      <span className="block">数量</span>
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        value={item.quantity}
                        onChange={(event) => handleItemChange(index, 'quantity', event.target.value)}
                        required
                      />
                    </label>
                    {itemDrafts.length > 1 && (
                      <button
                        type="button"
                        className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
                        onClick={() => removeItemRow(index)}
                      >
                        删除明细
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  onClick={() => setModalMode(null)}
                >
                  取消
                </button>
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={formSaving}
                >
                  {formSaving ? '保存中…' : '保存采购单'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {eventModalOrderId && eventOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">采购单事件</h3>
                <p className="text-xs text-slate-500">采购单 {eventOrder.order_no}</p>
              </div>
              <button
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
                onClick={() => setEventModalOrderId(null)}
              >
                关闭
              </button>
            </div>
            {eventError && <p className="mt-2 text-sm text-rose-600">{eventError}</p>}
            <form
              className="mt-4 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!eventModalOrderId) return;
                if (!eventContent.trim()) {
                  setEventError('请输入事件描述');
                  return;
                }
                try {
                  setEventSaving(true);
                  setEventError(null);
                  await api.createPurchaseOrderEvent(eventModalOrderId, {
                    event_type: eventType,
                    content: eventContent.trim(),
                  });
                  setEventModalOrderId(null);
                } catch (err) {
                  setEventError(err instanceof Error ? err.message : '记录失败');
                } finally {
                  setEventSaving(false);
                }
              }}
            >
              <label className="text-sm text-slate-600">
                <span className="block">事件类型</span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={eventType}
                  onChange={(event) => setEventType(event.target.value)}
                >
                  {PURCHASE_EVENT_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                <span className="block">事件描述</span>
                <textarea
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  rows={4}
                  value={eventContent}
                  onChange={(event) => setEventContent(event.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  onClick={() => setEventModalOrderId(null)}
                >
                  取消
                </button>
                <button
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={eventSaving}
                >
                  {eventSaving ? '保存中…' : '保存事件'}
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
    .map((partner) => formatSupplier(partner.name, partner.id));
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
  const normalized = trimmed.toLowerCase();
  const exactMatches = partners.filter((partner) => partner.name.toLowerCase() === normalized);
  if (exactMatches.length === 1) {
    return exactMatches[0].id;
  }
  return null;
}

function formatSupplier(name?: string, id?: number) {
  if (!name && !id) {
    return '';
  }
  if (name) {
    return `${name}${id ? ` (#${id})` : ''}`;
  }
  return id ? `#${id}` : '';
}

function generateOrderNo() {
  const now = new Date();
  const year = now.getFullYear();
  const random = Math.floor(Math.random() * 900) + 100;
  return `PO-${year}-${random}`;
}
