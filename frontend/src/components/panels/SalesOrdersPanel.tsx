import { FormEvent, Fragment, useEffect, useMemo, useState } from 'react';
import type { SalesOrderResponse } from '../../hooks/useSalesOrders';
import type { PartnerResponse } from '../../hooks/usePartners';
import type { ProductResponse } from '../../hooks/useProducts';
import { useCustomerPreferredProducts } from '../../hooks/useCustomerPreferredProducts';
import { api } from '../../api/client';
import Pagination from '../common/Pagination';
import StatusBadge from '../common/StatusBadge';

interface Props {
  orders: SalesOrderResponse[];
  partners: PartnerResponse[];
  products: ProductResponse[];
  loading: boolean;
  error: string | null;
  onRefresh(): Promise<void> | void;
  isManager: boolean;
  canCreateEvents: boolean;
}

interface SalesItemDraft {
  id: number | null;
  category: string;
  product: string;
  customName: string;
  detailDescription: string;
  price: string;
  quantity: string;
  shippedQuantity: number;
}

type SalesItemEditableField = 'category' | 'product' | 'customName' | 'detailDescription' | 'price' | 'quantity';

function createEmptyItemDraft(): SalesItemDraft {
  return {
    id: null,
    category: '',
    product: '',
    customName: '',
    detailDescription: '',
    price: '',
    quantity: '',
    shippedQuantity: 0,
  };
}

type SalesStatus = (typeof STATUS_OPTIONS)[number]['value'];

const CUSTOMER_TYPES = new Set(['CUSTOMER', 'BOTH']);
const STATUS_OPTIONS = [
  { value: 'ORDERED', label: '已下单' },
  { value: 'PRODUCING', label: '生产中' },
  { value: 'SHIPPED', label: '已发货' },
  { value: 'COMPLETED', label: '已完成' },
] as const;
const EVENT_TYPES = [
  { value: 'SHIPPING', label: '发货记录' },
  { value: 'RETURN', label: '退货/异常' },
  { value: 'REMARK', label: '普通备注' },
] as const;

