import { useEffect, useMemo, useState } from 'react';
import type { ProductResponse } from '../../hooks/useProducts';
import type { CategoryResponse } from '../../hooks/useCategories';
import Pagination from '../common/Pagination';
import Modal from '../common/Modal';
import ProductForm from '../ProductForm';
import { Card, PageHeader, Pill, SearchableSelect } from '../primitives';
import {
  SingleAdjustModal,
  BatchAdjustModal,
  type AdjustableProduct,
} from './inventory/AdjustModals';

/**
 * 自产件图库（Stage C-7 redesign，2026-06-18）。
 *
 * 业务定位（用户 2026-06-18 反馈澄清）：
 *   * 主用途是**用图片"认识"外壳/线材** —— 仓管员看图找货
 *   * 自产件入库出库经常一批多个（线材 + 外壳一起做的一批送进仓）
 *   * 因此需要：
 *     - 图卡为主视觉
 *     - 单件可调（出 / 入）
 *     - 多件批量出入一次性提交
 *
 * 改造要点（详见 docs/ux-audit.md §2.7）：
 *   1. PageHeader 替换自造 h2 + 副标题；右侧 actions = [+新建产品] [多件批量出入]
 *   2. 标题"自产外壳图库"改"自产件图库"（含 SELF_MADE 外壳 + CABLE 线材）
 *   3. 图卡：Card primitive 替代 rounded-2xl bg-slate-50 shadow-inner
 *      - 图位上半，库存数字 + 出/入按钮在下半
 *      - 单位 / 安全库存折叠到副信息（hover/小字），首屏不显著
 *   4. 单件调整与批量调整 Modal 直接复用 inventory/AdjustModals 同款
 *      —— 与 InventoryPanel 完全对称，UX 跨页一致
 *   5. design tokens 全面铺开（slate / emerald / rose 退场）
 */

const SELF_MADE_TYPES = ['SELF_MADE', 'CABLE'] as const;
const PAGE_SIZE = 12;

interface Props {
  products: ProductResponse[];
  categories: CategoryResponse[];
  loading: boolean;
  error: string | null;
  onRefresh(): void;
  onRefreshCategories?: () => void;
}

/** 把后端的 snake_case ProductResponse 拍平成 AdjustModals 要的 camelCase 接口。 */
function toAdjustable(p: ProductResponse): AdjustableProduct {
  return {
    id: p.id,
    internalCode: p.internal_code,
    modelName: p.model_name,
    stockQuantity: Number(p.stock_quantity),
    minStock: Number(p.min_stock),
  };
}

