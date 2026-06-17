import { api, FinanceTransactionsQueryParams } from '../api/client';
import {
  buildListQueryParams,
  UseListHookOptions,
  UseListHookResult,
  useListResource,
} from './listHookHelpers';

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

export interface FinanceTransactionsFilters {
  partner?: number;
  transaction_type?: FinanceTransactionType;
  note?: string;
  created_from?: string;
  created_to?: string;
  ordering?: string;
}

function normalize(raw: any): FinanceTransactionResponse {
  return {
    ...raw,
    amount: Number(raw.amount ?? 0),
    transaction_type: (raw.transaction_type ?? 'RECEIPT') as FinanceTransactionType,
  };
}

type LegacyArg = boolean;

export function useFinanceTransactions(
  optionsOrEnabled: UseListHookOptions<FinanceTransactionsFilters> | LegacyArg = {},
): UseListHookResult<FinanceTransactionResponse> {
  const options: UseListHookOptions<FinanceTransactionsFilters> =
    typeof optionsOrEnabled === 'boolean'
      ? { enabled: optionsOrEnabled }
      : optionsOrEnabled;
  return useListResource<FinanceTransactionResponse, FinanceTransactionsFilters>({
    options,
    toQueryParams: buildListQueryParams,
    fetcher: (qp) => api.getFinanceTransactions(qp as FinanceTransactionsQueryParams),
    normalize,
  });
}
