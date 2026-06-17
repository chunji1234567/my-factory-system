import { api, ShippingLogsQueryParams } from '../api/client';
import {
  buildListQueryParams,
  UseListHookOptions,
  UseListHookResult,
  useListResource,
} from './listHookHelpers';

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
  partner_name?: string | null;
  partner_id?: number | null;
  order_no?: string | null;
}

export interface ShippingLogsFilters {
  sales_order?: number;
  partner?: number;
  partner_name?: string;
  operator?: string;
  shipped_from?: string;
  shipped_to?: string;
  ordering?: string;
}

function normalize(raw: any): ShippingLogResponse {
  const partnerIdValue = raw.partner_id ?? (raw.partner ?? null);
  const parsedPartnerId =
    partnerIdValue !== null && partnerIdValue !== undefined ? Number(partnerIdValue) : null;
  const partner_id = Number.isNaN(parsedPartnerId) ? null : parsedPartnerId;
  return {
    ...raw,
    quantity_shipped: Number(raw.quantity_shipped ?? 0),
    sales_item_detail: raw.sales_item_detail
      ? {
          ...raw.sales_item_detail,
          quantity: Number(raw.sales_item_detail.quantity ?? 0),
          shipped_quantity: Number(raw.sales_item_detail.shipped_quantity ?? 0),
        }
      : undefined,
    partner_name: raw.partner_name ?? null,
    partner_id,
    order_no: raw.order_no ?? null,
  };
}

type LegacyArg = boolean;

export function useShippingLogs(
  optionsOrEnabled: UseListHookOptions<ShippingLogsFilters> | LegacyArg = {},
): UseListHookResult<ShippingLogResponse> {
  const options: UseListHookOptions<ShippingLogsFilters> =
    typeof optionsOrEnabled === 'boolean'
      ? { enabled: optionsOrEnabled }
      : optionsOrEnabled;
  return useListResource<ShippingLogResponse, ShippingLogsFilters>({
    options,
    toQueryParams: buildListQueryParams,
    fetcher: (qp) => api.getShippingLogs(qp as ShippingLogsQueryParams),
    normalize,
  });
}
