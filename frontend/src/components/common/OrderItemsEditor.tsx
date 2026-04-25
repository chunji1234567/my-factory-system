// src/components/common/OrderItemsEditor.tsx
import React, { useMemo } from 'react';
import { BaseInput } from './BaseInput';

export interface OrderItemDraft {
  id: number | null;
  category: string;
  product: string;
  customName?: string;       // 销售单特有
  detailDescription?: string; // 销售单特有
  price: string;
  quantity: string;
}

interface Props {
  mode: 'purchase' | 'sales';
  items: OrderItemDraft[];
  onChange: (items: OrderItemDraft[]) => void;
  products: any[]; // 原始物料库
  categoryOptions: { value: string; label: string }[];
  preferredModelOptions?: string[]; // 销售单特有的客户偏好建议
}


export const OrderItemsEditor = ({ 
  mode, 
  items, 
  onChange, 
  products, 
  categoryOptions,
  preferredModelOptions = [] 
}: Props) => {

  // 逻辑抽离：处理字段变更
  const updateItem = (index: number, field: keyof OrderItemDraft, value: string) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    // 如果切换了分类，重置该行的产品选择
    if (field === 'category') next[index].product = '';
    onChange(next);
  };

  const addItem = () => onChange([...items, { id: null, category: '', product: '', price: '', quantity: '', customName: '', detailDescription: '' }]);
  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));

  // 根据分类过滤物料选项
  const getProductOptions = (catId: string) => {
    return products
      .filter(p => String(p.category_detail?.id) === catId)
      .map(p => ({ value: String(p.id), label: `${p.model_name} (${p.internal_code})` }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400 ml-1">项目明细</h4>
        <button 
          type="button" 
          onClick={addItem}
          className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
        >
          + 添加明细行
        </button>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={index} className="relative group animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-md transition-all">
              
              {/* 第一行：基础信息 (响应式网格) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">分类</span>
                  <select 
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none"
                    value={item.category}
                    onChange={(e) => updateItem(index, 'category', e.target.value)}
                  >
                    <option value="">选择分类</option>
                    {categoryOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">
                    {mode === 'purchase' ? '物料 (系统)' : '关联物料 (可选)'}
                  </span>
                  <select 
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none"
                    value={item.product}
                    onChange={(e) => updateItem(index, 'product', e.target.value)}
                  >
                    <option value="">{item.category ? '请选择物料' : '先选分类'}</option>
                    {getProductOptions(item.category).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>

                <BaseInput 
                  label="单价" 
                  type="number" 
                  value={item.price} 
                  onChange={(e) => updateItem(index, 'price', e.target.value)} 
                />
                <BaseInput 
                  label="数量" 
                  type="number" 
                  value={item.quantity} 
                  onChange={(e) => updateItem(index, 'quantity', e.target.value)} 
                />
              </div>

              {/* 第二行：销售模式特有字段 (全宽展示) */}
              {mode === 'sales' && (
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                  <div className="lg:col-span-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">客户产品名称</span>
                    <input 
                      list="preferred-models"
                      className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none"
                      value={item.customName}
                      placeholder="例如：Elite 黑色外壳"
                      onChange={(e) => updateItem(index, 'customName', e.target.value)}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">细节描述</span>
                    <textarea 
                      rows={1}
                      className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none resize-none"
                      value={item.detailDescription}
                      placeholder="记录规格、线长等定制信息..."
                      onChange={(e) => updateItem(index, 'detailDescription', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* 悬浮删除按钮 (仅 PC 展示，移动端常驻) */}
              <button 
                onClick={() => removeItem(index)}
                className="absolute -right-2 -top-2 lg:opacity-0 lg:group-hover:opacity-100 bg-rose-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-lg transition-all hover:scale-110"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 销售单专用的数据建议列表 */}
      {mode === 'sales' && (
        <datalist id="preferred-models">
          {preferredModelOptions.map(m => <option key={m} value={m} />)}
        </datalist>
      )}
    </div>
  );
};