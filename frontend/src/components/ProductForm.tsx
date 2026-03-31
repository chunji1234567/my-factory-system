import { useState } from 'react';
import { api } from '../api/client';
import type { CategoryResponse } from '../hooks/useCategories';

interface Props {
  categories: CategoryResponse[];
  onSuccess?: () => void;
  defaultCategoryId?: number | null;
}

export default function ProductForm({ categories, onSuccess, defaultCategoryId }: Props) {
  const [category, setCategory] = useState(defaultCategoryId ?? categories[0]?.id ?? 0);
  const [internalCode, setInternalCode] = useState('');
  const [modelName, setModelName] = useState('');
  const [unit, setUnit] = useState('个');
  const [stock, setStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!category) {
      setMessage('请先创建分类');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      if (imageFile) {
        const formData = new FormData();
        formData.append('category', String(category));
        formData.append('internal_code', internalCode);
        formData.append('model_name', modelName);
        formData.append('unit', unit);
        formData.append('stock_quantity', stock);
        formData.append('min_stock', minStock);
        formData.append('image', imageFile);
        await api.createProduct(formData);
      } else {
        await api.createProduct({
          category,
          internal_code: internalCode,
          model_name: modelName,
          unit,
          stock_quantity: Number(stock),
          min_stock: Number(minStock),
        });
      }
      setInternalCode('');
      setModelName('');
      setImageFile(null);
      setMessage('产品创建成功');
      onSuccess?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm text-slate-700">
      <label className="block">
        <span className="text-slate-500">分类</span>
        <select
          value={category}
          onChange={(evt) => setCategory(Number(evt.target.value))}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          required
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-slate-500">内部编号</span>
        <input
          value={internalCode}
          onChange={(evt) => setInternalCode(evt.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          required
        />
      </label>
      <label className="block">
        <span className="text-slate-500">规格型号</span>
        <input
          value={modelName}
          onChange={(evt) => setModelName(evt.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          required
        />
      </label>
      <label className="block">
        <span className="text-slate-500">单位</span>
        <input
          value={unit}
          onChange={(evt) => setUnit(evt.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-slate-500">初始库存</span>
        <input
          type="number"
          value={stock}
          onChange={(evt) => setStock(evt.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-slate-500">安全库存</span>
        <input
          type="number"
          value={minStock}
          onChange={(evt) => setMinStock(evt.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-slate-500">展示图（可选）</span>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setImageFile(file);
          }}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
        />
      </label>
      {message && (
        <p className={`text-sm ${message.includes('成功') ? 'text-emerald-600' : 'text-rose-600'}`}>
          {message}
        </p>
      )}
      <button
        type="submit"
        className="w-full rounded-xl bg-slate-900 px-4 py-2 text-white font-semibold disabled:opacity-60"
        disabled={loading}
      >
        {loading ? '提交中…' : '创建产品'}
      </button>
    </form>
  );
}
