import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { InventoryProduct } from '../types';

const adjustmentOptions = [
  { value: 'MANUAL_IN', label: '手动入库/盘盈' },
  { value: 'MANUAL_OUT', label: '手动出库/盘亏' },
  { value: 'PRODUCE_IN', label: '生产入库' },
];

interface Props {
  products: InventoryProduct[];
  onSuccess?: () => void;
}

export default function StockAdjustmentForm({ products, onSuccess }: Props) {
  const [productId, setProductId] = useState(products[0]?.id.toString() ?? '');
  const [type, setType] = useState('MANUAL_IN');
  const [quantity, setQuantity] = useState('0');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!productId && products[0]) {
      setProductId(products[0].id.toString());
    }
  }, [products, productId]);

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!productId) return;
    setLoading(true);
    setMessage(null);
    try {
      await api.createStockAdjustment({
        product: Number(productId),
        adjustment_type: type,
        quantity: Number(quantity),
        note,
      });
      setMessage('库存调整成功');
      setQuantity('0');
      setNote('');
      onSuccess?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-slate-900">库存调整</h3>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 text-sm text-slate-700">
        <label className="block">
          <span className="text-slate-500">选择物料</span>
          <select
            value={productId}
            onChange={(evt) => setProductId(evt.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            required
          >
            {products.map((prod) => (
              <option key={prod.id} value={prod.id}>
                {prod.modelName} ({prod.internalCode})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-slate-500">调整类型</span>
          <select
            value={type}
            onChange={(evt) => setType(evt.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          >
            {adjustmentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-slate-500">数量</span>
          <input
            type="number"
            value={quantity}
            onChange={(evt) => setQuantity(evt.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            required
          />
        </label>
        <label className="block">
          <span className="text-slate-500">备注</span>
          <input
            value={note}
            onChange={(evt) => setNote(evt.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="可选"
          />
        </label>
        {message && (
          <p className={`text-sm ${message.includes('成功') ? 'text-emerald-600' : 'text-rose-600'}`}>
            {message}
          </p>
        )}
        <button
          type="submit"
          className="rounded-xl bg-slate-900 px-4 py-2 text-white font-semibold disabled:opacity-60"
          disabled={loading || !productId}
        >
          {loading ? '提交中…' : '提交调整'}
        </button>
      </form>
    </section>
  );
}
