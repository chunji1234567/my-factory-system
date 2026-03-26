import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export interface ShippingLogResponse {
  id: number;
  sales_item: number;
  quantity_shipped: number;
  tracking_no?: string;
  shipped_at: string;
  operator?: string;
  sales_item_detail?: {
    id: number;
    custom_product_name: string;
    quantity: number;
    shipped_quantity: number;
    product_detail?: {
      id: number;
      model_name: string;
    } | null;
  };
}

export function useShippingLogs(enabled = true) {
  const [data, setData] = useState<ShippingLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await api.getShippingLogs();
      const resolved = Array.isArray((response as any).results) ? (response as any).results : response;
      const normalized: ShippingLogResponse[] = resolved.map((log: any) => ({
        ...log,
        quantity_shipped: Number(log.quantity_shipped ?? 0),
        sales_item_detail: log.sales_item_detail
          ? {
              ...log.sales_item_detail,
              quantity: Number(log.sales_item_detail.quantity ?? 0),
              shipped_quantity: Number(log.sales_item_detail.shipped_quantity ?? 0),
            }
          : undefined,
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
    fetchLogs();
  }, [fetchLogs]);

  return { data, loading, error, reload: fetchLogs };
}
