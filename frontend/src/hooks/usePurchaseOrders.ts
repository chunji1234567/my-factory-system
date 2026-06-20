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
  /**
   * 供应商承诺到货日期（ISO 日期串 "YYYY-MM-DD"）。
   * 可空：现货采购或旧数据未填；UI 显示为 "未约"。
   * 用途：收货中心订单卡 DueDatePill 着色，采购列表到货列。
   * 命名与销售单 expected_delivery_date 区分——这里是货到本仓，不是送达客户。
   */
  expected_arrival_date?: string | null;
  items: PurchaseOrderItemResponse[];
  events?: PurchaseOrderEventResponse[];
  /** 2026-06-19 归档机制（详见 docs/PRD.md §9.4）。归档单 read-only，
   *  通过 archive / unarchive endpoint 切换，不走 PATCH。 */
  is_archived?: boolean;
  archived_at?: string | null;
  archived_by?: string;
  /** 2026-06-19：供应商自家系统里的订单号（可空），同 SalesOrderResponse。 */
  partner_order_no?: string;
}

export interface PurchaseOrdersFilters {
  status?: string;
  partner?: number;
  /** 供应商名模糊匹配（后端 icontains）。当用户在 PartnerSelect 里输入文本
   *  但没能解析成 ID 时回退用此字段。详见 PurchasePanel.apiFilters。 */
  partner_name?: string;
  order_no?: string;
  created_from?: string;
  created_to?: string;
  ordering?: string;
  /** 2026-06-19 归档过滤（详见 docs/PRD.md §9.4）：
   *    undefined / false → 仅未归档（默认）
   *    true              → 仅已归档（"查看已归档"复选框开启）。 */
  is_archived?: boolean;
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
