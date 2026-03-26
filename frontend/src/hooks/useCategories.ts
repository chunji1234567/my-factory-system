import { useEffect, useState } from 'react';
import { api } from '../api/client';

export interface CategoryResponse {
  id: number;
  name: string;
  category_type: string;
  parent?: number | null;
}

export function useCategories(enabled = true) {
  const [data, setData] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await api.getCategories();
      const resolved = Array.isArray((response as any).results) ? (response as any).results : response;
      setData(resolved);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    fetchCategories();
  }, [enabled]);

  return { data, loading, error, reload: fetchCategories };
}
