import { Fragment, useState, useEffect, useMemo } from 'react';
import FilterBar from '../common/FilterBar';
import NavbarButton from '../common/NavbarButton';
import StatusBadge from '../common/StatusBadge';
import Modal from '../common/Modal';
import Pagination from '../common/Pagination';
import { api } from '../../api/client';
import {
  useProductionOrders,
  ProductionOrdersFilters,
  ProductionOrderResponse,
  ProductionOrderLineResponse,
  ProductionStatus,
} from '../../hooks/useProductionOrders';
import { useSalesOrders, SalesOrderResponse } from '../../hooks/useSalesOrders';
import { useProducts, ProductResponse } from '../../hooks/useProducts';
import { usePcbPlans } from '../../hooks/usePcbPlans';

/**
 * 排产中心面板。
 *
 * 核心交互：
 * - 顶部"新建排产单"按钮 → 弹窗里挑销售明细 / 或加备货行 + 数量
 * - 列表分状态展示（PLANNED / EXECUTED / CANCELLED），按计划日期倒序
 * - PLANNED 行支持「扣料」+「取消」两个动作
 * - 扣料前显眼提醒"不可逆，请核对数量"（与 StockAdjustment 警示一致）
 *
 * 详见 docs/PRD.md §4 排产流程与 §3.2 模型。
 */

const PAGE_SIZE = 30;

const STATUS_OPTIONS: { value: ProductionStatus | ''; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'PLANNED', label: '已排产' },
  { value: 'EXECUTED', label: '已扣料' },
  { value: 'CANCELLED', label: '已取消' },
];

const STATUS_LABEL: Record<ProductionStatus, string> = {
  PLANNED: '已排产',
  EXECUTED: '已扣料',
  CANCELLED: '已取消',
};

