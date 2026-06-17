import { api, ProductionOrdersQueryParams } from '../api/client';
import {
  buildListQueryParams,
  UseListHookOptions,
  UseListHookResult,
  useListResource,
} from './listHookHelpers';

// ---------- 响应类型（与后端 ProductionOrderSerializer 字段对齐） ----------

export type ProductionStatus = 'PLANNED' | 'EXECUTED' | 'CANCELLED';

interface ProductDetail {
  id: number;
  internal_code?: string;
  model_name: string;
  category_detail?: {
    id: number;
    name: string;
    category_type: string;
  } | null;
}

// PCB 方案的轻量 detail（嵌套在 ProductionOrderLine / SalesOrderItem 里）
export interface PcbPlanLite {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  materials?: Array<{
    id: number;
    quantity_per_unit: number;
    material_detail?: ProductDetail | null;
  }>;
}

export interface ProductionOrderLineResponse {
  id: number;
  sales_item: number | null;
  sales_order_no: string | null;
  shell: number;
  shell_detail?: ProductDetail | null;
  // BOM-2.0：board 字段已被 PCB 方案 FK 取代（详见 docs/PRD.md §4.5 §9.4 changelog）
  pcb_plan: number;
  pcb_plan_detail?: PcbPlanLite | null;
  cable: number;
  cable_detail?: ProductDetail | null;
  quantity: number;
  note: string;
}

export interface ProductionOrderResponse {
  id: number;
  order_no: string;
  plan_date: string;            // YYYY-MM-DD
  status: ProductionStatus;
  note: string;
  operator: string;
  created_at: string;
  executed_at: string | null;
  lines: ProductionOrderLineResponse[];
}

// ---------- 过滤参数（panel 用） ----------

export interface ProductionOrdersFilters {
  status?: ProductionStatus;
  plan_date?: string;
  plan_date_from?: string;
  plan_date_to?: string;
  order_no?: string;
  ordering?: string;
}

// ---------- 归一化 + hook ----------

function normalize(raw: any): ProductionOrderResponse {
  return {
    ...raw,
    lines: Array.isArray(raw.lines)
      ? raw.lines.map((line: any) => ({
          ...line,
          quantity: Number(line.quantity ?? 0),
        }))
      : [],
  };
}

type LegacyArg = boolean;

export function useProductionOrders(
  optionsOrEnabled: UseListHookOptions<ProductionOrdersFilters> | LegacyArg = {},
): UseListHookResult<ProductionOrderResponse> {
  const options: UseListHookOptions<ProductionOrdersFilters> =
    typeof optionsOrEnabled === 'boolean'
      ? { enabled: optionsOrEnabled }
      : optionsOrEnabled;
  return useListResource<ProductionOrderResponse, ProductionOrdersFilters>({
    options,
    toQueryParams: buildListQueryParams,
    fetcher: (qp) => api.getProductionOrders(qp as ProductionOrdersQueryParams),
    normalize,
  });
}