export default function SelfMadeGalleryPanel({
  products,
  categories,
  loading,
  error,
  onRefresh,
  onRefreshCategories,
}: Props) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(''); // '' = 全部
  const [page, setPage] = useState(1);

  const [adjustProduct, setAdjustProduct] = useState<ProductResponse | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  // 范围内的产品 / 分类
  const selfMadeProducts = useMemo(
    () =>
      products.filter((p) =>
        SELF_MADE_TYPES.includes((p.category_detail?.category_type ?? '') as any),
      ),
    [products],
  );

  const selfMadeCategories = useMemo(
    () => categories.filter((c) => SELF_MADE_TYPES.includes(c.category_type as any)),
    [categories],
  );

  const categoryOptions = useMemo(() => {
    // 1. 优先使用 selfMadeCategories；2. 否则从 products 推导（兼容老数据）
    if (selfMadeCategories.length) {
      return selfMadeCategories.map((c) => ({ value: String(c.id), label: c.name }));
    }
    const map = new Map<number, string>();
    selfMadeProducts.forEach((p) => {
      const id = p.category_detail?.id;
      if (id != null && !map.has(id)) {
        map.set(id, p.category_detail?.name ?? '未分类');
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({
      value: String(id),
      label: name,
    }));
  }, [selfMadeCategories, selfMadeProducts]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return selfMadeProducts.filter((p) => {
      if (categoryFilter && String(p.category_detail?.id ?? '') !== categoryFilter) {
        return false;
      }
      if (!kw) return true;
      return (
        p.model_name.toLowerCase().includes(kw) ||
        p.internal_code.toLowerCase().includes(kw)
      );
    });
  }, [selfMadeProducts, search, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  // 全部自产件 → AdjustableProduct（给批量 Modal 的可加列表用）
  const adjustablePool = useMemo(
    () => selfMadeProducts.map(toAdjustable),
    [selfMadeProducts],
  );

  // 图片路径解析
  const imageBase =
    import.meta.env.VITE_API_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const resolveImageUrl = (path?: string | null) => {
    if (!path) return null;
    if (/^https?:/i.test(path) || path.startsWith('data:')) return path;
    return `${imageBase}${path}`;
  };

  const resetFilters = () => {
    setSearch('');
    setCategoryFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-section-gap animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="自产件图库"
        description="外壳与线材的图片库，按图认料"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowProductModal(true)}
              className="rounded-pill border border-line-strong text-ink-body px-4 py-2 text-caption font-bold
                         hover:bg-surface-subtle hover:border-line-focus transition-all"
            >
              + 新建产品
            </button>
            <button
              onClick={() => setBatchOpen(true)}
              className="rounded-pill bg-primary text-on-primary px-5 py-2 text-caption font-bold
                         hover:bg-primary-hover active:scale-95 transition-all shadow-card"
            >
              多件批量出入
            </button>
          </div>
        }
      />

      {/* 筛选区 */}
      <Card flat tone="subtle" padding="tight">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="按型号 / 编号搜索..."
              className="w-full rounded-input border border-line bg-surface px-4 py-2 text-body outline-none
                         focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
            />
          </div>
          <div className="w-full md:w-64">
            <SearchableSelect
              options={categoryOptions}
              value={categoryFilter}
              onChange={setCategoryFilter}
              placeholder="所有自产件分类"
            />
          </div>
          {(search || categoryFilter) && (
            <button
              onClick={resetFilters}
              className="text-micro text-ink-faint hover:text-ink-body underline shrink-0 self-start md:self-auto"
            >
              重置
            </button>
          )}
        </div>
      </Card>

      {/* 状态 / 数据 */}
      {error && (
        <Card tone="danger" padding="tight">
          <p className="text-caption text-danger-ink">⚠ {error}</p>
        </Card>
      )}

      {loading && !error && (
        <Card>
          <p className="text-center text-caption text-ink-faint py-8">加载中...</p>
        </Card>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Card>
          <p className="text-center text-caption text-ink-faint py-10">
            {search || categoryFilter ? '没有匹配的自产件' : '暂无自产件'}
          </p>
        </Card>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <p className="text-micro text-ink-faint">
            共 {filtered.length} 件 · 第 {currentPage} / {totalPages} 页
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pagedProducts.map((product) => (
              <GalleryCard
                key={product.id}
                product={product}
                imageUrl={resolveImageUrl(product.image)}
                onAdjust={() => setAdjustProduct(product)}
              />
            ))}
          </div>
          <Pagination page={currentPage} total={filtered.length} onPageChange={setPage} />
        </>
      )}

      {/* 单件调整 Modal —— 复用 InventoryPanel 同款 */}
      <SingleAdjustModal
        open={Boolean(adjustProduct)}
        product={adjustProduct ? toAdjustable(adjustProduct) : null}
        onClose={() => setAdjustProduct(null)}
        onSuccess={() => {
          setAdjustProduct(null);
          onRefresh();
        }}
        title="调整自产件库存"
      />

      {/* 多件批量 Modal —— 复用 InventoryPanel 同款 */}
      <BatchAdjustModal
        open={batchOpen}
        products={adjustablePool}
        onClose={() => setBatchOpen(false)}
        onSuccess={() => {
          setBatchOpen(false);
          onRefresh();
        }}
        title="多件自产件批量出入"
        pickerPlaceholderPrefix="继续添加自产件"
      />

      {/* 新建产品 Modal */}
      <Modal
        title="新建自产件"
        open={showProductModal}
        onClose={() => setShowProductModal(false)}
        maxWidth="max-w-lg"
      >
        <ProductForm
          categories={selfMadeCategories.length ? selfMadeCategories : categories}
          defaultCategoryId={selfMadeCategories[0]?.id}
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

// ============================================================================
// 图卡
// ============================================================================

interface GalleryCardProps {
  product: ProductResponse;
  imageUrl: string | null;
  onAdjust: () => void;
}

function GalleryCard({ product, imageUrl, onAdjust }: GalleryCardProps) {
  const stock = Number(product.stock_quantity);
  const minStock = Number(product.min_stock || 0);
  const isLowStock = stock <= minStock;
  const categoryName = product.category_detail?.name;

  return (
    <Card padding="none" interactive className="flex flex-col overflow-hidden">
      {/* 图位 */}
      <div className="relative aspect-[4/3] bg-surface-muted overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.model_name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-surface-muted to-surface-subtle text-ink-faint text-center px-3">
            <span className="text-caption font-bold text-ink-body">{product.model_name}</span>
            <span className="text-micro font-mono mt-1">{product.internal_code}</span>
          </div>
        )}
        {categoryName && (
          <div className="absolute top-2 left-2">
            <Pill tone="muted" outline>
              {categoryName}
            </Pill>
          </div>
        )}
        {isLowStock && (
          <div className="absolute top-2 right-2">
            <Pill tone="danger">低于安全</Pill>
          </div>
        )}
      </div>

      {/* 信息 + 操作 */}
      <div className="flex flex-col gap-3 p-4 flex-1">
        <div>
          <p className="text-body font-bold text-ink truncate" title={product.model_name}>
            {product.model_name}
          </p>
          <p className="text-micro font-mono text-ink-faint mt-0.5">{product.internal_code}</p>
        </div>

        {/* 库存数字 */}
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-micro text-ink-faint uppercase">库存</p>
            <p
              className={`text-heading font-mono font-bold leading-none ${
                isLowStock ? 'text-danger' : 'text-ink'
              }`}
            >
              {stock.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-micro text-ink-faint uppercase">安全</p>
            <p className="text-caption font-mono text-ink-muted">
              {minStock.toLocaleString()} {product.unit || '个'}
            </p>
          </div>
        </div>

        {/* 操作按钮 */}
        <button
          onClick={onAdjust}
          className="mt-auto w-full rounded-pill border border-line-strong text-ink-body py-1.5 text-caption font-bold
                     hover:bg-primary hover:text-on-primary hover:border-primary transition-all"
        >
          调整库存
        </button>
      </div>
    </Card>
  );
}