const STATUS_COLOR: Record<ProductionStatus, string> = {
  PLANNED: 'bg-amber-50 text-amber-700 border-amber-200',
  EXECUTED: 'bg-slate-900 text-white border-slate-900',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

interface LineDraft {
  // 来源：销售明细 or 备货
  sales_item: number | null;
  // 备货模式必填；销售模式可让后端从 sales_item 回填（BOM-2.0）
  shell: string;
  pcb_plan: string;
  cable: string;
  quantity: string;
  note: string;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ProductionPanel() {
  // --- 列表筛选 + 分页 ---
  const [statusFilter, setStatusFilter] = useState<ProductionStatus | ''>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const filters = useMemo<ProductionOrdersFilters>(() => {
    return statusFilter ? { status: statusFilter } : {};
  }, [statusFilter]);

  const ordersQuery = useProductionOrders({
    enabled: true,
    page,
    pageSize: PAGE_SIZE,
    filters,
  });

  // --- 创建/编辑用：销售明细候选 + 产品库 ---
  const salesOrdersQuery = useSalesOrders({
    enabled: true,
    page: 1,
    pageSize: 100, // 排产场景需要看到尽量多的"待排产"销售明细
    filters: { status: 'ORDERED' }, // 通常只在已下单未发货的销售单里挑明细
  });
  const productsQuery = useProducts({ enabled: true, page: 1, pageSize: 200 });
  // BOM-2.0：排产明细第二件 = PCB 方案，仅加载启用方案
  const pcbPlansQuery = usePcbPlans({
    enabled: true,
    filters: { is_active: true },
    pageSize: 200,
  });

  // 把销售明细打平成 { value, label, shell/pcb_plan/cable } 供 modal 下拉用
  const salesItemChoices = useMemo(() => {
    const choices: Array<{
      value: number;
      label: string;
      shell: number | null;
      pcb_plan: number | null;
      cable: number | null;
    }> = [];
    for (const order of salesOrdersQuery.data) {
      for (const it of order.items) {
        const productAny = it as any;
        choices.push({
          value: it.id,
          label: `${order.order_no} · ${it.custom_product_name}（余 ${Number(it.quantity) - Number(it.shipped_quantity ?? 0)}）`,
          shell: productAny.product ?? null,
          pcb_plan: productAny.pcb_plan ?? null,
          cable: productAny.cable ?? null,
        });
      }
    }
    return choices;
  }, [salesOrdersQuery.data]);

  // --- 弹窗 state ---
  const [modal, setModal] = useState<{ open: boolean; orderId: number | null }>({ open: false, orderId: null });
  const [planDate, setPlanDate] = useState<string>(todayIso());
  const [orderNote, setOrderNote] = useState<string>('');
  const [lines, setLines] = useState<LineDraft[]>([
    { sales_item: null, shell: '', pcb_plan: '', cable: '', quantity: '', note: '' },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const productsByCategory = (categoryType: 'SELF_MADE' | 'CABLE') =>
    productsQuery.data.filter((p) => p.category_detail?.category_type === categoryType);

  const openCreate = () => {
    setPlanDate(todayIso());
    setOrderNote('');
    setLines([{ sales_item: null, shell: '', pcb_plan: '', cable: '', quantity: '', note: '' }]);
    setModal({ open: true, orderId: null });
  };

  const addLine = () => {
    setLines((prev) => [...prev, { sales_item: null, shell: '', pcb_plan: '', cable: '', quantity: '', note: '' }]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  // 选了销售明细时自动回填三件（外壳 + PCB 方案 + 线材）
  const handlePickSalesItem = (idx: number, salesItemId: number | null) => {
    if (salesItemId === null) {
      updateLine(idx, { sales_item: null });
      return;
    }
    const choice = salesItemChoices.find((c) => c.value === salesItemId);
    if (!choice) return;
    updateLine(idx, {
      sales_item: salesItemId,
      shell: choice.shell ? String(choice.shell) : '',
      pcb_plan: choice.pcb_plan ? String(choice.pcb_plan) : '',
      cable: choice.cable ? String(choice.cable) : '',
    });
  };

  const handleSubmit = async () => {
    if (!planDate) {
      alert('请选择排产日期');
      return;
    }
    const validLines = lines.filter(
      (l) => l.shell && l.pcb_plan && l.cable && Number(l.quantity) > 0,
    );
    if (validLines.length === 0) {
      alert('请添加至少一条有效的排产明细（外壳 + PCB 方案 + 线材齐备 + 数量 > 0）');
      return;
    }
    try {
      setIsSaving(true);
      await api.createProductionOrder({
        plan_date: planDate,
        note: orderNote || undefined,
        lines_payload: validLines.map((l) => ({
          sales_item: l.sales_item,
          shell: Number(l.shell),
          pcb_plan: Number(l.pcb_plan),
          cable: Number(l.cable),
          quantity: Number(l.quantity),
          note: l.note || undefined,
        })),
      });
      setModal({ open: false, orderId: null });
      ordersQuery.reload();
    } catch (err: any) {
      alert('保存失败：' + (err?.message ?? '未知错误'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecute = async (orderId: number) => {
    if (!window.confirm('⚠ 扣料**不可逆**——确认对此排产单触发库存扣减？')) {
      return;
    }
    try {
      setActionLoadingId(orderId);
      await api.executeProductionOrder(orderId);
      ordersQuery.reload();
    } catch (err: any) {
      alert('扣料失败：' + (err?.message ?? '未知错误'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (orderId: number) => {
    if (!window.confirm('确认取消此排产单？取消后无法恢复。')) {
      return;
    }
    try {
      setActionLoadingId(orderId);
      await api.cancelProductionOrder(orderId);
      ordersQuery.reload();
    } catch (err: any) {
      alert('取消失败：' + (err?.message ?? '未知错误'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* 标题区 */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">排产中心</h2>
          <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-widest">Daily Production Plan</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-full bg-slate-900 px-6 py-2 text-sm font-bold text-white shadow-lg active:scale-95 transition-all"
        >
          + 新建排产单
        </button>
      </div>

      {/* 全局警示：扣料不可逆 */}
      <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/60 px-5 py-3 flex gap-3 items-start">
        <span className="text-rose-500 text-xl leading-none mt-0.5">⚠</span>
        <div className="text-xs md:text-sm text-rose-900 leading-relaxed">
          <p className="font-bold">扣料是不可逆事件</p>
          <p className="text-rose-700/90">
            一旦点击"扣料"，三件半成品（外壳/板材/线材）的库存会立即按数量扣减并写入 StockAdjustment 记录。库存允许变负（半成品由其他车间补货）。
            录错请新加反向 <span className="font-bold">StockAdjustment(MANUAL_IN)</span> 把料退回，不要试图删除排产单。
          </p>
        </div>
      </div>

      {/* 筛选 */}
      <FilterBar
        actions={
          <NavbarButton variant="outline" className="text-xs" onClick={() => setStatusFilter('')}>
            重置筛选
          </NavbarButton>
        }
      >
        <FilterBar.Field label="状态">
          <select
            className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm bg-white outline-none focus:border-slate-900"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProductionStatus | '')}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FilterBar.Field>
      </FilterBar>

      {/* 列表区 */}
      {ordersQuery.error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800 text-sm">
          加载失败：{ordersQuery.error}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="hidden md:table min-w-full text-sm">
          <thead className="bg-slate-50/50 text-slate-500 uppercase text-[12px] font-bold tracking-widest">
            <tr>
              <th className="px-6 py-4 text-left">排产单号</th>
              <th className="px-6 py-4 text-left">计划日期</th>
              <th className="px-6 py-4 text-center">状态</th>
              <th className="px-6 py-4 text-right">明细数</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {ordersQuery.data.map((order) => (
              <Fragment key={order.id}>
                <tr
                  className={`hover:bg-slate-50/50 cursor-pointer transition-colors ${expandedId === order.id ? 'bg-slate-50/80' : ''}`}
                  onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                >
                  <td className="px-6 py-4 font-mono text-slate-700">{order.order_no}</td>
                  <td className="px-6 py-4 text-slate-700">{order.plan_date}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold border ${STATUS_COLOR[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-700">{order.lines.length}</td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    {order.status === 'PLANNED' && (
                      <>
                        <NavbarButton
                          onClick={(e) => { e.stopPropagation(); handleExecute(order.id); }}
                          disabled={actionLoadingId === order.id}
                          className="text-[10px] py-1 px-3"
                        >
                          {actionLoadingId === order.id ? '扣料中…' : '扣料'}
                        </NavbarButton>
                        <NavbarButton
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handleCancel(order.id); }}
                          disabled={actionLoadingId === order.id}
                          className="text-[10px] py-1 px-3"
                        >
                          取消
                        </NavbarButton>
                      </>
                    )}
                    {order.status === 'EXECUTED' && order.executed_at && (
                      <span className="text-[10px] text-slate-400">
                        扣料于 {new Date(order.executed_at).toLocaleString()}
                      </span>
                    )}
                  </td>
                </tr>
                {expandedId === order.id && (
                  <tr>
                    <td colSpan={5} className="bg-slate-50/50 p-0">
                      <div className="p-5 space-y-2">
                        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">明细 ({order.lines.length})</h4>
                        {order.lines.map((line) => (
                          <LineRow key={line.id} line={line} />
                        ))}
                        {order.note && (
                          <p className="mt-4 text-[12px] text-slate-500 italic">备注：{order.note}</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {ordersQuery.data.length === 0 && !ordersQuery.loading && (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm">暂无排产单。点右上角"新建排产单"开始排产。</p>
          </div>
        )}
      </div>

      <Pagination page={page} total={ordersQuery.pagination.totalCount} onPageChange={setPage} />

      {/* 新建排产单 Modal */}
      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, orderId: null })}
        title="新建排产单"
        maxWidth="max-w-5xl"
        footer={
          <div className="flex gap-3 w-full">
            <NavbarButton variant="outline" className="flex-1" onClick={() => setModal({ open: false, orderId: null })}>
              取消
            </NavbarButton>
            <NavbarButton className="flex-1" disabled={isSaving} onClick={handleSubmit}>
              {isSaving ? '保存中…' : '保存为已排产（不立即扣料）'}
            </NavbarButton>
          </div>
        }
      >
        <div className="space-y-5">
          {/* 头部：计划日期 + 备注 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">计划日期</label>
              <input
                type="date"
                className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">备注</label>
              <input
                className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm"
                placeholder="可选——例如：周末加班排产"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
              />
            </div>
          </div>

          {/* 明细列表 */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400 ml-1">排产明细</h4>
              <button
                type="button"
                onClick={addLine}
                className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
              >
                + 添加明细行
              </button>
            </div>

            {lines.map((line, idx) => (
              <div key={idx} className="relative rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
                {/* 销售明细选择 / 留空表示备货 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">关联销售明细（可空 = 备货）</label>
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={line.sales_item ?? ''}
                      onChange={(e) => handlePickSalesItem(idx, e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">备货模式（不挂订单）</option>
                      {salesItemChoices.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">数量（套）</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                    />
                  </div>
                </div>

                {/* 三件：外壳 + PCB 方案 + 线材（BOM-2.0） */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <SlotPicker
                    label="外壳（SELF_MADE）"
                    value={line.shell}
                    options={productsByCategory('SELF_MADE')}
                    onChange={(v) => updateLine(idx, { shell: v })}
                  />
                  <PlanPicker
                    label="PCB 方案"
                    value={line.pcb_plan}
                    options={pcbPlansQuery.data}
                    onChange={(v) => updateLine(idx, { pcb_plan: v })}
                  />
                  <SlotPicker
                    label="线材（CABLE）"
                    value={line.cable}
                    options={productsByCategory('CABLE')}
                    onChange={(v) => updateLine(idx, { cable: v })}
                  />
                </div>

                {/* 行级备注 */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">行备注</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="可选"
                    value={line.note}
                    onChange={(e) => updateLine(idx, { note: e.target.value })}
                  />
                </div>

                {lines.length > 1 && (
                  <button
                    onClick={() => removeLine(idx)}
                    className="absolute -right-2 -top-2 bg-rose-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-lg transition-all hover:scale-110"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

// 小组件：选 product 槽位（按 category_type 已过滤）
interface SlotPickerProps {
  label: string;
  value: string;
  options: ProductResponse[];
  onChange: (v: string) => void;
}
function SlotPicker({ label, value, options, onChange }: SlotPickerProps) {
  return (
    <div>
      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">{label}</label>
      <select
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">请选择</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>{p.model_name}（{p.internal_code}）</option>
        ))}
      </select>
    </div>
  );
}

// PCB 方案 picker——与 SlotPicker 同样形态，但 options 是 PcbPlan 而不是 Product
interface PlanPickerProps {
  label: string;
  value: string;
  options: Array<{ id: number; name: string; code: string; is_active: boolean }>;
  onChange: (v: string) => void;
}
function PlanPicker({ label, value, options, onChange }: PlanPickerProps) {
  return (
    <div>
      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">{label}</label>
      <select
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{options.length ? '请选择方案' : '尚无可用方案'}</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.code ? `（${p.code}）` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

// 列表展开行——展示一条排产明细的三件半成品 + 数量
// 注：key 是 React 特殊 prop（虚拟 DOM 内部用），项目缺 @types/react 时 tsc 误报，故显式声明
function LineRow({ line }: { line: ProductionOrderLineResponse; key?: number | string }) {
  const fmtSlot = (label: string, detail?: { model_name?: string; internal_code?: string } | null) => {
    if (!detail) return <span className="text-slate-400">{label}: —</span>;
    return (
      <span>
        <span className="text-slate-400">{label}:</span>{' '}
        <span className="font-medium">{detail.model_name}</span>
        {detail.internal_code ? <span className="text-slate-400"> ({detail.internal_code})</span> : null}
      </span>
    );
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 grid grid-cols-1 md:grid-cols-5 gap-2 text-[13px]">
      <div className="md:col-span-1 font-bold text-slate-700">
        {line.sales_order_no ? <span>关联：{line.sales_order_no}</span> : <span className="text-amber-600">备货</span>}
        <span className="text-slate-400 ml-2">×{line.quantity}</span>
      </div>
      <div className="md:col-span-1">{fmtSlot('外壳', line.shell_detail)}</div>
      <div className="md:col-span-1">
        {line.pcb_plan_detail ? (
          <span>
            <span className="text-slate-400">方案:</span>{' '}
            <span className="font-medium">{line.pcb_plan_detail.name}</span>
            {line.pcb_plan_detail.code ? <span className="text-slate-400"> ({line.pcb_plan_detail.code})</span> : null}
          </span>
        ) : (
          <span className="text-slate-400">方案: —</span>
        )}
      </div>
      <div className="md:col-span-1">{fmtSlot('线材', line.cable_detail)}</div>
      <div className="md:col-span-1 text-slate-500 italic">{line.note || '—'}</div>
    </div>
  );
}
