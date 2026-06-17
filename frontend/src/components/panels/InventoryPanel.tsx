import { useState, useMemo, useEffect } from 'react';
import ProductTable from '../ProductTable';
import CategoryForm from '../CategoryForm';
import ProductForm from '../ProductForm';
import Modal from '../common/Modal';
import FilterBar from '../common/FilterBar';
import NavbarButton from '../common/NavbarButton';
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
  // 库存中心覆盖的分类：原材料 + 线材半成品。
  // 业务上：原材料是采购来的，线材是自家工坊产的，但两者都通过 MANUAL_IN 录入库存
  // 并支持盘盈/盘亏，所以放同一个面板管理。详见 docs/PRD.md §3.1（CABLE 分类）。
  const INVENTORY_TYPES = ['RAW_MATERIAL', 'CABLE'] as const;
  const rawCategories = useMemo(() => {
    const source = categories.length ? categories : [];
    return source.filter((cat) => INVENTORY_TYPES.includes(cat.category_type as any));
  }, [categories]);

  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'ALL'>('ALL');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [bulkType, setBulkType] = useState<StockAdjustmentType>('MANUAL_IN');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return products.filter((item) => {
      const matchesCategory = selectedCategoryId === 'ALL'
        ? (INVENTORY_TYPES.includes(item.categoryType as any) || item.categoryId === 0)
        : item.categoryId === selectedCategoryId;
      const matchesSearch = !search ||
        item.modelName.toLowerCase().includes(search.toLowerCase()) ||
        item.internalCode.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategoryId, search]);

  const grouped = useMemo(() => {
    const map = new Map<number, { category: CategoryResponse; items: InventoryProduct[] }>();
    filtered.forEach((item) => {
      const cat = rawCategories.find((c) => c.id === item.categoryId) || {
        id: item.categoryId ?? 0,
        name: item.category || '未分类',
        category_type: 'RAW_MATERIAL',
      };
      if (!map.has(cat.id)) map.set(cat.id, { category: cat as CategoryResponse, items: [] });
      map.get(cat.id)!.items.push(item);
    });
    return Array.from(map.values()).sort((a, b) => a.category.name.localeCompare(b.category.name));
  }, [filtered, rawCategories]);

  const selectedProducts = useMemo(() => 
    products.filter((item) => selectedIds.has(item.id))
  , [products, selectedIds]);

  const handleToggleProduct = (product: InventoryProduct) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
        const { [product.id]: _, ...rest } = quantities;
        setQuantities(rest);
      } else {
        next.add(product.id);
      }
      return next;
    });
  };

  const handleBulkSubmit = async () => {
    // ... 保持原有 handleBulkSubmit 逻辑 ...
    if (!selectedProducts.length) return;
    setBulkLoading(true);
    try {
      for (const p of selectedProducts) {
        await api.createStockAdjustment({
          product: p.id,
          adjustment_type: bulkType,
          quantity: Number(quantities[p.id]),
          note: '批量操作',
        });
      }
      setBulkMessage('✅ 批量入库/平仓成功');
      setSelectedIds(new Set());
      setQuantities({});
      onRefreshProducts?.();
    } catch (err: any) {
      setBulkMessage(err.message || '操作失败');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* 1. 顶部筛选与全局动作 */}
      <FilterBar actions={
        <div className="flex gap-3">
          <NavbarButton variant="outline" onClick={() => setShowCategoryModal(true)}>
            新建分类
          </NavbarButton>
          <NavbarButton onClick={() => setShowProductModal(true)}>
            新建产品
          </NavbarButton>
        </div>
      }>
        <FilterBar.Field label="搜索产品名称/内部编号">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-full border border-slate-200 px-6 py-3 text-[15px] font-bold outline-none focus:border-slate-900 transition-all"
            placeholder="输入关键词..."
          />
        </FilterBar.Field>
        
        <FilterBar.Field label="原材料分类">
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
            className="w-full rounded-full border border-slate-200 px-6 py-3 text-[15px] font-bold outline-none focus:border-slate-900 bg-white"
          >
            <option value="ALL">显示全部</option>
            {rawCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </FilterBar.Field>
      </FilterBar>

      {/* 2. 批量操作面板 (仅在选中时出现) */}
      {selectedProducts.length > 0 && (
        <section className="bg-amber-50 rounded-[2rem] border border-amber-100 p-6 md:p-8 shadow-xl shadow-amber-900/5 animate-in slide-in-from-top-4 duration-300">
          {/* 不可逆提醒：StockAdjustment 是 append-only 事件，录后不可改/删，错了请录反向调整冲销。 */}
          <div className="mb-5 rounded-2xl border-2 border-rose-200 bg-rose-50/60 px-5 py-3 flex gap-3 items-start">
            <span className="text-rose-500 text-xl leading-none mt-0.5">⚠</span>
            <div className="text-xs md:text-sm text-rose-900 leading-relaxed">
              <p className="font-bold">提交后无法修改或删除</p>
              <p className="text-rose-700/90">
                每次出入库都是一笔历史事件，会立即改变产品库存数字。如果录错，请新加一笔
                <span className="font-bold">反向类型</span>
                （如把"出库 100"误录成"入库 100"，需再录一笔"出库 100"冲销）。请仔细核对数量和类型后再提交。
              </p>
            </div>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <p className="text-lg font-black text-slate-900">
                  已选择 {selectedProducts.length} 项原材料
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedProducts.map((p) => (
                  <span key={p.id} className="px-3 py-1 bg-white/80 rounded-full text-xs font-bold text-slate-500 border border-amber-200/50">
                    {p.modelName}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <select
                value={bulkType}
                onChange={(e) => setBulkType(e.target.value as StockAdjustmentType)}
                className="w-full sm:w-auto rounded-full border-2 border-amber-200 px-6 py-3 text-sm font-black text-slate-700 bg-white outline-none focus:border-slate-900 transition-all"
              >
                {stockAdjustmentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <NavbarButton 
                onClick={handleBulkSubmit}
                disabled={bulkLoading}
                className="w-full sm:w-auto px-8 py-3 bg-slate-900 text-white shadow-lg shadow-slate-900/20"
              >
                {bulkLoading ? '处理中...' : '确认批量调整'}
              </NavbarButton>
              <button onClick={() => setSelectedIds(new Set())} className="text-sm font-bold text-slate-400 hover:text-rose-500 px-2 transition-colors">
                清空
              </button>
            </div>
          </div>
          {bulkMessage && (
            <p className={`mt-4 text-sm font-black ${bulkMessage.includes('成功') ? 'text-emerald-600' : 'text-rose-600'}`}>
              {bulkMessage}
            </p>
          )}
        </section>
      )}

      {/* 3. 数据列表显示 */}
      <div className="space-y-10">
        {loading && (
          <div className="py-20 text-center animate-pulse text-slate-300 font-black tracking-widest uppercase">
            正在同步库存数据...
          </div>
        )}
        
        {grouped.length === 0 && !loading && (
          <div className="py-32 text-center bg-white rounded-[3rem] border border-slate-100 border-dashed">
            <p className="text-slate-400 font-medium italic">当前分类下暂无匹配产品</p>
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.category.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             {/* ProductTable 内部也应该对齐这种大圆角风格 */}
            <ProductTable
              products={group.items}
              loading={loading}
              title={group.category.name}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleProduct}
              quantities={quantities}
              onQuantityChange={(id, val) => setQuantities(prev => ({ ...prev, [id]: val }))}
            />
          </div>
        ))}
      </div>

      {/* 4. 模态框 */}
      <Modal title="新建物料分类" open={showCategoryModal} onClose={() => setShowCategoryModal(false)}>
        <CategoryForm onSuccess={() => { onRefreshCategories?.(); setShowCategoryModal(false); }} />
      </Modal>

      <Modal title="登记新原材料" open={showProductModal} onClose={() => setShowProductModal(false)}>
        <ProductForm categories={rawCategories} onSuccess={() => { onRefreshProducts?.(); setShowProductModal(false); }} />
      </Modal>

    </div>
  );
}