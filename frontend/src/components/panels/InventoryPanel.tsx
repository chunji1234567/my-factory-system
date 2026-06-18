import { useEffect, useMemo, useState } from 'react';
import CategoryForm from '../CategoryForm';
import ProductForm from '../ProductForm';
import Modal from '../common/Modal';
import Pagination from '../common/Pagination';
import type { CategoryResponse } from '../../hooks/useCategories';
import type { InventoryProduct } from '../../types';
import { Card, PageHeader, Pill, SearchableSelect } from '../primitives';
// InventoryProduct 的字段名（internalCode / modelName / stockQuantity / minStock）
// 已经与 AdjustModals 的 AdjustableProduct 对齐——可以直接传，无需 mapping。
import { SingleAdjustModal, BatchAdjustModal } from './inventory/AdjustModals';

/**
 * 库存中心（Stage C-6 redesign v2，2026-06-18）。
 *
 * 真实使用场景（用户 2026-06-18 反馈澄清）：
 *   * 有了收货 + 排产自动扣料后，手工出入库已经非常少
 *   * 但 30 分类 × 40 物料 = 1200+ 物料，找物料的主要方式是「按名字/编号搜」
 *   * 偶尔出现"多件同类型同时入库/出库"——典型是线材/外壳这种自产件
 *
 * 因此本面板设计：
 *   1. **搜索优先**：顶部一个大搜索框（按物料名 / 内部编号 / 分类名匹配）
 *   2. **分类是回退**：右侧 SearchableSelect 切分类（30 项无法 Pill row 一行装下）
 *   3. **紧凑列表**：每件物料 = 一行（不是 Card 网格），扫视密度 3 倍
 *   4. **单件调整为主**：行右侧「调整」按钮 → 单件 Modal（类型 radio + 数量 + 备注）
 *   5. **多件批量是 modal-only**：顶部「多件批量调整」按钮 → batch Modal，
 *      内部用 SearchableSelect 加物料 + per-row 数量 + 全局类型 + 全局备注。
 *      不再做"全部填 X"快捷键——实际入库数字常为千万级，每件独立。
 *   6. **分页 50/页**：让 1200 物料的浏览不至于无限滚动
 *
 * 业务背景：StockAdjustment 是 append-only 事件，录后不可改/删——
 * 反向冲销的设计在 docs/PRD.md §3.1。错了请录反向类型。
 */

