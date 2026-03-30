import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { SalesOrderResponse } from '../../hooks/useSalesOrders';
import { useShippingLogs, ShippingLogResponse } from '../../hooks/useShippingLogs';
import { api } from '../../api/client';
import Pagination from '../common/Pagination';
import StatusBadge from '../common/StatusBadge';

const STATUS_OPTIONS = [
  { value: 'ORDERED', label: '已下单' },
  { value: 'PRODUCING', label: '生产中' },
  { value: 'SHIPPED', label: '发货中' },
  { value: 'COMPLETED', label: '已完成' },
];
const EVENT_TYPE_LABELS: Record<string, string> = {
  SHIPPING: '发货记录',
  RETURN: '退货/异常',
  REMARK: '普通备注',
};

interface Props {
  orders: SalesOrderResponse[];
  ordersLoading: boolean;
  ordersError: string | null;
  onRefreshOrders(): Promise<void> | void;
}

interface ShippingEntryDraft {
  orderId: number | '';
  itemId: number | '';
  quantity: string;
  trackingNo: string;
}

interface OrderItemOption {
  id: number;
  orderId: number;
  label: string;
  shipped: number;
  quantity: number;
  detail?: string;
}

interface CustomerOption {
  id: number;
  name: string;
}

export default function ShippingPanel({ orders, ordersLoading, ordersError, onRefreshOrders }: Props) {
  const shippingLogsQuery = useShippingLogs(true);
  const [shippingDrafts, setShippingDrafts] = useState<ShippingEntryDraft[]>([
    { orderId: '', itemId: '', quantity: '', trackingNo: '' },
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<number, string>>({});
  const [statusSaving, setStatusSaving] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [statusPage, setStatusPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [eventModalOrderId, setEventModalOrderId] = useState<number | null>(null);
  const statusPageSize = 30;
  const logPageSize = 30;

  const orderItems: OrderItemOption[] = useMemo(() => {
    return orders.flatMap((order) =>
      (order.items ?? []).map((item) => ({
        id: item.id,
        orderId: order.id,
        label: `${order.order_no} · ${item.custom_product_name}`,
        shipped: Number(item.shipped_quantity ?? 0),
        quantity: Number(item.quantity ?? 0),
        detail: item.detail_description,
      })),
    );
  }, [orders]);

  const orderOptions = useMemo(
    () =>
      orders
        .filter((order) => order.status !== 'COMPLETED')
        .map((order) => ({
          id: order.id,
          label: `${order.order_no} · ${(order.partner_name ?? `客户#${order.partner}`)}`,
        })),
    [orders],
  );

  const customerOptions = useMemo<CustomerOption[]>(() => {
    const map = new Map<number, string>();
    orders.forEach((order) => {
      if (!map.has(order.partner)) {
        map.set(order.partner, order.partner_name ?? `客户#${order.partner}`);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  const customerSuggestions = useMemo(
    () => buildCustomerSuggestions(customerOptions, customerFilter),
    [customerOptions, customerFilter],
  );

  const itemsByOrder = useMemo(() => {
    const map = new Map<number, OrderItemOption[]>();
    orders.forEach((order) => {
      map.set(
        order.id,
        (order.items ?? []).map((item) => ({
          id: item.id,
          orderId: order.id,
          label: `${item.custom_product_name}（已发${Number(item.shipped_quantity ?? 0)}/${Number(item.quantity ?? 0)}）`,
          shipped: Number(item.shipped_quantity ?? 0),
          quantity: Number(item.quantity ?? 0),
        })),
      );
    });
    return map;
  }, [orders]);

  const orderItemMap = useMemo(() => {
    const map = new Map<number, OrderItemOption>();
    orderItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [orderItems]);

  const orderById = useMemo(() => {
    const map = new Map<number, SalesOrderResponse>();
    orders.forEach((order) => map.set(order.id, order));
    return map;
  }, [orders]);

  const normalizedCustomerFilter = customerFilter.trim().toLowerCase();

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter && order.status !== statusFilter) {
        return false;
      }
      if (selectedCustomerId && order.partner !== selectedCustomerId) {
        return false;
      }
      if (!selectedCustomerId && normalizedCustomerFilter) {
        const partnerName = (order.partner_name ?? `客户#${order.partner}`).toLowerCase();
        const partnerIdStr = String(order.partner);
        if (!partnerName.includes(normalizedCustomerFilter) && !partnerIdStr.includes(normalizedCustomerFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [orders, statusFilter, selectedCustomerId, normalizedCustomerFilter]);

  useEffect(() => {
    setStatusPage(1);
  }, [statusFilter, orders, selectedCustomerId, normalizedCustomerFilter]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / statusPageSize));
    if (statusPage > totalPages) {
      setStatusPage(totalPages);
    }
  }, [filteredOrders.length, statusPage, statusPageSize]);

  const statusPagedOrders = useMemo(() => {
    const start = (statusPage - 1) * statusPageSize;
    return filteredOrders.slice(start, start + statusPageSize);
  }, [filteredOrders, statusPage, statusPageSize]);

  const getLogContext = useCallback(
    (log: ShippingLogResponse) => {
      const relatedItem = orderItemMap.get(log.sales_item);
      const relatedOrder = relatedItem ? orderById.get(relatedItem.orderId) : null;
      const partnerName =
        log.partner_name ??
        relatedOrder?.partner_name ??
        (relatedOrder ? `客户#${relatedOrder.partner}` : '-');
      const orderNo = log.order_no ?? relatedOrder?.order_no ?? '-';
      const partnerId = log.partner_id ?? relatedOrder?.partner ?? null;
      const itemLabel =
        log.sales_item_detail?.custom_product_name ??
        relatedItem?.label ??
        `明细#${log.sales_item}`;
      return { partnerName, partnerId, orderNo, itemLabel };
    },
    [orderItemMap, orderById],
  );

  const filteredLogs = useMemo(() => {
    return shippingLogsQuery.data.filter((log) => {
      const { partnerName, partnerId } = getLogContext(log);
      if (selectedCustomerId && partnerId !== selectedCustomerId) {
        return false;
      }
      if (!selectedCustomerId && normalizedCustomerFilter) {
        const matchesName = partnerName.toLowerCase().includes(normalizedCustomerFilter);
        const matchesId = partnerId ? String(partnerId).includes(normalizedCustomerFilter) : false;
        if (!matchesName && !matchesId) {
          return false;
        }
      }
      return true;
    });
  }, [shippingLogsQuery.data, selectedCustomerId, normalizedCustomerFilter, getLogContext]);

  useEffect(() => {
    setLogPage(1);
  }, [shippingLogsQuery.data, selectedCustomerId, normalizedCustomerFilter]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / logPageSize));
    if (logPage > totalPages) {
      setLogPage(totalPages);
    }
  }, [filteredLogs.length, logPage, logPageSize]);

  const logPagedData = useMemo(() => {
    const start = (logPage - 1) * logPageSize;
    return filteredLogs.slice(start, start + logPageSize);
  }, [filteredLogs, logPage, logPageSize]);

  const eventOrder = useMemo(() => {
    if (!eventModalOrderId) {
      return null;
    }
    return orders.find((order) => order.id === eventModalOrderId) ?? null;
  }, [eventModalOrderId, orders]);

  const handleShippingDraftChange = (
    index: number,
    field: keyof ShippingEntryDraft,
    value: string | number | '',
  ) => {
    setShippingDrafts((prev) => {
      const next = [...prev];
      const draft = { ...next[index] };
      if (field === 'orderId') {
        draft.orderId = value === '' ? '' : Number(value);
        draft.itemId = '';
      } else if (field === 'itemId') {
        draft.itemId = value === '' ? '' : Number(value);
      } else if (field === 'quantity') {
        draft.quantity = String(value);
      } else if (field === 'trackingNo') {
        const nextValue = String(value);
        draft.trackingNo = nextValue;
        if (index === 0 && nextValue) {
          next.forEach((entry, idx) => {
            if (idx !== 0 && !entry.trackingNo) {
              entry.trackingNo = nextValue;
            }
          });
        }
      }
      next[index] = draft;
      return next;
    });
  };

  const addShippingRow = () => {
    setShippingDrafts((prev) => {
      const sharedTracking = prev[0]?.trackingNo ?? '';
      return [...prev, { orderId: '', itemId: '', quantity: '', trackingNo: sharedTracking }];
    });
  };

  const removeShippingRow = (index: number) => {
    setShippingDrafts((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const handleCreateShippingLog = async (event: FormEvent) => {
    event.preventDefault();
    const validDrafts = shippingDrafts.filter(
      (draft) => draft.orderId && draft.itemId && Number(draft.quantity) > 0,
    );
    if (!validDrafts.length) {
      setFormError('请至少填写一条有效的发货记录');
      return;
    }
    try {
      setFormError(null);
      setSuccessMessage(null);
      await Promise.all(
        validDrafts.map((draft) =>
          api.createShippingLog({
            sales_item: Number(draft.itemId),
            quantity_shipped: Number(draft.quantity),
            tracking_no: draft.trackingNo || undefined,
          }),
        ),
      );
      setSuccessMessage(`已创建 ${validDrafts.length} 条发货记录`);
      setShippingDrafts([{ orderId: '', itemId: '', quantity: '', trackingNo: '' }]);
      await Promise.all([
        shippingLogsQuery.reload(),
        Promise.resolve(onRefreshOrders()),
      ]);
    } catch (err) {
      setSuccessMessage(null);
      setFormError(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleStatusUpdate = async (orderId: number) => {
    const nextStatus = statusDrafts[orderId];
    const current = orders.find((order) => order.id === orderId);
    if (!nextStatus || !current || nextStatus === current.status) {
      return;
    }
    try {
      setStatusSaving(orderId);
      setStatusError(null);
      setSuccessMessage(null);
      await api.updateSalesOrderStatus(orderId, nextStatus);
      setSuccessMessage('订单状态已更新');
      await Promise.all([
        shippingLogsQuery.reload(),
        Promise.resolve(onRefreshOrders()),
      ]);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : '更新失败');
    } finally {
      setStatusSaving(null);
    }
  };

  const hasOrderItems = orderItems.length > 0;

  return (
    <div className="mt-8 space-y-6">
      {ordersError && <p className="text-sm text-rose-600">{ordersError}</p>}
      {statusError && <p className="text-sm text-rose-600">{statusError}</p>}
      {formError && <p className="text-sm text-rose-600">{formError}</p>}
      {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">客户筛选</label>
            <input
              list="shipping-customers"
              className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700"
              placeholder="输入客户名称或 #ID"
              value={customerFilter}
              onChange={(event) => {
                const value = event.target.value;
                setCustomerFilter(value);
                const resolved = resolveCustomerId(value, customerOptions);
                setSelectedCustomerId(resolved);
              }}
            />
            <datalist id="shipping-customers">
              {customerSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
            onClick={() => {
              setCustomerFilter('');
              setSelectedCustomerId(null);
            }}
          >
            重置过滤
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-slate-900">销售订单状态</h3>
            <p className="text-sm text-slate-500">仅可更新状态字段，其他信息由经理维护</p>
          </div>
          {ordersLoading && <span className="text-sm text-slate-500">加载中…</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={`rounded-full px-4 py-1 text-sm font-semibold ${
              statusFilter === '' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            全部
          </button>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatusFilter(option.value)}
              className={`rounded-full px-4 py-1 text-sm font-semibold ${
                statusFilter === option.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-100 md:block">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-3">客户</th>
                <th className="px-4 py-3">订单号</th>
                <th className="px-4 py-3">销售明细</th>
                <th className="px-4 py-3">发货进度</th>
                <th className="px-4 py-3">当前状态</th>
                <th className="px-4 py-3">更新</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {statusPagedOrders.map((order) => {
                const total = order.items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
                const shipped = order.items.reduce((sum, item) => sum + Number(item.shipped_quantity ?? 0), 0);
                const draft = statusDrafts[order.id] ?? order.status;
                return (
                  <tr
                    key={order.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setEventModalOrderId(order.id)}
                  >
                    <td className="px-4 py-3">{order.partner_name ?? `客户#${order.partner}`}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.order_no}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1 text-xs text-slate-600">
                        {(order.items ?? []).map((item) => (
                          <div key={item.id} className="rounded-full bg-slate-100 px-3 py-1">
                            <span className="font-semibold">{item.custom_product_name}</span>
                            <span className="ml-2 text-slate-500">× {item.quantity}</span>
                            {item.detail_description && (
                              <span className="ml-2 text-slate-400">{item.detail_description}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{shipped}/{total}</td>
                    <td className="px-4 py-3">
                      <StatusBadge kind="shipping" status={order.status} />
                    </td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <select
                          value={draft}
                          onChange={(event) =>
                            setStatusDrafts((prev) => ({
                              ...prev,
                              [order.id]: event.target.value,
                            }))
                          }
                          className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600"
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStatusUpdate(order.id);
                          }}
                          disabled={statusSaving === order.id || draft === order.status}
                        >
                          {statusSaving === order.id ? '更新中…' : '更新状态'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-4 md:hidden">
          {statusPagedOrders.map((order) => {
            const total = order.items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
            const shipped = order.items.reduce((sum, item) => sum + Number(item.shipped_quantity ?? 0), 0);
            const draft = statusDrafts[order.id] ?? order.status;
            return (
              <article
                key={order.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                onClick={() => setEventModalOrderId(order.id)}
              >
                <div className="flex flex-col gap-1">
                  <p className="text-base font-semibold text-slate-900">
                    {order.partner_name ?? `客户#${order.partner}`}
                  </p>
                  <p className="font-mono text-xs text-slate-500">订单：{order.order_no}</p>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">发货 {shipped}/{total}</span>
                  <StatusBadge kind="shipping" status={order.status} />
                </div>
                <div className="mt-3 space-y-2 text-xs text-slate-600">
                  {(order.items ?? []).map((item) => (
                    <div key={item.id} className="rounded-xl bg-slate-50 px-3 py-1">
                      <p className="font-semibold text-slate-900">{item.custom_product_name}</p>
                      <p className="text-slate-500">数量：{item.quantity}</p>
                      {item.detail_description && (
                        <p className="text-slate-400">{item.detail_description}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-2" onClick={(event) => event.stopPropagation()}>
                  <select
                    value={draft}
                    onChange={(event) =>
                      setStatusDrafts((prev) => ({
                        ...prev,
                        [order.id]: event.target.value,
                      }))
                    }
                    onClick={(event) => event.stopPropagation()}
                    className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleStatusUpdate(order.id);
                    }}
                    disabled={statusSaving === order.id || draft === order.status}
                  >
                    {statusSaving === order.id ? '更新中…' : '更新状态'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-4">
          <Pagination page={statusPage} pageSize={statusPageSize} total={filteredOrders.length} onPageChange={setStatusPage} />
        </div>
      </section>

      {eventOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
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
            <div className="mt-4 space-y-3">
              {eventOrder.events && eventOrder.events.length ? (
                eventOrder.events.map((event) => (
                  <div key={event.id} className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
                    <div className="flex flex-wrap items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{getEventLabel(event.event_type)}</span>
                      <span>{formatDate(event.created_at)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-slate-700">{event.content}</p>
                    {event.operator && <p className="mt-2 text-xs text-slate-500">记录人：{event.operator}</p>}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">暂无事件记录。</p>
              )}
            </div>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-slate-900">记录发货</h3>
        <p className="text-sm text-slate-500">先选择订单，再选择该订单下的客户明细，可一次批量创建多条发货记录。</p>
        {!hasOrderItems && <p className="mt-2 text-sm text-slate-500">暂无可发货的销售明细。</p>}
        <form className="mt-4 space-y-4" onSubmit={handleCreateShippingLog}>
          {shippingDrafts.map((draft, index) => {
            const itemOptions = draft.orderId ? itemsByOrder.get(Number(draft.orderId)) ?? [] : [];
            return (
              <div key={index} className="grid gap-4 rounded-2xl border border-slate-200 p-4 md:grid-cols-5">
                <label className="text-sm text-slate-600">
                  <span className="block">销售订单</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={draft.orderId}
                    onChange={(event) => handleShippingDraftChange(index, 'orderId', event.target.value ? Number(event.target.value) : '')}
                    disabled={!hasOrderItems}
                    required
                  >
                    <option value="" disabled>
                      请选择订单
                    </option>
                    {orderOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  <span className="block">销售明细</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={draft.itemId}
                    onChange={(event) => handleShippingDraftChange(index, 'itemId', event.target.value ? Number(event.target.value) : '')}
                    disabled={!hasOrderItems || !draft.orderId}
                    required
                  >
                    <option value="" disabled>
                      请选择明细
                    </option>
                    {itemOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  <span className="block">发货数量</span>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={draft.quantity}
                    onChange={(event) => handleShippingDraftChange(index, 'quantity', event.target.value)}
                    disabled={!hasOrderItems}
                    required
                  />
                </label>
                <label className="text-sm text-slate-600">
                  <span className="block">物流单号</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={draft.trackingNo}
                    onChange={(event) => handleShippingDraftChange(index, 'trackingNo', event.target.value)}
                    disabled={!hasOrderItems}
                  />
                </label>
                <div className="flex items-end justify-end">
                  {shippingDrafts.length > 1 && (
                    <button
                      type="button"
                      className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
                      onClick={() => removeShippingRow(index)}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
              onClick={addShippingRow}
              disabled={!hasOrderItems}
            >
              添加更多明细
            </button>
            <button
              className="rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={!hasOrderItems}
            >
              批量记录发货
            </button>
          </div>
        </form>
      </section>

      <section className="hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:block">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-slate-900">发货日志</h3>
          {shippingLogsQuery.loading && <span className="text-sm text-slate-500">加载中…</span>}
        </div>
        {shippingLogsQuery.error && <p className="mt-2 text-sm text-rose-600">{shippingLogsQuery.error}</p>}
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-3">客户</th>
                <th className="px-4 py-3">订单号</th>
                <th className="px-4 py-3">明细</th>
                <th className="px-4 py-3">数量</th>
                <th className="px-4 py-3">物流单号</th>
                <th className="px-4 py-3">发货时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {logPagedData.map((log) => {
                const { partnerName, orderNo, itemLabel } = getLogContext(log);
                return (
                  <tr key={log.id}>
                    <td className="px-4 py-3">{partnerName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{orderNo}</td>
                    <td className="px-4 py-3">{itemLabel}</td>
                    <td className="px-4 py-3">{log.quantity_shipped}</td>
                    <td className="px-4 py-3">{log.tracking_no || '-'}</td>
                    <td className="px-4 py-3">{new Date(log.shipped_at).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <Pagination page={logPage} pageSize={logPageSize} total={filteredLogs.length} onPageChange={setLogPage} />
        </div>
      </section>

    </div>
  );
}

function getEventLabel(eventType: string) {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function buildCustomerSuggestions(options: CustomerOption[], keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  return options
    .filter((option) => {
      if (!normalized) return true;
      return option.name.toLowerCase().includes(normalized) || String(option.id).includes(normalized);
    })
    .slice(0, 50)
    .map((option) => `${option.name} (#${option.id})`);
}

function resolveCustomerId(value: string, options: CustomerOption[]) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^#?\d+$/.test(trimmed)) {
    return Number(trimmed.replace('#', ''));
  }
  const match = trimmed.match(/#(\d+)/);
  if (match) {
    return Number(match[1]);
  }
  const exactMatches = options.filter((option) => option.name.toLowerCase() === trimmed.toLowerCase());
  if (exactMatches.length === 1) {
    return exactMatches[0].id;
  }
  return null;
}
