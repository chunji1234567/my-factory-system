// src/components/common/OrderItemsEditor.tsx
import { Fragment } from 'react';

interface ItemDraft {
  category: string;
  product: string;
  price: string;
  quantity: string;
  // 销售单特有字段
  customName?: string;
  detailDescription?: string;
}

interface Props {
  items: ItemDraft[];
  onItemChange: (index: number, field: string, value: string) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  categoryOptions: { value: string; label: string }[];
  getProductOptions: (categoryId: string) => { value: string; label: string }[];
  mode: 'purchase' | 'sales';
  preferredModelsListId?: string; // 销售单用的 datalist ID
}

export default function OrderItemsEditor({
  items,
  onItemChange,
  onAddRow,
  onRemoveRow,
  categoryOptions,
  getProductOptions,
  mode,
  preferredModelsListId
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-slate-900">明细信息</h4>
        <button
          type="button"
          className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          onClick={onAddRow}
        >
          添加行
        </button>
      </div>

      {items.map((item, index) => (
        <div key={index} className="relative grid gap-3 rounded-2xl border border-slate-200 p-5 bg-white shadow-sm hover:shadow-md transition-shadow md:grid-cols-4">
          {/* 1. 分类选择 */}
          <label className="text-sm text-slate-600">
            <span className="mb-1 block">分类</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5"
              value={item.category}
              onChange={(e) => onItemChange(index, 'category', e.target.value)}
              required
            >
              <option value="" disabled>选择分类</option>
              {categoryOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>

          {/* 2. 物料选择 */}
          <label className="text-sm text-slate-600">
            <span className="mb-1 block">系统物料{mode === 'sales' && '（可选）'}</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={item.product}
              onChange={(e) => onItemChange(index, 'product', e.target.value)}
              required={mode === 'purchase'}
            >
              <option value="">请选择物料</option>
              {getProductOptions(item.category).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          {/* 销售单特有：客户产品名 */}
          {mode === 'sales' && (
            <label className="text-sm text-slate-600 md:col-span-2">
              <span className="mb-1 block">客户侧产品名</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={item.customName}
                onChange={(e) => onItemChange(index, 'customName', e.target.value)}
                placeholder="客户合同上的名称"
                list={preferredModelsListId}
                required
              />
            </label>
          )}

          {/* 3. 单价 */}
          <label className="text-sm text-slate-600">
            <span className="mb-1 block">单价 (¥)</span>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={item.price}
              onChange={(e) => onItemChange(index, 'price', e.target.value)}
              required
            />
          </label>

          {/* 4. 数量 */}
          <label className="text-sm text-slate-600">
            <span className="mb-1 block">数量</span>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={item.quantity}
              onChange={(e) => onItemChange(index, 'quantity', e.target.value)}
              required
            />
          </label>

          {/* 销售单特有：细节描述 (占整行) */}
          {mode === 'sales' && (
            <label className="text-sm text-slate-600 md:col-span-4">
              <span className="mb-1 block">规格备注 (线长/定标/颜色等)</span>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                rows={2}
                value={item.detailDescription}
                onChange={(e) => onItemChange(index, 'detailDescription', e.target.value)}
              />
            </label>
          )}

          {/* 删除按钮 - 统一放在右下角 */}
          {items.length > 1 && (
            <div className="flex justify-end md:col-span-4">
              <button
                type="button"
                className="text-xs font-semibold text-rose-500 hover:text-rose-700 flex items-center gap-1"
                onClick={() => onRemoveRow(index)}
              >
                <span>✕ 移除此行</span>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}