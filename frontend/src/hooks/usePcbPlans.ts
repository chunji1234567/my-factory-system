import { api, PcbPlansQueryParams } from '../api/client';
import {
  buildListQueryParams,
  UseListHookOptions,
  UseListHookResult,
  useListResource,
} from './listHookHelpers';

/**
 * PCB 方案 hook（BOM-2.0）。
 *
 * 方案是销售明细的"第二件"——OrderItemsEditor 在销售模式下展示方案下拉，
 * 排产明细同理。同时 PcbPlanPanel 用本 hook 拉列表。
 *
 * 后端权限：manager only（详见 docs/PRD.md §2.2）。非 manager 不要触发
 * 本 hook（App.tsx 已按 isManager gating）。
 */

export interface PcbPlanMaterialDetail {
  id: number;
  material: number;
  quantity_per_unit: number;
  note: string;
  material_detail?: {
    id: number;
    internal_code: string;
    model_name: string;
    unit: string;
    stock_quantity: number;
    category_detail?: { id: number; name: string; category_type: string };
  };
}

export interface PcbPlanResponse {
  id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  materials: PcbPlanMaterialDetail[];
}

export type PcbPlansFilters = {
  is_active?: boolean;
  name?: string;
  code?: string;
};

function normalizePcbPlan(raw: any): PcbPlanResponse {
  return {
    ...raw,
    code: raw.code ?? '',
    description: raw.description ?? '',
    is_active: Boolean(raw.is_active),
    materials: Array.isArray(raw.materials)
      ? raw.materials.map((m: any) => ({
          ...m,
          quantity_per_unit: Number(m.quantity_per_unit ?? 0),
          note: m.note ?? '',
        }))
      : [],
  };
}

type LegacyArg = boolean;

export function usePcbPlans(
  optionsOrEnabled: UseListHookOptions<PcbPlansFilters> | LegacyArg = {},
): UseListHookResult<PcbPlanResponse> {
  const options: UseListHookOptions<PcbPlansFilters> =
    typeof optionsOrEnabled === 'boolean'
      ? { enabled: optionsOrEnabled }
      : optionsOrEnabled;
  return useListResource<PcbPlanResponse, PcbPlansFilters>({
    options,
    toQueryParams: buildListQueryParams,
    fetcher: (qp) => api.getPcbPlans(qp as PcbPlansQueryParams),
    normalize: normalizePcbPlan,
  });
}
