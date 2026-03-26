import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export type FinanceTransactionType = 'RECEIPT' | 'PAYMENT' | 'ADJUST';

export interface FinanceTransactionResponse {
  id: number;
  partner: number;
  partner_name?: string;
  amount: number;
  transaction_type: FinanceTransactionType;
  note?: string;
  operator?: string;
  created_at: string;
}

export function useFinanceTransactions(enabled = true) {
  const [data, setData] = useState<FinanceTransactionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await api.getFinanceTransactions();
      const resolved = Array.isArray((response as any).results) ? (response as any).results : response;
      const normalized: FinanceTransactionResponse[] = resolved.map((txn: any) => ({
        ...txn,
        amount: Number(txn.amount ?? 0),
        transaction_type: txn.transaction_type ?? 'RECEIPT',
      }));
      setData(normalized);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载财务流水失败');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return { data, loading, error, reload: fetchTransactions };
}
