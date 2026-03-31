import { useEffect, useState } from 'react';
import { api } from '../api/client';

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

export function useProducts(enabled = true) {
  const [data, setData] = useState<ProductResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await api.getProducts();
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

    fetchProducts();
  }, [enabled]);

  return { data, loading, error, reload: fetchProducts };
}
