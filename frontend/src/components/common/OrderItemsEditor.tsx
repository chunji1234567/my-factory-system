// src/components/common/OrderItemsEditor.tsx
import { useMemo } from 'react';
import { BaseInput } from './BaseInput';
import { Card, ActionBar, SearchableSelect } from '../primitives';
import type { PcbPlanResponse } from '../../hooks/usePcbPlans';

/**
 * 订单明细编辑器（Stage C-3，2026-06-18 重做）。
 *
 * **采购模式**（mode='purchase'）：`category` + `product` 两级联动选任意物料。
 * `pcbPlan` / `cable` 字段无意义。
 *
 * **销售模式**（mode='sales'，BOM-2.0 改造后 2026-05-21）：三个独立下拉：
 *   - `product`（外壳，SELF_MADE，沿用历史字段名）
 *   - `pcbPlan`（PCB 方案，PcbPlan.id）—— 排产时按方案展开扣减原材料
 *   - `cable`（线材，CABLE）
 * `category` 字段无意义。详见 docs/PRD.md §3.2 §4.5。
 *
 * UX 改版要点（详见 docs/ux-audit.md §2.3 #3）：
 *   - 每条明细 = Card tone="subtle"，不再用自造 rounded-3xl 卡
 *   - 销售模式：三件 grid-cols-3 横排；客户产品名+备注 grid-cols-3；
 *     价格/数量 grid-cols-2 在底部 border-t 分隔
 *   - 顶部 ActionBar：「+ 复用上一条」（仅当已有明细时）+「+ 添加空白明细」
 *     用户原话："这次提交保留之前的三件可以提高被涵盖率"
 *   - 价格 label 加 "(可选)"——前端验证已不强校验，UI 显式说清
 *   - 删除按钮常驻（不再依赖 hover）
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

/** 销售槽位 → 物料分类类型映射（仅 shell / cable，pcbPlan 走方案表）。 */
const SLOT_TO_CATEGORY: Record<'shell' | 'cable', string> = {
  shell: 'SELF_MADE',
  cable: 'CABLE',
};

const FIELD_LABEL_CLS = 'text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5';
const SELECT_CLS =
  'w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none ' +
  'focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors';

