import { api, CategoriesQueryParams } from '../api/client';
import {
  buildListQueryParams,
  UseListHookOptions,
  UseListHookResult,
  useListResource,
} from './listHookHelpers';

export interface CategoryResponse {
  id: number;
  name: string;
  category_type: string;
  parent?: number | null;
}

export type CategoriesFilters = object;

function normalizeCategory(raw: any): CategoryResponse {
  return raw as CategoryResponse;
}

type LegacyArg = boolean;

export function useCategories(
  optionsOrEnabled: UseListHookOptions<CategoriesFilters> | LegacyArg = {},
): UseListHookResult<CategoryResponse> {
  const options: UseListHookOptions<CategoriesFilters> =
    typeof optionsOrEnabled === 'boolean'
      ? { enabled: optionsOrEnabled }
      : optionsOrEnabled;
  return useListResource<CategoryResponse, CategoriesFilters>({
    options,
    toQueryParams: buildListQueryParams,
    fetcher: (qp) => api.getCategories(qp as CategoriesQueryParams),
    normalize: normalizeCategory,
  });
}
