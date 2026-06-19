import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PaginatedResponse } from '../api/client';
import { toast } from '../utils/toast';

// 列表 hook 的通用范式——由 useSalesOrders 落地后抽到这里，供其他列表 hook 复用。
// 详见 rules/frontend-rules.md §3.1。

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** "全量预取"型 hook 的溢出告警配置（详见 useListResource 文档）。
 *
 *  使用场景：App.tsx 把 useProducts / usePartners / useCategories 当作"一次
 *  拉够、本地分页 + 本地搜索"用，pageSize 故意拉到 2000 / 1000 / 500 这种大值。
 *  如果真实 totalCount 超了 pageSize，就会**静默截断** → InventoryPanel 看不到
 *  501+ 的物料 / SearchableSelect 选不到 1001+ 的合作方。
 *
 *  本选项保证溢出时 toast.warning 告警**一次**（同一组件实例内只发一次），
 *  让你知道该改服务端分页了（方案 B）。详见 docs/PRD.md §5.4 分页约定。
 */
export interface WarnOnOverflowOptions {
  /** 用户可读的数据名字，如 "物料"、"合作方"、"分类"。会拼到提示文案里。 */
  label: string;
}

export interface UseListHookOptions<TFilters extends object = object> {
  enabled?: boolean;
  page?: number;
  pageSize?: number;
  filters?: TFilters;
  /** 见 WarnOnOverflowOptions 文档。仅"全量预取"调用点才需要传。 */
  warnOnOverflow?: WarnOnOverflowOptions;
}

export interface UseListHookResult<TItem> {
  data: TItem[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  pagination: PaginationMeta;
}

interface InternalConfig<TItem, TFilters extends object> {
  options: UseListHookOptions<TFilters>;
  /** 把 hook 的 options.filters 翻译成 API client 期望的 query params。 */
  toQueryParams: (filters: TFilters | undefined, page: number, pageSize: number) => object;
  /** 真正发请求的函数，接受上面 toQueryParams 的返回。 */
  fetcher: (queryParams: object) => Promise<unknown>;
  /** 把单条原始 response 项归一化为强类型 item。 */
  normalize: (raw: any) => TItem;
}

/** 列表 hook 共用的核心实现：处理 enabled / pagination / filters 稳定化 /
 *  loading / error / 分页元数据。每个具体 hook 只需要给 toQueryParams +
 *  fetcher + normalize 三个回调。
 *
 *  **稳定化要点**（2026-05-27 死循环 hotfix）：
 *    fetcher / normalize 在调用方写成 inline arrow 时每次 render 都是新引用
 *    （如 `fetcher: (qp) => api.getProducts(qp as ProductsQueryParams)`）。
 *    如果把它们放进 fetchData 的 useCallback 依赖里，会引发：
 *      render → 新 fetcher → 新 fetchData → useEffect 重 fetch → setState → 又 render
 *    形成死循环（在 dev 后端日志里表现为每秒数十次同样的 GET）。
 *    解决：用 useRef 持有最新引用，fetchData 的依赖只看 enabled / queryParams。
 */
export function useListResource<TItem, TFilters extends object>(
  config: InternalConfig<TItem, TFilters>,
): UseListHookResult<TItem> {
  const {
    options: { enabled = true, page = 1, pageSize = 30, filters, warnOnOverflow },
    toQueryParams,
    fetcher,
    normalize,
  } = config;

  const [data, setData] = useState<TItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // 溢出告警："本组件实例只 toast 一次"——避免每次刷新 / refetch 都弹。
  // 浏览器整体刷新会重新挂载组件、ref 重置，仍会再警告一次（这是想要的）。
  const overflowWarnedRef = useRef(false);

  // fetcher / normalize / toQueryParams 都通过 ref 持有——每次 render 写入最新值，
  // 但 fetchData 的依赖里不含它们，所以不会触发重 fetch。
  const fetcherRef = useRef(fetcher);
  const normalizeRef = useRef(normalize);
  const toQueryParamsRef = useRef(toQueryParams);
  fetcherRef.current = fetcher;
  normalizeRef.current = normalize;
  toQueryParamsRef.current = toQueryParams;

  // 用 JSON.stringify 稳定化 filters 引用——避免父组件每次 render 传入新对象
  // 触发无限重 fetch。filters 字段不多，开销可忽略。
  const filtersKey = JSON.stringify(filters ?? {});
  const queryParams = useMemo(
    () => toQueryParamsRef.current(filters, page, pageSize),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, pageSize, filtersKey],
  );

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await fetcherRef.current(queryParams);
      // 兼容 DRF 分页响应与裸数组响应。
      const paginated = response as PaginatedResponse<any>;
      const results = Array.isArray((response as any).results)
        ? paginated.results
        : (response as any[]);
      const count = typeof paginated.count === 'number' ? paginated.count : results.length;
      setData(results.map(normalizeRef.current));
      setTotalCount(count);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [enabled, queryParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 溢出告警——totalCount > pageSize 时单次 toast.warning。
  // 故意不放 fetchData 里，避免与 setLoading / setData 同 tick fire toast 干扰渲染。
  useEffect(() => {
    if (
      warnOnOverflow &&
      !overflowWarnedRef.current &&
      totalCount > pageSize &&
      totalCount > 0
    ) {
      overflowWarnedRef.current = true;
      toast.warning(
        `${warnOnOverflow.label}总数 ${totalCount} 超过当前加载上限 ${pageSize}，部分数据未显示。请联系开发升级分页方案。`,
      );
    }
  }, [warnOnOverflow, totalCount, pageSize]);

  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;
  const pagination: PaginationMeta = {
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };

  return { data, loading, error, reload: fetchData, pagination };
}

/** 把所有 list hook 的标准 query params build 逻辑抽出来：
 *  page + page_size + 用户传入的 filters，filter 里 null/undefined/'' 字段会被丢弃。 */
export function buildListQueryParams<TFilters extends object>(
  filters: TFilters | undefined,
  page: number,
  pageSize: number,
): Record<string, unknown> {
  return { page, page_size: pageSize, ...(filters ?? {}) };
}
