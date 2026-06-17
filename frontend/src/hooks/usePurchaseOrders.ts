import { api, PurchaseOrdersQueryParams } from '../api/client';
import {
  buildListQueryParams,
  UseListHookOptions,
  UseListHookResult,
  useListResource,
} from './listHookHelpers';

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

export interface PurchaseOrdersFilters {
  status?: string;
  partner?: number;
  order_no?: string;
  created_from?: string;
  created_to?: string;
  ordering?: string;
}

function normalize(raw: any): PurchaseOrderResponse {
  return {
    ...raw,
    total_amount: Number(raw.total_amount ?? 0),
    items: Array.isArray(raw.items)
      ? raw.items.map((item: any) => ({
          ...item,
          price: Number(item.price ?? 0),
          quantity: Number(item.quantity ?? 0),
          received_quantity: Number(item.received_quantity ?? 0),
        }))
      : [],
    events: Array.isArray(raw.events)
      ? raw.events.map((event: any) => ({
          id: event.id,
          event_type: event.event_type,
          content: event.content,
          operator: event.operator ?? null,
          created_at: event.created_at,
        }))
      : [],
  };
}

type LegacyArg = boolean;

export function usePurchaseOrders(
  optionsOrEnabled: UseListHookOptions<PurchaseOrdersFilters> | LegacyArg = {},
): UseListHookResult<PurchaseOrderResponse> {
  const options: UseListHookOptions<PurchaseOrdersFilters> =
    typeof optionsOrEnabled === 'boolean'
      ? { enabled: optionsOrEnabled }
      : optionsOrEnabled;
  return useListResource<PurchaseOrderResponse, PurchaseOrdersFilters>({
    options,
    toQueryParams: buildListQueryParams,
    fetcher: (qp) => api.getPurchaseOrders(qp as PurchaseOrdersQueryParams),
    normalize,
  });
}
