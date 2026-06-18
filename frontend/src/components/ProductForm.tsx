import { useState } from 'react';
import { api } from '../api/client';
import type { CategoryResponse } from '../hooks/useCategories';
import { Card, Section, SearchableSelect } from './primitives';

/**
 * 新建产品（物料）表单（Stage C-6 redesign，2026-06-18）。
 *
 * 渲染在 Modal 内部，自带 submit 按钮（不走 Modal.footer）。
 *
 * 改造要点：
 *   - 分类下拉用 SearchableSelect（30 分类时可搜索）
 *   - 全部字段 design tokens + 紧凑 grid 排版
 *   - Card tone="danger" 替代手写 rose 错误提示
 *   - 图片上传统一到 design tokens 的虚线占位框
 *
 * 数据契约：图片走 multipart/form-data，文本走 application/json。
 * api.createProduct 接口能同时处理两种 payload（详见 api/client.ts）。
 */

const FIELD_LABEL_CLS = 'text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5';
const INPUT_CLS =
  'w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none ' +
  'focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors';

interface Props {
  categories: CategoryResponse[];
  onSuccess?: () => void;
  defaultCategoryId?: number | null;
}

export default function ProductForm({ categories, onSuccess, defaultCategoryId }: Props) {
  const initialCat = defaultCategoryId ?? categories[0]?.id ?? 0;
  const [category, setCategory] = useState<string>(initialCat ? String(initialCat) : '');
  const [internalCode, setInternalCode] = useState('');
  const [modelName, setModelName] = useState('');
  const [unit, setUnit] = useState('个');
  const [stock, setStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!category) {
      setError('请先选择或创建分类');
      return;
    }
    if (!internalCode.trim() || !modelName.trim()) {
      setError('内部编号 / 规格型号 必填');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const catId = Number(category);
      if (imageFile) {
        const fd = new FormData();
        fd.append('category', String(catId));
        fd.append('internal_code', internalCode.trim());
        fd.append('model_name', modelName.trim());
        fd.append('unit', unit);
        fd.append('stock_quantity', stock);
        fd.append('min_stock', minStock);
        fd.append('image', imageFile);
        await api.createProduct(fd);
      } else {
        await api.createProduct({
          category: catId,
          internal_code: internalCode.trim(),
          model_name: modelName.trim(),
          unit,
          stock_quantity: Number(stock),
          min_stock: Number(minStock),
        });
      }
      // 清空可重复输入的字段，保留 category / unit
      setInternalCode('');
      setModelName('');
      setStock('0');
      setMinStock('0');
      setImageFile(null);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-section-gap">
      <Section title="基础信息">
        <div className="space-y-3">
          <div className="space-y-1">
            <span className={FIELD_LABEL_CLS}>分类</span>
            <SearchableSelect
              options={categoryOptions}
              value={category}
              onChange={setCategory}
              placeholder="请选择分类（可搜索）"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>内部编号</span>
              <input
                value={internalCode}
                onChange={(e) => setInternalCode(e.target.value)}
                className={`${INPUT_CLS} font-mono`}
                placeholder="例：R0805-1K"
                required
              />
            </div>
            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>规格型号</span>
              <input
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className={INPUT_CLS}
                placeholder="例：电阻 1KΩ 0805"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>单位</span>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={INPUT_CLS}
                placeholder="个"
              />
            </div>
            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>初始库存</span>
              <input
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className={`${INPUT_CLS} font-mono text-right`}
              />
            </div>
            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>安全库存</span>
              <input
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className={`${INPUT_CLS} font-mono text-right`}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title="展示图（可选）">
        <label
          htmlFor="product-image"
          className="block rounded-card border-2 border-dashed border-line bg-surface-subtle/40 px-4 py-6
                     cursor-pointer hover:border-line-focus hover:bg-surface-subtle transition-colors text-center"
        >
          {imageFile ? (
            <p className="text-body text-ink truncate">
              已选 <span className="font-mono">{imageFile.name}</span>
            </p>
          ) : (
            <p className="text-caption text-ink-faint">
              点击上传图片（自产件图库会用到，原材料可不传）
            </p>
          )}
          <input
            id="product-image"
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>
      </Section>

      {error && (
        <Card tone="danger" padding="tight" flat>
          <p className="text-caption text-danger-ink">⚠ {error}</p>
        </Card>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="rounded-pill bg-primary text-on-primary px-8 py-2 text-caption font-bold
                     hover:bg-primary-hover active:scale-95 transition-all
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? '提交中...' : '创建产品'}
        </button>
      </div>
    </form>
  );
}
