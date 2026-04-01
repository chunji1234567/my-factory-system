import { useEffect, useMemo, useState } from 'react';
import type { ProductResponse } from '../../hooks/useProducts';
import type { CategoryResponse } from '../../hooks/useCategories';
import Pagination from '../common/Pagination';
import Modal from '../common/Modal';
import { api } from '../../api/client';
import ProductForm from '../ProductForm';

interface Props {
  products: ProductResponse[];
  categories: CategoryResponse[];
  loading: boolean;
  error: string | null;
  onRefresh(): void;
  onRefreshCategories?: () => void;
}

const PAGE_SIZE = 12;

export default function SelfMadeGalleryPanel({
  products,
  categories,
  loading,
  error,
  onRefresh,
  onRefreshCategories,
}: Props) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | number>('ALL');
  const [page, setPage] = useState(1);
  const [adjustProduct, setAdjustProduct] = useState<ProductResponse | null>(null);
  const [adjustMode, setAdjustMode] = useState<'IN' | 'OUT'>('IN');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  const selfMadeProducts = useMemo(
    () => products.filter((product) => product.category_detail?.category_type === 'SELF_MADE'),
    [products],
  );

  const selfMadeCategories = useMemo(
    () => categories.filter((category) => category.category_type === 'SELF_MADE'),
    [categories],
  );

  const categoryOptions = useMemo(() => {
    if (selfMadeCategories.length) {
      return selfMadeCategories.map((category) => ({ value: category.id, label: category.name }));
    }
    const map = new Map<number, string>();
    selfMadeProducts.forEach((product) => {
      const id = product.category_detail?.id;
      if (id != null && !map.has(id)) {
        map.set(id, product.category_detail?.name ?? '未分类');
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [selfMadeCategories, selfMadeProducts]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return selfMadeProducts.filter((product) => {
      if (categoryFilter !== 'ALL' && product.category_detail?.id !== categoryFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        product.model_name.toLowerCase().includes(keyword) ||
        product.internal_code.toLowerCase().includes(keyword)
      );
    });
  }, [selfMadeProducts, search, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const imageBase = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const resolveImageUrl = (path?: string | null) => {
    if (!path) {
      return null;
    }
    if (/^https?:/i.test(path) || path.startsWith('data:')) {
      return path;
    }
    return `${imageBase}${path}`;
  };

  const handleOpenAdjust = (product: ProductResponse, mode: 'IN' | 'OUT') => {
    setAdjustProduct(product);
    setAdjustMode(mode);
    setAdjustQty('');
    setAdjustNote('');
    setAdjustError(null);
  };

  const handleSubmitAdjust = async () => {
    if (!adjustProduct) {
      return;
    }
    const qty = Number(adjustQty);
    if (!qty || Number.isNaN(qty) || qty <= 0) {
      setAdjustError('请输入大于 0 的数量');
      return;
    }
    setAdjustSaving(true);
    setAdjustError(null);
    try {
      await api.createStockAdjustment({
        product: adjustProduct.id,
        adjustment_type: adjustMode === 'IN' ? 'MANUAL_IN' : 'MANUAL_OUT',
        quantity: qty,
        note: adjustNote,
      });
      setAdjustProduct(null);
      onRefresh();
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : '库存调整失败');
    } finally {
      setAdjustSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <label className="flex-1 text-sm text-slate-600">
            <span className="block">搜索型号或编号</span>
            <input
              className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2"
              placeholder="输入型号、编号关键字"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            <span className="block">分类</span>
            <select
              className="mt-1 rounded-full border border-slate-200 px-4 py-2"
              value={categoryFilter === 'ALL' ? 'ALL' : String(categoryFilter)}
              onChange={(event) => {
                const next = event.target.value === 'ALL' ? 'ALL' : Number(event.target.value);
                setCategoryFilter(next);
              }}
            >
              <option value="ALL">全部自产件</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
            onClick={() => setShowProductModal(true)}
          >
            新建产品
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl">
              <span className="font-semibold text-slate-900">自产外壳图库</span>
            </h2>
            <p className="text-sm text-slate-500">共 {filtered.length}</p>
          </div>
          {loading && <span className="text-sm text-slate-500">加载中…</span>}
        </div>
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</p>}
        {!loading && !filtered.length && (
          <p className="mt-6 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            暂无符合条件的自产件。
          </p>
        )}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pagedProducts.map((product) => {
            const imageUrl = resolveImageUrl(product.image);
            const isLowStock = Number(product.stock_quantity) <= Number(product.min_stock || 0);
            return (
              <div key={product.id} className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 shadow-inner">
                <div className="relative h-48 overflow-hidden rounded-t-2xl bg-slate-200">
                  {imageUrl ? (
                    <img src={imageUrl} alt={product.model_name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-center text-sm text-slate-500">
                      <span className="font-semibold">{product.model_name}</span>
                      <span className="text-xs">{product.internal_code}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">型号</p>
                    <p className="text-lg font-semibold text-slate-900">{product.model_name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                    <div>
                      <p className="text-xs text-slate-400">编号</p>
                      <p className="font-mono text-slate-800">{product.internal_code}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">单位</p>
                      <p>{product.unit || '个'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">库存</p>
                      <p className={`text-base font-semibold ${isLowStock ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {Number(product.stock_quantity).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">安全库存</p>
                      <p>{Number(product.min_stock || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="mt-auto flex gap-2 text-sm">
                    <button
                      type="button"
                      className="flex-1 rounded-full border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-100"
                      onClick={() => handleOpenAdjust(product, 'OUT')}
                    >
                      出库
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-full bg-slate-900 px-3 py-2 text-white hover:bg-slate-800"
                      onClick={() => handleOpenAdjust(product, 'IN')}
                    >
                      入库
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6">
          <Pagination
            page={currentPage}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
            pageSizeText={`${PAGE_SIZE} / 页`}
          />
        </div>
      </section>

      <Modal title={adjustMode === 'IN' ? '入库调整' : '出库调整'} open={Boolean(adjustProduct)} onClose={() => setAdjustProduct(null)}>
        {adjustProduct && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmitAdjust();
            }}
          >
            <div>
              <p className="text-sm text-slate-500">当前调整产品</p>
              <p className="text-lg font-semibold text-slate-900">{adjustProduct.model_name}</p>
              <p className="text-xs text-slate-500">{adjustProduct.internal_code}</p>
            </div>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block">数量</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                value={adjustQty}
                onChange={(event) => setAdjustQty(event.target.value)}
                required
              />
            </label>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block">备注（可选）</span>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                rows={2}
                value={adjustNote}
                onChange={(event) => setAdjustNote(event.target.value)}
                placeholder="记录仓库、原因等信息"
              />
            </label>
            {adjustError && <p className="text-sm text-rose-600">{adjustError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
                onClick={() => setAdjustProduct(null)}
                disabled={adjustSaving}
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={adjustSaving}
              >
                {adjustSaving ? '提交中…' : '确认调整'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal title="新建自产件" open={showProductModal} onClose={() => setShowProductModal(false)}>
        <ProductForm
          categories={selfMadeCategories.length ? selfMadeCategories : categories}
          defaultCategoryId={selfMadeCategories[0]?.id ?? categoryOptions[0]?.value}
          onSuccess={() => {
            setShowProductModal(false);
            onRefresh();
            onRefreshCategories?.();
          }}
        />
      </Modal>
    </div>
  );
}
