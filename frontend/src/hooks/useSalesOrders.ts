import { api, SalesOrdersQueryParams } from '../api/client';
import {
  buildListQueryParams,
  UseListHookOptions,
  UseListHookResult,
  useListResource,
} from './listHookHelpers';

// ---------- 响应类型（与后端 SalesOrderSerializer 字段对齐） ----------

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
  created_at: string;
  items: SalesOrderItemResponse[];
  events?: OrderEventResponse[];
}

export interface SalesOrdersFilters {
  status?: string;
  partner?: number;
  order_no?: string;
  partner_name?: string;
  created_from?: string;
  created_to?: string;
  ordering?: string;
}

function normalize(raw: any): SalesOrderResponse {
  return {
    ...raw,
    total_amount: Number(raw.total_amount ?? 0),
    items: Array.isArray(raw.items)
      ? raw.items.map((item: any) => ({
          ...item,
          quantity: Number(item.quantity ?? 0),
          shipped_quantity: Number(item.shipped_quantity ?? 0),
          price: Number(item.price ?? 0),
        }))
      : [],
    events: Array.isArray(raw.events)
      ? raw.events.map((event: any) => ({
          ...event,
          operator: event.operator ?? null,
        }))
      : [],
  };
}

type LegacyArg = boolean;

export function useSalesOrders(
  optionsOrEnabled: UseListHookOptions<SalesOrdersFilters> | LegacyArg = {},
): UseListHookResult<SalesOrderResponse> {
  const options: UseListHookOptions<SalesOrdersFilters> =
    typeof optionsOrEnabled === 'boolean'
      ? { enabled: optionsOrEnabled }
      : optionsOrEnabled;
  return useListResource<SalesOrderResponse, SalesOrdersFilters>({
    options,
    toQueryParams: buildListQueryParams,
    fetcher: (qp) => api.getSalesOrders(qp as SalesOrdersQueryParams),
    normalize,
  });
}
