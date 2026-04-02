import { useState, useMemo, useEffect } from 'react';
import ProductTable from '../ProductTable';
import CategoryForm from '../CategoryForm';
import ProductForm from '../ProductForm';
import Modal from '../common/Modal';
import { api } from '../../api/client';
import type { CategoryResponse } from '../../hooks/useCategories';
import type { InventoryProduct, StockAdjustmentType } from '../../types';
import { stockAdjustmentOptions } from '../../types';

interface Props {
  products: InventoryProduct[];
  categories: CategoryResponse[];
  loading?: boolean;
  error?: string | null;
  onRefreshProducts?: () => void;
  onRefreshCategories?: () => void;
}

export default function InventoryPanel({
  products,
  categories,
  loading,
  error,
  onRefreshProducts,
  onRefreshCategories,
}: Props) {
  const rawCategories = useMemo(() => {
    const source = categories.length
      ? categories
      : Array.from(
          products.reduce((map, item) => {
            if (!map.has(item.categoryId)) {
              map.set(item.categoryId ?? 0, {
                id: item.categoryId ?? 0,
                name: item.category,
                category_type: item.categoryType ?? 'RAW_MATERIAL',
              });
            }
            return map;
          }, new Map<number, CategoryResponse>()).values()
        );
    const raws = source.filter((cat) => cat.category_type === 'RAW_MATERIAL');
    return raws.length ? raws : source;
  }, [categories, products]);

  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'ALL'>('ALL');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [bulkType, setBulkType] = useState<StockAdjustmentType>('MANUAL_IN');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCategoryId === 'ALL' && rawCategories.length === 1) {
      setSelectedCategoryId(rawCategories[0].id);
    }
  }, [rawCategories, selectedCategoryId]);

  const filtered = useMemo(() => {
    return products.filter((item) => {
      const matchesCategory = selectedCategoryId === 'ALL'
        ? (item.categoryType === 'RAW_MATERIAL' || item.categoryId === 0)
        : item.categoryId === selectedCategoryId;
      const matchesSearch = search
        ? item.modelName.includes(search) || item.internalCode.includes(search)
        : true;
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategoryId, search]);

  const grouped = useMemo(() => {
    if (!filtered.length) return [];
    const map = new Map<number, { category: CategoryResponse; items: InventoryProduct[] }>();
    filtered.forEach((item) => {
      const cat = rawCategories.find((c) => c.id === item.categoryId) || {
        id: item.categoryId ?? 0,
        name: item.category,
        category_type: item.categoryType ?? 'RAW_MATERIAL',
      };
      if (!map.has(cat.id)) {
        map.set(cat.id, { category: cat, items: [] });
      }
      map.get(cat.id)!.items.push(item);
    });
    return Array.from(map.values()).sort((a, b) => a.category.name.localeCompare(b.category.name));
  }, [filtered, rawCategories]);

  const selectedProducts = useMemo(() => {
    if (!selectedIds.size) return [] as InventoryProduct[];
    const ids = new Set(selectedIds);
    return products.filter((item) => ids.has(item.id));
  }, [products, selectedIds]);

  const handleToggleProduct = (product: InventoryProduct) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
        setQuantities((prevQty) => {
          const { [product.id]: _removed, ...rest } = prevQty;
          return rest;
        });
      } else {
        next.add(product.id);
      }
      return next;
    });
    setBulkMessage(null);
  };

  const handleQuantityChange = (productId: number, value: string) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: value,
    }));
  };

  const clearBulkState = () => {
    setSelectedIds(new Set());
    setQuantities({});
  };

  const handleBulkSubmit = async () => {
    if (!selectedProducts.length) {
      setBulkMessage('请选择需要操作的产品');
      return;
    }
    const invalid = selectedProducts.filter((product) => {
      const value = Number(quantities[product.id]);
      return Number.isNaN(value) || value <= 0;
    });
    if (invalid.length) {
      setBulkMessage('请为每个选中的产品填写大于 0 的数量');
      return;
    }
    setBulkLoading(true);
    setBulkMessage(null);
    try {
      for (const product of selectedProducts) {
        await api.createStockAdjustment({
          product: product.id,
          adjustment_type: bulkType,
          quantity: Number(quantities[product.id]),
          note: '',
        });
      }
      setBulkMessage('批量操作成功');
      clearBulkState();
      onRefreshProducts?.();
    } catch (err) {
      setBulkMessage(err instanceof Error ? err.message : '批量操作失败');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="flex-1 text-sm text-slate-600">
            <span className="block">搜索产品</span>
            <input
              value={search}
              onChange={(evt) => setSearch(evt.target.value)}
              className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2"
              placeholder="按名称或编号搜索"
            />
          </label>
          <label className="text-sm text-slate-600">
            <span className="block">分类</span>
            <select
              value={selectedCategoryId === 'ALL' ? 'ALL' : String(selectedCategoryId)}
              onChange={(evt) => {
                const value = evt.target.value === 'ALL' ? 'ALL' : Number(evt.target.value);
                setSelectedCategoryId(value);
              }}
              className="mt-1 rounded-full border border-slate-200 px-4 py-2"
            >
              <option value="ALL">全部原材料</option>
              {rawCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowCategoryModal(true)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              新建分类
            </button>
            <button onClick={() => setShowProductModal(true)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              新建产品
            </button>
          </div>
        </div>
      </section>

      {selectedProducts.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-slate-700">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-base font-semibold text-slate-900">
                已选 {selectedProducts.length} 个产品
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedProducts.map((product) => (
                  <span key={product.id} className="rounded-full bg-white/70 px-3 py-1 text-xs text-slate-500">
                    {product.internalCode} · {product.modelName}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-end">
              <select
                value={bulkType}
                onChange={(evt) => setBulkType(evt.target.value as StockAdjustmentType)}
                className="rounded-full border border-slate-200 px-4 py-2"
              >
                {stockAdjustmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkSubmit}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={bulkLoading}
              >
                {bulkLoading ? '处理中…' : '执行批量操作'}
              </button>
              <button
                onClick={clearBulkState}
                type="button"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-white"
                disabled={bulkLoading}
              >
                清空选择
              </button>
            </div>
          </div>
          {bulkMessage && (
            <p className={`mt-3 text-xs ${bulkMessage.includes('成功') ? 'text-emerald-600' : 'text-rose-600'}`}>
              {bulkMessage}
            </p>
          )}
        </section>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {grouped.length === 0 && !loading && (
        <p className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-500">
          当前分类暂无产品
        </p>
      )}
      {grouped.map((group) => (
        <ProductTable
          key={group.category.id}
          products={group.items}
          loading={loading}
          title={`分类：${group.category.name}`}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleProduct}
          quantities={quantities}
          onQuantityChange={handleQuantityChange}
        />
      ))}

      <Modal title="新建分类" open={showCategoryModal} onClose={() => setShowCategoryModal(false)}>
        <CategoryForm
          onSuccess={() => {
            onRefreshCategories?.();
            setShowCategoryModal(false);
          }}
        />
      </Modal>

      <Modal title="新建产品" open={showProductModal} onClose={() => setShowProductModal(false)}>
        <ProductForm
          categories={rawCategories}
          onSuccess={() => {
            onRefreshProducts?.();
            setShowProductModal(false);
          }}
        />
      </Modal>

    </div>
  );
}
