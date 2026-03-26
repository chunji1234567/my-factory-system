import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export type PartnerType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';

export interface PartnerResponse {
  id: number;
  name: string;
  partner_type: PartnerType;
  balance: number;
}

export function usePartners(enabled = true) {
  const [data, setData] = useState<PartnerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPartners = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await api.getPartners();
      const resolved = Array.isArray((response as any).results) ? (response as any).results : response;
      const normalized: PartnerResponse[] = resolved.map((partner: any) => ({
        ...partner,
        balance: Number(partner.balance ?? 0),
      }));
      setData(normalized);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载合作方失败');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  return { data, loading, error, reload: fetchPartners };
}