export default function SalesOrdersPanel({
  orders,
  partners,
  products,
  loading,
  error,
  onRefresh,
  isManager,
  canCreateEvents,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<SalesStatus | ''>('');
  const [customerInput, setCustomerInput] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [customerField, setCustomerField] = useState('');
  const [statusField, setStatusField] = useState<SalesStatus>('ORDERED');
  const [itemDrafts, setItemDrafts] = useState<SalesItemDraft[]>([createEmptyItemDraft()]);
  const [originalItemDrafts, setOriginalItemDrafts] = useState<SalesItemDraft[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [eventModalOrderId, setEventModalOrderId] = useState<number | null>(null);
  const [eventType, setEventType] = useState<typeof EVENT_TYPES[number]['value']>('REMARK');
  const [eventContent, setEventContent] = useState('');
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  const customerOptions = partners.filter((partner) => CUSTOMER_TYPES.has(partner.partner_type));

  const customerSuggestions = useMemo(
    () => buildPartnerSuggestions(customerOptions, customerInput),
    [customerOptions, customerInput],
  );
  const modalCustomerSuggestions = useMemo(
    () => buildPartnerSuggestions(customerOptions, customerField),
    [customerOptions, customerField],
  );
  const modalCustomerId = useMemo(
    () => resolvePartnerId(customerField, customerOptions),
    [customerField, customerOptions],
  );
  const {
    data: preferredModels,
    reload: reloadPreferredModels,
  } = useCustomerPreferredProducts(modalCustomerId, Boolean(modalMode && modalCustomerId));
  const preferredModelNames = useMemo(() => new Set(preferredModels.map((item) => item.name)), [preferredModels]);
  const preferredModelOptions = useMemo(() => preferredModels.map((item) => item.name), [preferredModels]);

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

  const removedItemsWithShipping = useMemo(() => {
    if (!originalItemDrafts) {
      return [] as SalesItemDraft[];
    }
    const currentIds = new Set(itemDrafts.map((item) => item.id).filter((id): id is number => id != null));
    return originalItemDrafts.filter((item) => item.id != null && item.shippedQuantity > 0 && !currentIds.has(item.id));
  }, [itemDrafts, originalItemDrafts]);
  const showShippingWarning = modalMode === 'edit' && removedItemsWithShipping.length > 0;

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter && order.status !== statusFilter) {
        return false;
      }
      if (selectedCustomerId && order.partner !== selectedCustomerId) {
        return false;
      }
      return true;
    });
  }, [orders, statusFilter, selectedCustomerId]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, selectedCustomerId, orders]);

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
  const showActions = isManager || canCreateEvents;

  const openCreateModal = () => {
    setModalMode('create');
    setDraftId(null);
    setCustomerField('');
    setStatusField('ORDERED');
    setItemDrafts([createEmptyItemDraft()]);
    setOriginalItemDrafts(null);
    setFormError(null);
  };

  const openEditModal = (order: SalesOrderResponse) => {
    setModalMode('edit');
    setDraftId(order.id);
    setCustomerField(formatPartner(order.partner_name, order.partner));
    setStatusField((order.status as SalesStatus) ?? 'ORDERED');
    const mappedItems =
      order.items.length
        ? order.items.map((item) => ({
            id: item.id,
            shippedQuantity: Number(item.shipped_quantity ?? 0),
            category:
              item.product_detail?.category_detail?.id != null
                ? String(item.product_detail.category_detail.id)
                : '',
            product: item.product ? String(item.product) : '',
            customName: item.custom_product_name,
            detailDescription: item.detail_description ?? '',
            price: String(item.price ?? ''),
            quantity: String(item.quantity ?? ''),
          }))
        : [createEmptyItemDraft()];
    setItemDrafts(mappedItems);
    setOriginalItemDrafts(mappedItems.map((item) => ({ ...item })));
    setFormError(null);
  };

  const handleDelete = async (orderId: number) => {
    if (!window.confirm('确认删除该销售订单？')) {
      return;
    }
    try {
      await api.deleteSalesOrder(orderId);
      await Promise.resolve(onRefresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handlePartnerFilterChange = (value: string) => {
    setCustomerInput(value);
    const resolved = resolvePartnerId(value, customerOptions);
    setSelectedCustomerId(resolved);
  };

  const handleCustomerFieldChange = (value: string) => {
    setCustomerField(value);
  };

  const handleItemChange = (index: number, field: SalesItemEditableField, value: string) => {
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
    setItemDrafts((prev) => [...prev, createEmptyItemDraft()]);
  };

  const removeItemRow = (index: number) => {
    setItemDrafts((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const ensurePreferredModels = async (partnerId: number, names: string[]) => {
    if (!partnerId) {
      return;
    }
    const normalized = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
    const missing = normalized.filter((name) => !preferredModelNames.has(name));
    if (!missing.length) {
      return;
    }
    try {
      await Promise.all(
        missing.map((name) =>
          api.createCustomerPreferredProduct({
            partner: partnerId,
            name,
          }),
        ),
      );
      reloadPreferredModels();
    } catch (err) {
      console.error('Failed to sync preferred models', err);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const customerId = resolvePartnerId(customerField, customerOptions);
    if (!customerId) {
      setFormError('请输入有效的客户（可输入名称或 ID）');
      return;
    }
    const itemsPayload = itemDrafts
      .map((item) => {
        const payload: {
          id?: number;
          product: number | null;
          custom_product_name: string;
          detail_description: string;
          price: number;
          quantity: number;
        } = {
          product: item.product ? Number(item.product) : null,
          custom_product_name: item.customName || '未命名产品',
          detail_description: item.detailDescription,
          price: Number(item.price),
          quantity: Number(item.quantity),
        };
        if (item.id != null) {
          payload.id = item.id;
        }
        return payload;
      })
      .filter((item) => item.quantity && item.price);
    if (!itemsPayload.length) {
      setFormError('请至少添加一条明细');
      return;
    }
    if (modalMode === 'edit' && removedItemsWithShipping.length) {
      const confirmed = window.confirm('删除包含发货记录的明细会同时删除相关发货记录，确认继续？');
      if (!confirmed) {
        return;
      }
    }
    try {
      setFormSaving(true);
      setFormError(null);
      if (modalMode === 'create') {
        await api.createSalesOrder({
          partner: customerId,
          items_payload: itemsPayload,
        });
      } else if (modalMode === 'edit' && draftId) {
        await api.updateSalesOrder(draftId, {
          partner: customerId,
          status: statusField,
          items_payload: itemsPayload,
        });
      }
      await ensurePreferredModels(
        customerId,
        itemsPayload.map((item) => item.custom_product_name),
      );
      setModalMode(null);
      await Promise.resolve(onRefresh());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setFormSaving(false);
    }
  };

  const columnCount = showActions ? 7 : 6;

  return (
    <div className="mt-8 space-y-6">
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">销售订单</h2>
          <p className="text-sm text-slate-500">根据客户、状态筛选销售计划与发货进度</p>
        </div>
        {isManager && (
          <button
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={openCreateModal}
          >
            新建销售单
          </button>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-semibold text-slate-500">客户</label>
            <input
              list="sales-customers"
              className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm"
              value={customerInput}
              onChange={(event) => handlePartnerFilterChange(event.target.value)}
              placeholder="输入名称或 #ID"
            />
            <datalist id="sales-customers">
              {customerSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500">状态</label>
            <select
              className="mt-1 rounded-full border border-slate-200 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as SalesStatus | '')}
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
              setCustomerInput('');
              setSelectedCustomerId(null);
              setStatusFilter('');
            }}
          >
            重置筛选
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-900">销售单列表</h3>
          {loading && <span className="text-sm text-slate-500">加载中…</span>}
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-3">客户</th>
                <th className="px-4 py-3">销售单号</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">明细</th>
                <th className="px-4 py-3 text-right">总金额</th>
                <th className="px-4 py-3">创建日期</th>
                {showActions && <th className="px-4 py-3">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {pagedOrders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                return (
                  <Fragment key={order.id}>
                    <tr
                      className={`cursor-pointer transition-colors ${
                        isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50'
                      }`}
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                    >
                    <td className="px-4 py-3">{order.partner_name || `客户#${order.partner}`}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.order_no}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        kind="sales"
                        status={order.status}
                        label={STATUS_OPTIONS.find((option) => option.value === order.status)?.label || order.status}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        {order.items.length ? (
                          order.items.map((item) => (
                            <div key={item.id} className="rounded-xl bg-slate-50 p-2 text-xs text-slate-600">
                              <div className="font-semibold text-slate-700">
                                {item.custom_product_name} × {item.quantity}
                              </div>
                              {item.detail_description && (
                                <p className="mt-1 whitespace-pre-line text-slate-500">
                                  {item.detail_description}
                                </p>
                              )}
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">暂无明细</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">¥ {formatMoney(order.total_amount)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(order.created_at)}</td>
                    {showActions && (
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex gap-2 text-xs font-semibold">
                          {canCreateEvents && (
                            <button
                              className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEventModalOrderId(order.id);
                                setEventType('REMARK');
                                setEventContent('');
                                setEventError(null);
                              }}
                            >
                              记录事件
                            </button>
                          )}
                          {isManager && (
                            <>
                              <button
                                className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditModal(order);
                                }}
                              >
                                编辑
                              </button>
                              <button
                                className="rounded-full border border-rose-200 px-3 py-1 text-rose-600 hover:bg-rose-50"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDelete(order.id);
                                }}
                              >
                                删除
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-50">
                      <td colSpan={showActions ? 7 : 6} className="p-4">
                        <h4 className="text-sm font-semibold text-slate-700">订单事件</h4>
                        <div className="mt-2 space-y-2">
                          {order.events?.length ? (
                            order.events.map((event) => (
                              <div key={event.id} className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                                <div className="flex flex-wrap items-center justify-between text-slate-500">
                                  <span>{EVENT_TYPES.find((type) => type.value === event.event_type)?.label || event.event_type}</span>
                                  <span>{formatDate(event.created_at)}</span>
                                </div>
                                <p className="mt-1 whitespace-pre-line">{event.content}</p>
                                {event.operator && <p className="mt-1 text-slate-500">记录人：{event.operator}</p>}
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-500">暂无事件记录。</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
              {!filteredOrders.length && (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-4 text-center text-sm text-slate-500">
                    暂无销售订单。
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
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">{modalMode === 'create' ? '新建销售单' : '编辑销售单'}</h3>
              <button
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
                onClick={() => setModalMode(null)}
              >
                关闭
              </button>
            </div>
            {formError && <p className="mt-2 text-sm text-rose-600">{formError}</p>}
            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              {modalMode === 'edit' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-600">
                    <span className="block">销售单号</span>
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
                      onChange={(event) => setStatusField(event.target.value as SalesStatus)}
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
                <span className="block">客户</span>
                <input
                  list="sales-modal-customers"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={customerField}
                  onChange={(event) => handleCustomerFieldChange(event.target.value)}
                  placeholder="输入名称或 ID"
                  required
                />
                <datalist id="sales-modal-customers">
                  {modalCustomerSuggestions.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </label>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-slate-900">销售明细</h4>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
                    onClick={addItemRow}
                  >
                    添加明细
                  </button>
                </div>
                {showShippingWarning && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    提醒：已发货的明细被删除后，其关联发货记录也会被删除，请谨慎操作。
                  </div>
                )}
                <datalist id="sales-preferred-models">
                  {preferredModelOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                {itemDrafts.map((item, index) => (
                  <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-4">
                    <label className="text-sm text-slate-600">
                      <span className="block">分类</span>
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        value={item.category}
                        onChange={(event) => handleItemChange(index, 'category', event.target.value)}
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
                      <span className="block">物料（可选）</span>
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        value={item.product}
                        onChange={(event) => handleItemChange(index, 'product', event.target.value)}
                      >
                        <option value="">
                          请选择物料
                        </option>
                        {(item.category ? productOptionsByCategory.get(item.category) : undefined)?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-slate-600 md:col-span-2">
                      <span className="block">客户产品名</span>
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        value={item.customName}
                        onChange={(event) => handleItemChange(index, 'customName', event.target.value)}
                        placeholder="客户侧展示名称"
                        list="sales-preferred-models"
                        required
                      />
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
                    <label className="text-sm text-slate-600 md:col-span-4">
                      <span className="block">细节描述</span>
                      <textarea
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        rows={2}
                        value={item.detailDescription}
                        onChange={(event) => handleItemChange(index, 'detailDescription', event.target.value)}
                        placeholder="记录线长、定标、重量等信息"
                      />
                    </label>
                    {itemDrafts.length > 1 && (
                      <div className="flex items-end justify-end md:col-span-4">
                        <button
                          type="button"
                          className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
                          onClick={() => removeItemRow(index)}
                        >
                          删除明细
                        </button>
                      </div>
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
                  {formSaving ? '保存中…' : modalMode === 'create' ? '创建销售单' : '保存销售单'}
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
                <h3 className="text-xl font-semibold text-slate-900">订单事件</h3>
                <p className="text-xs text-slate-500">销售单 {eventOrder.order_no}</p>
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
                  await api.createSalesOrderEvent(eventModalOrderId, {
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
                  onChange={(event) => setEventType(event.target.value as typeof EVENT_TYPES[number]['value'])}
                >
                  {EVENT_TYPES.map((option) => (
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

function buildPartnerSuggestions(partners: PartnerResponse[], keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  return partners
    .filter((partner) => {
      if (!normalized) return true;
      return partner.name.toLowerCase().includes(normalized) || String(partner.id).includes(normalized);
    })
    .slice(0, 50)
    .map((partner) => formatPartner(partner.name, partner.id));
}

function resolvePartnerId(value: string, partners: PartnerResponse[]) {
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

function formatPartner(name?: string, id?: number) {
  if (!name && !id) {
    return '';
  }
  if (name) {
    return `${name}${id ? ` (#${id})` : ''}`;
  }
  return id ? `#${id}` : '';
}

function formatMoney(value?: number | string | null) {
  if (value == null) {
    return '0.00';
  }
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0.00';
  }
  return amount.toFixed(2);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
}
