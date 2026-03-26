import { useState, useMemo, useEffect } from 'react';
import ProductTable from '../ProductTable';
import CategoryForm from '../CategoryForm';
import ProductForm from '../ProductForm';
import BulkStockModal from '../BulkStockModal';
import Modal from '../common/Modal';
import type { CategoryResponse } from '../../hooks/useCategories';
import type { ProductItem } from '../../mockData';

interface Props {
  products: ProductItem[];
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
  const [showBulkModal, setShowBulkModal] = useState(false);

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
    const map = new Map<number, { category: CategoryResponse; items: ProductItem[] }>();
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
          <div className="flex gap-2">
            <button onClick={() => setShowCategoryModal(true)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              新建分类
            </button>
            <button onClick={() => setShowProductModal(true)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              新建产品
            </button>
            <button onClick={() => setShowBulkModal(true)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              批量出入库
            </button>
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {grouped.length === 0 && !loading && (
        <p className="rounded-2xl border border-slate-100 bg白 p-6 text-center text-sm text-slate-500">
          当前分类暂无产品
        </p>
      )}
      {grouped.map((group) => (
        <ProductTable
          key={group.category.id}
          products={group.items}
          loading={loading}
          title={`分类：${group.category.name}`}
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

      <BulkStockModal
        open={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        products={products}
        categories={rawCategories}
        onSuccess={() => {
          onRefreshProducts?.();
          setShowBulkModal(false);
        }}
      />
    </div>
  );
}
