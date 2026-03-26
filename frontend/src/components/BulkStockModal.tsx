import { useState, useEffect } from 'react';
import Modal from './common/Modal';
import { api } from '../api/client';
import type { ProductItem } from '../mockData';
import type { CategoryResponse } from '../hooks/useCategories';

interface Props {
  open: boolean;
  onClose(): void;
  products: ProductItem[];
  categories: CategoryResponse[];
  onSuccess?: () => void;
}

type Operation = {
  id: string;
  categoryId: number;
  productId: number;
  type: 'MANUAL_IN' | 'MANUAL_OUT' | 'PRODUCE_IN';
  quantity: string;
  note: string;
};

const typeOptions = [
  { value: 'MANUAL_IN', label: '入库/盘盈' },
  { value: 'MANUAL_OUT', label: '出库/盘亏' },
  { value: 'PRODUCE_IN', label: '生产入库' },
];

export default function BulkStockModal({ open, onClose, products, categories, onSuccess }: Props) {
  const defaultCategory = categories[0]?.id ?? (products[0]?.categoryId ?? 0);

  const createOperation = (): Operation => {
    const productForCategory = products.find((p) => p.categoryId === defaultCategory);
    return {
      id: crypto.randomUUID(),
      categoryId: defaultCategory,
      productId: productForCategory?.id ?? products[0]?.id ?? 0,
      type: 'MANUAL_IN',
      quantity: '0',
      note: '',
    };
  };

  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOperations([createOperation()]);
      setMessage(null);
    }
  }, [open]);

  const handleChange = (id: string, field: keyof Operation, value: string) => {
    setOperations((ops) =>
      ops.map((op) => {
        if (op.id !== id) return op;
        if (field === 'categoryId') {
          const numericValue = Number(value);
          const productForCategory = products.find((p) => p.categoryId === numericValue);
          return {
            ...op,
            categoryId: numericValue,
            productId: productForCategory?.id ?? 0,
          };
        }
        return { ...op, [field]: value };
      })
    );
  };

  const addRow = () => setOperations((ops) => [...ops, createOperation()]);
  const removeRow = (id: string) => setOperations((ops) => ops.filter((op) => op.id !== id));

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      for (const op of operations) {
        if (!op.productId) continue;
        await api.createStockAdjustment({
          product: op.productId,
          adjustment_type: op.type,
          quantity: Number(op.quantity),
          note: op.note,
        });
      }
      setMessage('批量操作成功');
      onSuccess?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '批量操作失败');
    } finally {
      setLoading(false);
    }
  };

  const productsByCategory = (categoryId: number) => {
    const list = products.filter((product) => product.categoryId === categoryId);
    return list.length ? list : products;
  };

  return (
    <Modal title="批量出/入库" open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 text-sm text-slate-700">
        <div className="max-h-64 space-y-3 overflow-auto">
          {operations.map((op) => {
            const categoryProducts = productsByCategory(op.categoryId);
            return (
              <div key={op.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-4">
                <select
                  value={op.categoryId}
                  onChange={(evt) => handleChange(op.id, 'categoryId', evt.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-2"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <select
                  value={op.productId}
                  onChange={(evt) => handleChange(op.id, 'productId', evt.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-2"
                >
                  {categoryProducts.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.modelName}
                    </option>
                  ))}
                </select>
                <select
                  value={op.type}
                  onChange={(evt) => handleChange(op.id, 'type', evt.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-2"
                >
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={op.quantity}
                    onChange={(evt) => handleChange(op.id, 'quantity', evt.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-2"
                    placeholder="数量"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(op.id)}
                    className="rounded-lg border border-slate-200 px-2 py-2 text-slate-600"
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <button type="button" onClick={addRow} className="rounded-full border border-slate-200 px-4 py-2 text-slate-700">
            添加一行
          </button>
          <button type="submit" className="rounded-full bg-slate-900 px-4 py-2 text-white" disabled={loading}>
            {loading ? '处理中…' : '提交全部'}
          </button>
        </div>
        {message && (
          <p className={`text-sm ${message.includes('成功') ? 'text-emerald-600' : 'text-rose-600'}`}>
            {message}
          </p>
        )}
      </form>
    </Modal>
  );
}