export const OrderItemsEditor = ({
  mode,
  items,
  onChange,
  products,
  categoryOptions,
  pcbPlans = [],
  preferredModelOptions = [],
}: Props) => {
  // --- 数据准备 ---
  const purchaseProductOptions = useMemo(() => {
    // 按 category id 索引：访问时直接 lookup
    const byCat = new Map<string, { value: string; label: string }[]>();
    for (const p of products) {
      const cid = String(p.category_detail?.id ?? '');
      if (!cid) continue;
      const opt = { value: String(p.id), label: `${p.model_name} (${p.internal_code})` };
      if (!byCat.has(cid)) byCat.set(cid, []);
      byCat.get(cid)!.push(opt);
    }
    return byCat;
  }, [products]);

  const salesSlotOptions = useMemo(() => {
    // 销售模式 shell / cable 各按 category_type 过滤
    const shellList: { value: string; label: string }[] = [];
    const cableList: { value: string; label: string }[] = [];
    for (const p of products) {
      const type = p.category_detail?.category_type;
      const opt = { value: String(p.id), label: `${p.model_name} (${p.internal_code})` };
      if (type === SLOT_TO_CATEGORY.shell) shellList.push(opt);
      if (type === SLOT_TO_CATEGORY.cable) cableList.push(opt);
    }
    return { shell: shellList, cable: cableList };
  }, [products]);

  const pcbPlanOptions = useMemo(
    () =>
      pcbPlans
        .filter((p) => p.is_active)
        .map((p) => ({
          value: String(p.id),
          label: p.code ? `${p.name} (${p.code})` : p.name,
        })),
    [pcbPlans],
  );

  // --- 业务动作 ---
  const updateItem = (index: number, field: keyof OrderItemDraft, value: string) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    // 采购模式下切换分类后重置物料选择
    if (mode === 'purchase' && field === 'category') {
      next[index].product = '';
    }
    onChange(next);
  };

  const blankItem = (): OrderItemDraft =>
    mode === 'sales'
      ? {
          id: null,
          product: '',
          pcbPlan: '',
          cable: '',
          price: '',
          quantity: '',
          customName: '',
          detailDescription: '',
        }
      : { id: null, category: '', product: '', price: '', quantity: '' };

  const addBlank = () => onChange([...items, blankItem()]);

  /**
   * 复用上一条的三件组合（销售）/ 分类+物料（采购）。
   * 价格/数量/客户产品名/备注**清空**——这些是每条明细独立的业务参数。
   * 复制三件本身就是 90% 场景：客户大订单常有几条规格几乎一样的明细。
   */
  const duplicateLast = () => {
    if (!items.length) return;
    const last = items[items.length - 1];
    const next = blankItem();
    if (mode === 'sales') {
      next.product = last.product;
      next.pcbPlan = last.pcbPlan;
      next.cable = last.cable;
    } else {
      next.category = last.category;
      next.product = last.product;
    }
    onChange([...items, next]);
  };

  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));

  // --- 渲染 ---
  return (
    <div className="space-y-3">
      {/* 顶部 ActionBar：复用 + 添加 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption text-ink-faint">
          共 <span className="font-mono text-ink-body">{items.length}</span> 条明细
        </p>
        <ActionBar align="end">
          {items.length > 0 && (
            <ActionBar.GhostButton onClick={duplicateLast}>
              + 复用上一条
            </ActionBar.GhostButton>
          )}
          <ActionBar.GhostButton onClick={addBlank}>
            + 添加明细
          </ActionBar.GhostButton>
        </ActionBar>
      </div>

      {/* 空状态 */}
      {items.length === 0 && (
        <Card flat tone="subtle" padding="normal">
          <p className="text-center text-caption text-ink-faint py-6">
            还没有明细，点右上方"+ 添加明细"开始
          </p>
        </Card>
      )}

      {/* 明细列表 */}
      <div className="space-y-3">
        {items.map((item, index) => (
          <Card key={index} tone="subtle" padding="normal">
            {/* 顶部：序号 + 删除 */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-micro font-mono text-ink-faint">#{index + 1}</span>
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="text-micro font-bold text-ink-faint hover:text-danger transition-colors px-2 py-1"
              >
                删除
              </button>
            </div>

            {/* === 采购模式：分类 + 物料 + 价格 + 数量 === */}
            {mode === 'purchase' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className={FIELD_LABEL_CLS}>分类</span>
                    {/* 切换分类会触发 updateItem 内部把同条明细的 product 重置（详见
                        updateItem 里 `if (mode === 'purchase' && field === 'category')` 的分支），
                        所以即便从 SearchableSelect 选了新分类，物料下拉里旧选项会自动清空。 */}
                    <SearchableSelect
                      options={categoryOptions}
                      value={item.category ?? ''}
                      onChange={(v) => updateItem(index, 'category', v)}
                      placeholder="请选择分类（可搜索）"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={FIELD_LABEL_CLS}>物料</span>
                    <SearchableSelect
                      options={purchaseProductOptions.get(item.category ?? '') ?? []}
                      value={item.product ?? ''}
                      onChange={(v) => updateItem(index, 'product', v)}
                      disabled={!item.category}
                      placeholder={item.category ? '请选择物料（可搜索）' : '先选分类'}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-line">
                  <BaseInput
                    label="单价（可选）"
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
              </>
            )}

            {/* === 销售模式：三件 + 客户产品名/备注 + 价格/数量 === */}
            {mode === 'sales' && (
              <>
                {/* 三件：外壳 / PCB 方案 / 线材 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <span className={FIELD_LABEL_CLS}>外壳</span>
                    <SearchableSelect
                      options={salesSlotOptions.shell}
                      value={item.product ?? ''}
                      onChange={(v) => updateItem(index, 'product', v)}
                      placeholder="请选择外壳（可搜索）"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={FIELD_LABEL_CLS}>PCB 方案</span>
                    <SearchableSelect
                      options={pcbPlanOptions}
                      value={item.pcbPlan ?? ''}
                      onChange={(v) => updateItem(index, 'pcbPlan', v)}
                      placeholder={pcbPlanOptions.length ? '请选择方案（可搜索）' : '尚无可用方案'}
                      disabled={!pcbPlanOptions.length}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className={FIELD_LABEL_CLS}>线材</span>
                    <SearchableSelect
                      options={salesSlotOptions.cable}
                      value={item.cable ?? ''}
                      onChange={(v) => updateItem(index, 'cable', v)}
                      placeholder="请选择线材（可搜索）"
                    />
                  </div>
                </div>

                {/* 客户产品名 + 备注（备注更宽） */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div className="space-y-1">
                    <span className={FIELD_LABEL_CLS}>客户产品名</span>
                    <input
                      list="preferred-models"
                      className={SELECT_CLS}
                      value={item.customName ?? ''}
                      placeholder="例：Elite 黑色外壳套件"
                      onChange={(e) => updateItem(index, 'customName', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <span className={FIELD_LABEL_CLS}>细节描述（商标 / 颜色 / 工艺）</span>
                    <textarea
                      rows={1}
                      className={`${SELECT_CLS} resize-none`}
                      value={item.detailDescription ?? ''}
                      placeholder="记录规格、线长、印刷工艺等定制信息..."
                      onChange={(e) => updateItem(index, 'detailDescription', e.target.value)}
                    />
                  </div>
                </div>

                {/* 价格 + 数量（底部分隔） */}
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-line">
                  <BaseInput
                    label="单价（可选）"
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
              </>
            )}
          </Card>
        ))}
      </div>

      {/* 销售单专用的数据建议列表 */}
      {mode === 'sales' && (
        <datalist id="preferred-models">
          {preferredModelOptions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      )}
    </div>
  );
};
