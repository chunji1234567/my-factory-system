import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export interface CustomerPreferredProductResponse {
  id: number;
  partner: number;
  partner_name?: string;
  name: string;
  created_at: string;
}

export function useCustomerPreferredProducts(partnerId: number | null, enabled = true) {
  const [data, setData] = useState<CustomerPreferredProductResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    if (!enabled || !partnerId) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      const response = await api.getCustomerPreferredProducts(partnerId);
      const resolved = Array.isArray((response as any).results) ? (response as any).results : response;
      setData(resolved);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载常用型号失败');
    } finally {
      setLoading(false);
    }
  }, [partnerId, enabled]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  return { data, loading, error, reload: fetchPreferences };
}
