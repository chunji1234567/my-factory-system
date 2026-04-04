import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';

type FilterState = Record<string, any>;

interface UsePaginatedFilterOptions<TItem, TFilters extends FilterState> {
  data?: TItem[];
  pageSize?: number;
  initialFilters?: TFilters;
  filterFn?: (item: TItem, filters: TFilters) => boolean;
}

interface UsePaginatedFilterReturn<TItem, TFilters extends FilterState> {
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  filters: TFilters;
  setFilters: Dispatch<SetStateAction<TFilters>>;
  resetFilters: () => void;
  filteredData: TItem[];
  pagedData: TItem[];
  total: number;
}

export function usePaginatedFilter<TItem, TFilters extends FilterState = FilterState>(
  options: UsePaginatedFilterOptions<TItem, TFilters>,
): UsePaginatedFilterReturn<TItem, TFilters> {
  const { data = [], pageSize = 30, initialFilters, filterFn } = options;
  const initialFiltersRef = useRef<TFilters>(
    (initialFilters ?? ({} as TFilters)),
  );
  const [filters, setFilters] = useState<TFilters>(initialFiltersRef.current);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (initialFilters) {
      initialFiltersRef.current = initialFilters;
    }
  }, [initialFilters]);

  const filteredData = useMemo(() => {
    if (!filterFn) {
      return data;
    }
    return data.filter((item) => filterFn(item, filters));
  }, [data, filters, filterFn]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((filteredData.length || 1) / pageSize));
    setPage((prev) => Math.min(prev, totalPages));
  }, [filteredData.length, pageSize]);

  const pagedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, page, pageSize]);

  const resetFilters = () => {
    setFilters(initialFiltersRef.current);
  };

  return {
    page,
    setPage,
    pageSize,
    filters,
    setFilters,
    resetFilters,
    filteredData,
    pagedData,
    total: filteredData.length,
  };
}