const INVENTORY_TYPES = ['RAW_MATERIAL', 'CABLE'] as const;
const PAGE_SIZE = 50;

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
  const rawCategories = useMemo(
    () => categories.filter((cat) => INVENTORY_TYPES.includes(cat.category_type as any)),
    [categories],
  );

  const inventoryProducts = useMemo(
    () =>
      products.filter(
        (p) => INVENTORY_TYPES.includes(p.categoryType as any) || p.categoryId === 0,
      ),
    [products],
  );

  // --- 搜索 + 筛选 + 分页 ---
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>(''); // '' = 全部
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return inventoryProducts.filter((p) => {
      if (categoryId && p.categoryId !== Number(categoryId)) return false;
      if (!kw) return true;
      return (
        p.modelName.toLowerCase().includes(kw) ||
        p.internalCode.toLowerCase().includes(kw) ||
        (p.category ?? '').toLowerCase().includes(kw)
      );
    });
  }, [inventoryProducts, search, categoryId]);

  const pagedRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  // 筛选变化时回第 1 页
  const onSearchChange = (v: string) => {
    setSearch(v);
    setPage(1);
  };
  const onCategoryChange = (v: string) => {
    setCategoryId(v);
    setPage(1);
  };
  const resetFilters = () => {
    setSearch('');
    setCategoryId('');
    setPage(1);
  };

  // --- 新建分类 / 产品 Modal ---
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  // --- 单件调整 Modal ---
  const [singleModal, setSingleModal] = useState<{ open: boolean; product: InventoryProduct | null }>({
    open: false,
    product: null,
  });
  const openSingleModal = (product: InventoryProduct) =>
    setSingleModal({ open: true, product });
  const closeSingleModal = () => setSingleModal({ open: false, product: null });

  // --- 多件批量 Modal ---
  const [batchOpen, setBatchOpen] = useState(false);

  // SearchableSelect 用的分类选项（'' = 全部由组件内自加）
  const categoryFilterOptions = useMemo(
    () =>
      rawCategories.map((c) => ({
        value: String(c.id),
        label: c.name,
      })),
    [rawCategories],
  );

  return (
    <div className="space-y-section-gap animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="库存中心"
        description="原材料与线材的实时库存与手工调整"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowCategoryModal(true)}
              className="rounded-pill border border-line-strong text-ink-body px-4 py-2 text-caption font-bold
                         hover:bg-surface-subtle hover:border-line-focus transition-all"
            >
              + 新建分类
            </button>
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
              多件批量调整
            </button>
          </div>
        }
      />

      {/* 筛选区：搜索为主 + 分类下拉为辅 */}
      <Card flat tone="subtle" padding="tight">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex-1">
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="按物料名 / 内部编号 / 分类名搜索..."
              className="w-full rounded-input border border-line bg-surface px-4 py-2 text-body outline-none
                         focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
            />
          </div>
          <div className="w-full md:w-64">
            <SearchableSelect
              options={categoryFilterOptions}
              value={categoryId}
              onChange={onCategoryChange}
              placeholder="所有分类（可搜索）"
            />
          </div>
          {(search || categoryId) && (
            <button
              onClick={resetFilters}
              className="text-micro text-ink-faint hover:text-ink-body underline shrink-0 self-start md:self-auto"
            >
              重置
            </button>
          )}
        </div>
      </Card>

      {/* 列表 */}
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
            {search || categoryId ? '没有匹配的物料' : '暂无库存物料'}
          </p>
        </Card>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <Card padding="none">
            {/* 表头 */}
            <div className="hidden md:grid grid-cols-[8rem_minmax(0,1fr)_8rem_8rem_7rem] gap-3 px-5 py-2.5 border-b border-line text-micro font-bold text-ink-faint uppercase tracking-wider bg-surface-subtle/40">
              <span>内部编号</span>
              <span>型号</span>
              <span className="text-right">库存</span>
              <span className="text-right">安全</span>
              <span className="text-right">操作</span>
            </div>
            {/* 行 */}
            <div className="divide-y divide-line">
              {pagedRows.map((p) => (
                <InventoryRow key={p.id} product={p} onAdjust={() => openSingleModal(p)} />
              ))}
            </div>
          </Card>

          <div className="flex items-center justify-between text-micro text-ink-faint">
            <span>
              共 {filtered.length} 件 · 第 {page} / {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))} 页
            </span>
          </div>
          <Pagination page={page} total={filtered.length} onPageChange={setPage} />
        </>
      )}

      {/* 单件调整 Modal */}
      <SingleAdjustModal
        open={singleModal.open}
        product={singleModal.product}
        onClose={closeSingleModal}
        onSuccess={() => {
          closeSingleModal();
          onRefreshProducts?.();
        }}
      />

      {/* 多件批量调整 Modal */}
      <BatchAdjustModal
        open={batchOpen}
        products={inventoryProducts}
        onClose={() => setBatchOpen(false)}
        onSuccess={() => {
          setBatchOpen(false);
          onRefreshProducts?.();
        }}
      />

      {/* 新建分类 Modal */}
      <Modal
        title="新建物料分类"
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        maxWidth="max-w-md"
      >
        <CategoryForm
          onSuccess={() => {
            onRefreshCategories?.();
            setShowCategoryModal(false);
          }}
        />
      </Modal>

      {/* 新建产品 Modal */}
      <Modal
        title="登记新原材料"
        open={showProductModal}
        onClose={() => setShowProductModal(false)}
        maxWidth="max-w-lg"
      >
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

// ============================================================================
// 紧凑物料行
// ============================================================================

interface InventoryRowProps {
  product: InventoryProduct;
  onAdjust: () => void;
}

function InventoryRow({ product, onAdjust }: InventoryRowProps) {
  const isLowStock = product.stockQuantity < product.minStock;

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-[8rem_minmax(0,1fr)_8rem_8rem_7rem] gap-x-3 gap-y-1 px-5 py-3
                 hover:bg-surface-subtle/40 transition-colors items-center"
    >
      {/* 内部编号 */}
      <span className="text-micro font-mono text-ink-faint md:text-caption">
        {product.internalCode}
      </span>
      {/* 型号 */}
      <div className="col-span-2 md:col-span-1 min-w-0 flex items-center gap-2">
        <p className="text-body font-bold text-ink truncate" title={product.modelName}>
          {product.modelName}
        </p>
        {isLowStock && <Pill tone="danger">低于安全</Pill>}
      </div>
      {/* 库存 */}
      <div className="md:text-right">
        <span className="md:hidden text-micro text-ink-faint mr-1">库存</span>
        <span
          className={`font-mono font-bold ${
            isLowStock ? 'text-danger' : 'text-ink'
          }`}
        >
          {product.stockQuantity.toLocaleString()}
        </span>
      </div>
      {/* 安全库存 */}
      <div className="md:text-right">
        <span className="md:hidden text-micro text-ink-faint mr-1">安全</span>
        <span className="font-mono text-ink-muted">{product.minStock.toLocaleString()}</span>
      </div>
      {/* 操作 */}
      <div className="col-span-2 md:col-span-1 md:text-right">
        <button
          onClick={onAdjust}
          className="rounded-pill border border-line-strong text-ink-body px-4 py-1 text-micro font-bold
                     hover:bg-primary hover:text-on-primary hover:border-primary transition-all whitespace-nowrap"
        >
          调整库存
        </button>
      </div>
    </div>
  );
}
