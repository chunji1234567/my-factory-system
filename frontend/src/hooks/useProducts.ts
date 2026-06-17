import { api, ProductsQueryParams } from '../api/client';
import {
  buildListQueryParams,
  UseListHookOptions,
  UseListHookResult,
  useListResource,
} from './listHookHelpers';

export interface ProductResponse {
  id: number;
  category: number;
  internal_code: string;
  model_name: string;
  unit: string;
  image?: string | null;
  stock_quantity: number;
  min_stock: number;
  category_detail?: {
    id: number;
    name: string;
    category_type: string;
  } | null;
}

// Products 当前没有专用 FilterSet，filters 留作未来扩展。
export type ProductsFilters = object;

function normalizeProduct(raw: any): ProductResponse {
  return {
    ...raw,
    stock_quantity: Number(raw.stock_quantity ?? 0),
    min_stock: Number(raw.min_stock ?? 0),
  };
}

/** 旧签名 (enabled: boolean) 仍兼容——许多旧调用点直接传 boolean。 */
type LegacyArg = boolean;

export function useProducts(
  optionsOrEnabled: UseListHookOptions<ProductsFilters> | LegacyArg = {},
): UseListHookResult<ProductResponse> {
  const options: UseListHookOptions<ProductsFilters> =
    typeof optionsOrEnabled === 'boolean'
      ? { enabled: optionsOrEnabled }
      : optionsOrEnabled;
  return useListResource<ProductResponse, ProductsFilters>({
    options,
    toQueryParams: buildListQueryParams,
    fetcher: (qp) => api.getProducts(qp as ProductsQueryParams),
    normalize: normalizeProduct,
  });
}
