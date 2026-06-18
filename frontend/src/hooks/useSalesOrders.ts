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

/**
 * BOM 三件套的精简表示。
 * 后端 SalesOrderItemSerializer 返回 product_detail / pcb_plan_detail / cable_detail
 * 三个完整对象（详见 docs/PRD.md §3.2），这里只挑前端卡片要展示的字段。
 */
interface ProductChip {
  id: number;
  model_name: string;
  internal_code?: string;
  category_detail?: {
    id: number;
    name: string;
    category_type: string;
  } | null;
}

interface PcbPlanChip {
  id: number;
  name: string;
  code?: string;
}

export interface SalesOrderItemResponse {
  id: number;
  product: number | null;
  /** 外壳（沿用历史字段名）—— 半成品 Product[SELF_MADE] */
  product_detail?: ProductChip | null;
  /** PCB 方案 —— 排产时按方案展开扣减原材料 */
  pcb_plan_detail?: PcbPlanChip | null;
  /** 线材 —— 半成品 Product[CABLE] */
  cable_detail?: ProductChip | null;
  custom_product_name: string;
  detail_description?: string;
  price: number;
  quantity: number;
  shipped_quantity: number;
  // BOM-2.1（2026-05-27）新增派生量，详见 docs/PRD.md §3.2。
  produced_quantity: number;
  available_to_ship_quantity: number;
}

export interface SalesOrderResponse {
  id: number;
  partner: number;
  partner_name?: string;
  order_no: string;
  status: string;
  total_amount: number;
  created_at: string;
  /**
   * 答应客户的交付日期（ISO 日期串 "YYYY-MM-DD"）。
   * 可空：急单或旧数据未填；UI 显示为 "未约"。
   * 用途：排产/发货卡片右上角 DueDatePill 着色，销售列表交期列。
   */
  expected_delivery_date?: string | null;
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
          produced_quantity: Number(item.produced_quantity ?? 0),
          available_to_ship_quantity: Number(item.available_to_ship_quantity ?? 0),
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
