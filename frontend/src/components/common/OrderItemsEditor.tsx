// src/components/common/OrderItemsEditor.tsx
import React, { useMemo } from 'react';
import { BaseInput } from './BaseInput';
import type { PcbPlanResponse } from '../../hooks/usePcbPlans';

/**
 * 订单明细编辑器的 draft 模型。
 *
 * **采购模式**（mode='purchase'）：`category` + `product` 两级联动选任意物料。
 * `pcbPlan` / `cable` 字段无意义。
 *
 * **销售模式**（mode='sales'，BOM-2.0 改造后 2026-05-21）：三个独立下拉：
 *   - `product`（外壳，SELF_MADE，沿用历史字段名）
 *   - `pcbPlan`（PCB 方案，PcbPlan.id）—— 排产时按方案展开扣减原材料
 *   - `cable`（线材，CABLE）
 * `category` 字段无意义。详见 docs/PRD.md §3.2 §4.5。
 */
export interface OrderItemDraft {
  id: number | null;
  category?: string;          // 采购模式独有：分类 ID
  product?: string;           // 采购：物料 ID；销售：外壳 ID（沿用旧字段名）
  pcbPlan?: string;           // 销售独有：PCB 方案 ID（BOM-2.0 起替换 board）
  cable?: string;             // 销售独有：线材 product ID
  customName?: string;        // 销售单特有
  detailDescription?: string; // 销售单特有
  price: string;
  quantity: string;
}

interface Props {
  mode: 'purchase' | 'sales';
  items: OrderItemDraft[];
  onChange: (items: OrderItemDraft[]) => void;
  products: any[]; // 原始物料库（含 category_detail.category_type）
  categoryOptions: { value: string; label: string }[];
  /**
   * 销售模式下用于第二个槽位（PCB 方案）的下拉源。manager 拿到非空数组，
   * 其他角色不会进入销售编辑路径，可不传。仅显示 is_active=true 的方案。
   */
  pcbPlans?: PcbPlanResponse[];
  preferredModelOptions?: string[]; // 销售单特有的客户偏好建议
}

const SLOT_LABELS = {
  shell: '外壳（SELF_MADE）',
  pcbPlan: 'PCB 方案',
  cable: '线材（CABLE）',
} as const;

/** 销售槽位 → 物料分类类型映射（仅 shell / cable，pcbPlan 走方案表）。 */
const SLOT_TO_CATEGORY: Record<'shell' | 'cable', string> = {
  shell: 'SELF_MADE',
  cable: 'CABLE',
};

export const OrderItemsEditor = ({
  mode,
  items,
  onChange,
  products,
  categoryOptions,
  pcbPlans = [],
  preferredModelOptions = [],
}: Props) => {

  // 逻辑抽离：处理字段变更
  const updateItem = (index: number, field: keyof OrderItemDraft, value: string) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    // 采购模式下切换分类后重置物料选择
    if (mode === 'purchase' && field === 'category') {
      next[index].product = '';
    }
    onChange(next);
  };

  const addItem = () => onChange([
    ...items,
    mode === 'sales'
      ? { id: null, product: '', pcbPlan: '', cable: '', price: '', quantity: '', customName: '', detailDescription: '' }
      : { id: null, category: '', product: '', price: '', quantity: '' },
  ]);
  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));

  // 采购模式：按 category id 过滤
  const getPurchaseProductOptions = (catId: string) => {
    return products
      .filter(p => String(p.category_detail?.id) === catId)
      .map(p => ({ value: String(p.id), label: `${p.model_name} (${p.internal_code})` }));
  };

  // 销售模式产品槽（shell / cable）：按 category_type 过滤物料
  const getProductSlotOptions = (slot: 'shell' | 'cable') => {
    const targetType = SLOT_TO_CATEGORY[slot];
    return products
      .filter(p => p.category_detail?.category_type === targetType)
      .map(p => ({ value: String(p.id), label: `${p.model_name} (${p.internal_code})` }));
  };

  // 销售模式 PCB 方案槽：从 props.pcbPlans 取启用方案
  const pcbPlanOptions = useMemo(
    () => pcbPlans
      .filter(p => p.is_active)
      .map(p => ({
        value: String(p.id),
        label: p.code ? `${p.name} (${p.code})` : p.name,
      })),
    [pcbPlans],
  );

  // 已选方案的展开预览：用于展示"扣减时会扣这些原材料"
  const selectedPlanPreview = (planId: string | undefined) => {
    if (!planId) return null;
    const plan = pcbPlans.find(p => String(p.id) === planId);
    if (!plan || !plan.materials.length) return null;
    return plan.materials
      .map(m => `${m.material_detail?.model_name ?? '原材料'} × ${m.quantity_per_unit}`)
      .join('、');
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

              {/* === 采购模式：分类 + 物料 两级联动 === */}
              {mode === 'purchase' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">分类</span>
                    <select
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none"
                      value={item.category ?? ''}
                      onChange={(e) => updateItem(index, 'category', e.target.value)}
                    >
                      <option value="">选择分类</option>
                      {categoryOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">物料 (系统)</span>
                    <select
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none"
                      value={item.product ?? ''}
                      onChange={(e) => updateItem(index, 'product', e.target.value)}
                    >
                      <option value="">{item.category ? '请选择物料' : '先选分类'}</option>
                      {getPurchaseProductOptions(item.category ?? '').map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
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
              )}

              {/* === 销售模式：三件组合（外壳 + PCB 方案 + 线材）+ 价格/数量 === */}
              {mode === 'sales' && (
                <>
                  {/* 外壳 + PCB 方案 + 线材 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* 1. 外壳（SELF_MADE 半成品） */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">
                        {SLOT_LABELS.shell}
                      </span>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none"
                        value={item.product ?? ''}
                        onChange={(e) => updateItem(index, 'product', e.target.value)}
                      >
                        <option value="">请选择</option>
                        {getProductSlotOptions('shell').map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>

                    {/* 2. PCB 方案（BOM-2.0 起替换板材物料下拉） */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">
                        {SLOT_LABELS.pcbPlan}
                      </span>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none"
                        value={item.pcbPlan ?? ''}
                        onChange={(e) => updateItem(index, 'pcbPlan', e.target.value)}
                      >
                        <option value="">{pcbPlanOptions.length ? '请选择方案' : '尚无可用方案'}</option>
                        {pcbPlanOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                      {/* 展开预览：让用户看到本方案排产时会扣的原材料 */}
                      {selectedPlanPreview(item.pcbPlan) && (
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          扣料：{selectedPlanPreview(item.pcbPlan)}
                        </p>
                      )}
                    </div>

                    {/* 3. 线材（CABLE 半成品） */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">
                        {SLOT_LABELS.cable}
                      </span>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none"
                        value={item.cable ?? ''}
                        onChange={(e) => updateItem(index, 'cable', e.target.value)}
                      >
                        <option value="">请选择</option>
                        {getProductSlotOptions('cable').map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* 价格 + 数量 */}
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <BaseInput
                      label="单价"
                      type="number"
                      value={item.price}
                      onChange={(e) => updateItem(index, 'price', e.target.value)}
                    />
                    <BaseInput
                      label="数量（套）"
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    />
                  </div>

                  {/* 销售单特有：客户产品名 + 细节描述 */}
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                    <div className="lg:col-span-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">客户产品名称</span>
                      <input
                        list="preferred-models"
                        className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none"
                        value={item.customName}
                        placeholder="例如：Elite 黑色外壳套件"
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
                </>
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
