import { api, ProductionRecordsQueryParams } from '../api/client';
import {
  buildListQueryParams,
  UseListHookOptions,
  UseListHookResult,
  useListResource,
} from './listHookHelpers';

/**
 * 排产记录 hook（BOM-2.1，2026-05-27）。
 *
 * 排产 = 给某条销售明细记一笔产量事件。创建即扣料（除非 admin 后台勾
 * skip_consumption）。三角色都可消费此 hook。详见 docs/PRD.md §4.5。
 */

export interface ProductionRecordResponse {
  id: number;
  sales_item: number;
  sales_order_id: number;
  sales_order_no: string;
  custom_product_name: string;
  partner_name: string;
  quantity: number;
  operator: string;
  note: string;
  executed_at: string;
}

export type ProductionRecordsFilters = {
  sales_item?: number;
  sales_order?: number;
  partner?: number;
  executed_from?: string;
  executed_to?: string;
  operator?: string;
};

function normalizeRecord(raw: any): ProductionRecordResponse {
  return {
    ...raw,
    quantity: Number(raw.quantity ?? 0),
    note: raw.note ?? '',
    custom_product_name: raw.custom_product_name ?? '',
    partner_name: raw.partner_name ?? '',
  };
}

type LegacyArg = boolean;

export function useProductionRecords(
  optionsOrEnabled: UseListHookOptions<ProductionRecordsFilters> | LegacyArg = {},
): UseListHookResult<ProductionRecordResponse> {
  const options: UseListHookOptions<ProductionRecordsFilters> =
    typeof optionsOrEnabled === 'boolean'
      ? { enabled: optionsOrEnabled }
      : optionsOrEnabled;
  return useListResource<ProductionRecordResponse, ProductionRecordsFilters>({
    options,
    toQueryParams: buildListQueryParams,
    fetcher: (qp) => api.getProductionRecords(qp as ProductionRecordsQueryParams),
    normalize: normalizeRecord,
  });
}
