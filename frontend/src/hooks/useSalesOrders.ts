import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export interface OrderEventResponse {
  id: number;
  event_type: string;
  content: string;
  operator?: string | null;
  created_at: string;
}

export interface SalesOrderItemResponse {
  id: number;
  product: number | null;
  product_detail?: {
    id: number;
    model_name: string;
    internal_code?: string;
    category_detail?: {
      id: number;
      name: string;
      category_type: string;
    } | null;
  } | null;
  custom_product_name: string;
  detail_description?: string;
  price: number;
  quantity: number;
  shipped_quantity: number;
}

export interface SalesOrderResponse {
  id: number;
  partner: number;
  partner_name?: string;
  order_no: string;
  status: string;
  total_amount: number;
  paid_amount: number;
  created_at: string;
  items: SalesOrderItemResponse[];
  events?: OrderEventResponse[];
}

export function useSalesOrders(enabled = true) {
  const [data, setData] = useState<SalesOrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await api.getSalesOrders();
      const resolved = Array.isArray((response as any).results) ? (response as any).results : response;
      const normalized: SalesOrderResponse[] = resolved.map((order: any) => ({
        ...order,
        total_amount: Number(order.total_amount ?? 0),
        paid_amount: Number(order.paid_amount ?? 0),
        items: Array.isArray(order.items)
          ? order.items.map((item: any) => ({
              ...item,
              quantity: Number(item.quantity ?? 0),
              shipped_quantity: Number(item.shipped_quantity ?? 0),
              price: Number(item.price ?? 0),
            }))
          : [],
        events: Array.isArray(order.events)
          ? order.events.map((event: any) => ({
              ...event,
              operator: event.operator ?? null,
            }))
          : [],
      }));
      setData(normalized);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { data, loading, error, reload: fetchOrders };
}
