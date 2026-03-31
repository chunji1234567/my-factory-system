import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export interface PurchaseOrderItemResponse {
  id: number;
  product: number;
  product_detail?: {
    id: number;
    model_name: string;
    category_detail?: {
      id: number;
      name: string;
      category_type: string;
    } | null;
  } | null;
  price: number;
  quantity: number;
  received_quantity: number;
}

export interface PurchaseOrderEventResponse {
  id: number;
  event_type: string;
  content: string;
  operator?: string | null;
  created_at: string;
}

export interface PurchaseOrderResponse {
  id: number;
  partner: number;
  partner_name?: string;
  order_no: string;
  status: string;
  total_amount: number;
  created_at: string;
  operator?: string;
  items: PurchaseOrderItemResponse[];
  events?: PurchaseOrderEventResponse[];
}

export function usePurchaseOrders(enabled = true) {
  const [data, setData] = useState<PurchaseOrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await api.getPurchaseOrders();
      const resolved = Array.isArray((response as any).results) ? (response as any).results : response;
      const normalized: PurchaseOrderResponse[] = resolved.map((order: any) => ({
        ...order,
        total_amount: Number(order.total_amount ?? 0),
        items: Array.isArray(order.items)
          ? order.items.map((item: any) => ({
              ...item,
              price: Number(item.price ?? 0),
              quantity: Number(item.quantity ?? 0),
              received_quantity: Number(item.received_quantity ?? 0),
            }))
          : [],
        events: Array.isArray(order.events)
          ? order.events.map((event: any) => ({
              id: event.id,
              event_type: event.event_type,
              content: event.content,
              operator: event.operator ?? null,
              created_at: event.created_at,
            }))
          : [],
      }));
      setData(normalized);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载采购订单失败');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { data, loading, error, reload: fetchOrders };
}
