import { Fragment, useState, useMemo, useEffect } from 'react';
import { api } from '../../api/client';
import FilterBar from '../common/FilterBar';
import {PartnerSelect} from '../common/PartnerSelect';
import StatusBadge from '../common/StatusBadge';
import OrderDetailsView from '../common/OrderDetailsView';
import  {OrderItemsEditor}  from '../common/OrderItemsEditor';
import type { OrderItemDraft } from '../common/OrderItemsEditor';
import Modal from '../common/Modal';
import Pagination from '../common/Pagination';
import { resolvePartnerId, formatPartner } from '../../utils/orderUtils';
import NavbarButton from '../common/NavbarButton';
import { useSalesOrders, SalesOrdersFilters } from '../../hooks/useSalesOrders';
import { useCustomerPreferredProducts } from '../../hooks/useCustomerPreferredProducts';
import { usePcbPlans } from '../../hooks/usePcbPlans';

// 1. 常量定义 - 销售状态
const SALES_STATUS_OPTIONS = [
  { value: 'ORDERED', label: '待处理' },
  { value: 'PRODUCING', label: '生产中' },
  { value: 'SHIPPED', label: '已发货' },
  { value: 'COMPLETED', label: '已完成' },
];

const PAGE_SIZE = 30;

interface SalesOrdersPanelProps {
  products: any[];
  partners: any[];
  categories: any[];
  isManager: boolean;
  canCreateEvents: boolean;
}

// UI 层的"输入框/datalist 层"过滤态——customerInput 与 customerId 是 PartnerSelect
// 解析出来的"显示值 + 解析 ID"。提交到后端时只用 partner（ID 优先）或 partner_name。
interface PanelFiltersState {
  status: string;
  customerInput: string;
  customerId: number | null;
}

export default function SalesOrdersPanel({
  products,
  partners,
  isManager,
  categories,
  canCreateEvents,
}: SalesOrdersPanelProps) {
  // --- 状态管理 ---
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [modal, setModal] = useState<{ open: boolean; mode: 'create' | 'edit'; draftId: number | null }>({
    open: false, mode: 'create', draftId: null
  });
  // 创建/编辑表单状态：注意**不含 status**——
  //   创建：后端默认 ORDERED；
  //   编辑：状态推进走 api.updateSalesOrderStatus，**不**经此表单（详见
  //   rules/frontend-rules.md §2.2 与 docs/PRD.md §9.2 changelog 2026-05-21）。
  const [form, setForm] = useState({ customerField: '', customerId: null as number | null, items: [] as OrderItemDraft[] });
  const [isSaving, setIsSaving] = useState(false);
  const [eventModal, setEventModal] = useState({ open: false, orderId: null as number | null, content: '' });

  // --- 筛选 + 分页：本地 UI 态 → 转 hook options（server-side filter + pagination） ---
  const [panelFilters, setPanelFilters] = useState<PanelFiltersState>({
    status: '',
    customerInput: '',
    customerId: null,
  });
  const [page, setPage] = useState(1);

  // 切换筛选条件时回到第 1 页（与 usePaginatedFilter 原有行为一致）。
  useEffect(() => {
    setPage(1);
  }, [panelFilters]);

  // 把 panel 内的"显示值"过滤态翻译成后端能识别的 SalesOrdersFilters。
  // 优先用 customerId（精确匹配）；没有 ID 时退化为 partner_name 模糊匹配。
  const apiFilters = useMemo<SalesOrdersFilters>(() => {
    const next: SalesOrdersFilters = {};
    if (panelFilters.status) next.status = panelFilters.status;
    if (panelFilters.customerId) {
      next.partner = panelFilters.customerId;
    } else if (panelFilters.customerInput.trim()) {
      next.partner_name = panelFilters.customerInput.trim();
    }
    return next;
  }, [panelFilters]);

  const ordersQuery = useSalesOrders({
    enabled: true,
    page,
    pageSize: PAGE_SIZE,
    filters: apiFilters,
  });
  const pagedOrders = ordersQuery.data;
  const totalCount = ordersQuery.pagination.totalCount;
  const onRefresh = ordersQuery.reload;

  // --- 数据处理 (useMemo) ---
  // 客户范围：CUSTOMER 与 BOTH（双重身份）都允许下销售单，
  // 与后端 SalesOrder.partner 的 limit_choices_to 同口径。
  const customerOptions = useMemo(() =>
    partners.filter((p: any) => p.partner_type === 'CUSTOMER' || p.partner_type === 'BOTH'),
  [partners]);

  const categoryOptions = useMemo(() =>
    (categories || []).map((c: any) => ({ value: String(c.id), label: c.name })),
  [categories]);

  const resetFilters = () => {
    setPanelFilters({ status: '', customerInput: '', customerId: null });
  };

  const preferredProducts = useCustomerPreferredProducts(form.customerId, Boolean(form.customerId));

  // BOM-2.0：销售明细第二件 = PCB 方案。仅在 modal 打开时取，且只显示启用方案。
  const pcbPlans = usePcbPlans({
    enabled: isManager && modal.open,
    filters: { is_active: true },
    pageSize: 100,
  });

  // --- 业务逻辑 ---
  const handleAddEvent = (orderId: number) => {
    setEventModal({ open: true, orderId, content: '' });
  };

  const submitEvent = async () => {
    if (!eventModal.content.trim() || !eventModal.orderId) return;
    try {
      setIsSaving(true);
      await api.createSalesOrderEvent(eventModal.orderId, {
        event_type: 'REMARK',
        content: eventModal.content.trim()
      });
      setEventModal({ ...eventModal, open: false });
      onRefresh();
    } catch (err: any) {
      alert("保存失败: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    // BOM 改造：销售明细初始化为外壳/板材/线材三个空槽位（详见 docs/PRD.md §3.2）
    setForm({
      customerField: '',
      customerId: null,
      items: [{
        id: null,
        product: '', pcbPlan: '', cable: '',
        price: '', quantity: '',
        customName: '', detailDescription: '',
      }],
    });
    setModal({ open: true, mode: 'create', draftId: null });
  };

  const openEdit = (order: any) => {
    setForm({
      customerField: formatPartner(order.partner_name, order.partner),
      customerId: Number(order.partner) || null,
      items: order.items.map((i: any) => ({
        id: i.id,
        // BOM-2.0：三件 = 外壳(product) + PCB 方案(pcbPlan) + 线材(cable)
        product: i.product ? String(i.product) : '',
        pcbPlan: i.pcb_plan ? String(i.pcb_plan) : '',
        cable: i.cable ? String(i.cable) : '',
        price: String(i.price),
        quantity: String(i.quantity),
        customName: i.custom_product_name || '',
        detailDescription: i.detail_description || '',
      })),
    });
    setModal({ open: true, mode: 'edit', draftId: order.id });
  };

  const handleSubmit = async () => {
    const cId = form.customerId ?? resolvePartnerId(form.customerField, customerOptions);
    if (!cId) return alert("请选择有效的客户");

    // BOM-2.0：销售明细必须挂三件（外壳 / PCB 方案 / 线材）才有效；
    // 后端 serializer 也会校验，前端先做友好提示避免直接 400。
    const validItems = form.items.filter(item =>
      item.product && item.pcbPlan && item.cable && Number(item.quantity) > 0,
    );
    if (validItems.length === 0) {
      return alert("订单明细不能为空，且每条必须选齐外壳 + PCB 方案 + 线材，并填写数量");
    }

    try {
      setIsSaving(true);
      // 公共 payload：编辑销售单时**不传 status**——后端通用 PATCH
      // 不走状态机校验（仅 /sales-orders/{id}/status/ 才走），所以
      // 通用 PATCH 带 status 会绕开「仅前进一档」约束。状态推进必须
      // 走 api.updateSalesOrderStatus。详见 rules/frontend-rules.md §2.2、
      // docs/PRD.md §9.2 changelog 2026-05-21（原 §9.2 #19 修复）。
      const itemsPayload = validItems.map(i => ({
        id: i.id || undefined,
        product: Number(i.product),     // 外壳（沿用历史字段名）
        pcb_plan: Number(i.pcbPlan),    // PCB 方案（BOM-2.0 起替换 board）
        cable: Number(i.cable),
        price: Number(i.price), quantity: Number(i.quantity),
        custom_product_name: i.customName, detail_description: i.detailDescription,
      }));
      if (modal.mode === 'create') {
        // 创建走 POST：后端默认 status='ORDERED'，前端不传——
        // api.createSalesOrder 的类型签名本就不含 status 字段。
        await api.createSalesOrder({ partner: cId, items_payload: itemsPayload });
      } else {
        // 编辑走通用 PATCH：**禁止携带 status**——通用 PATCH 不走状态机
        // 校验，会绕开「仅前进一档」约束。状态推进必须走
        // api.updateSalesOrderStatus（详见 rules/frontend-rules.md §2.2）。
        await api.updateSalesOrder(modal.draftId!, { partner: cId, items_payload: itemsPayload });
      }
      if (form.customerId) {
        const existingNames = new Set(
          (preferredProducts.data || []).map((p) => p.name.trim().toLowerCase()),
        );
        // 分两步走，避免单条 filter 里二次访问 name 时 TS 守卫失效：
        // 先把可能 undefined 的 customName 收成 string[]，再排除已存在的名字。
        const trimmedNames: string[] = validItems
          .map((i) => (i.customName ?? '').trim())
          .filter((s): s is string => s.length > 0);
        const newNames = Array.from(
          new Set(trimmedNames.filter((s) => !existingNames.has(s.toLowerCase()))),
        );
        if (newNames.length) {
          await Promise.all(
            newNames.map((name) => api.createCustomerPreferredProduct({ partner: form.customerId!, name })),
          );
          preferredProducts.reload();
        }
      }
      setModal({ ...modal, open: false });
      onRefresh();
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* A. 标题区 */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">销售管理</h2>
          <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-widest">Outbound Sales & Orders</p>
        </div>
        {isManager && (
          <button onClick={openCreate} className="rounded-full bg-slate-900 px-6 py-2 text-sm font-bold text-white shadow-lg active:scale-95 transition-all">
            + 新建销售单
          </button>
        )}
      </div>

      {/* B. 筛选区 */}
      <FilterBar actions={
        <NavbarButton variant="outline" className="text-xs" onClick={resetFilters}>
          重置筛选
        </NavbarButton>
      }>
        <FilterBar.Field label="客户名称 / #ID">
          <PartnerSelect 
            id="sales-filter" partners={customerOptions} value={panelFilters.customerInput}
            onChange={(val, id) => setPanelFilters(prev => ({ ...prev, customerInput: val, customerId: id }))}
          />
        </FilterBar.Field>
        <FilterBar.Field label="订单状态">
          <select className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm bg-white outline-none focus:border-slate-900" value={panelFilters.status} onChange={e => setPanelFilters(prev => ({ ...prev, status: e.target.value }))}>
            <option value="">全部显示</option>
            {SALES_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </FilterBar.Field>
      </FilterBar>

      {/* C. 列表区 (响应式) */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {/* 桌面端表格 - 按照你的标准统一字号 */}
        <table className="hidden md:table min-w-full text-sm">
          <thead className="bg-slate-50/50 text-slate-500 uppercase text-[15px] font-bold tracking-widest">
            <tr>
              <th className="px-6 py-4 text-left">客户信息 / 销售单号</th>
              <th className="px-6 py-4 text-center">当前状态</th>
              <th className="px-4 py-4 text-right">结算金额</th>
              <th className="px-6 py-4 text-right">管理</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pagedOrders.map(order => (
              <Fragment key={order.id}>
                <tr className={`hover:bg-slate-50/50 cursor-pointer transition-colors ${expandedId === order.id ? 'bg-slate-50/80' : ''}`} onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-800">{order.partner_name || `客户#${order.partner}`}</p>
                    <p className="text-[15px] font-mono text-slate-400">{order.order_no}</p>
                  </td>
                  <td className="px-6 py-4 text-center"><StatusBadge kind="sales" status={order.status} /></td>
                  <td className="px-4 py-4 text-right font-bold text-slate-900">¥ {Number(order.total_amount).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    {canCreateEvents && (
                      <NavbarButton variant="outline" onClick={(e) => { e.stopPropagation(); handleAddEvent(order.id); }} className="text-[10px] py-1 px-3">记录动态</NavbarButton>
                    )}
                    <NavbarButton variant="outline" onClick={(e) => { e.stopPropagation(); openEdit(order); }} className="text-[10px] py-1 px-3">编辑订单</NavbarButton>
                  </td>
                </tr>
                {expandedId === order.id && (
                  <tr>
                    <td colSpan={4} className="p-0 border-b border-slate-100">
                      <OrderDetailsView mode="sales" items={order.items} events={order.events || []} orderId={order.id} onAddEvent={handleAddEvent} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>

        {/* 移动端卡片 */}
        <div className="md:hidden divide-y divide-slate-50">
          {pagedOrders.map(order => (
            <div key={order.id} className="flex flex-col">
              <div className={`p-5 active:bg-slate-100 ${expandedId === order.id ? 'bg-slate-50' : ''}`} onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{order.partner_name}</p>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">{order.order_no}</p>
                  </div>
                  <StatusBadge kind="sales" status={order.status} />
                </div>
                <div className="flex justify-between items-end">
                  <div className="flex gap-2">
                    <NavbarButton variant="outline" onClick={(e) => { e.stopPropagation(); openEdit(order); }} className="text-[10px] py-1 px-3">修改</NavbarButton>
                    {canCreateEvents && (
                      <NavbarButton variant="outline" onClick={(e) => { e.stopPropagation(); handleAddEvent(order.id); }} className="text-[10px] py-1 px-3">记录</NavbarButton>
                    )}
                  </div>
                  <p className="text-lg font-black text-slate-900">¥ {Number(order.total_amount).toFixed(2)}</p>
                </div>
              </div>
              {expandedId === order.id && (
                <div className="border-t border-slate-100">
                  <OrderDetailsView mode="sales" items={order.items} events={order.events || []} orderId={order.id} onAddEvent={handleAddEvent} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* D. 弹窗区 */}
      <Modal 
        open={modal.open} onClose={() => setModal({ ...modal, open: false })}
        title={modal.mode === 'create' ? '创建销售单' : '修改销售信息'} maxWidth="max-w-5xl"
        footer={<NavbarButton disabled={isSaving} onClick={handleSubmit} className="px-10">{isSaving ? '提交中...' : '确认发布销售单'}</NavbarButton>}
      >
        <div className="space-y-8 py-2">
          <PartnerSelect label="选择下单客户" id="modal-customer" partners={customerOptions} value={form.customerField} onChange={(val, id) => setForm({ ...form, customerField: val, customerId: id ?? null })} />
          <OrderItemsEditor
            mode="sales"
            items={form.items}
            products={products}
            categoryOptions={categoryOptions}
            pcbPlans={pcbPlans.data || []}
            preferredModelOptions={(preferredProducts.data || []).map((p) => p.name)}
            onChange={(newItems) => setForm({ ...form, items: newItems })}
          />
        </div>
      </Modal>

      {/* E. 记录动态专用小弹窗 */}
      <Modal 
        open={eventModal.open} 
        onClose={() => setEventModal({ ...eventModal, open: false })}
        title="添加业务动态"
        maxWidth="max-w-md"
        footer={
          <div className="flex gap-3 w-full">
            <NavbarButton variant="outline" className="flex-1" onClick={() => setEventModal({ ...eventModal, open: false })}>取消</NavbarButton>
            <NavbarButton className="flex-1" disabled={isSaving || !eventModal.content.trim()} onClick={submitEvent}>
              {isSaving ? '保存中...' : '确认记录'}
            </NavbarButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="text-sm text-blue-800 leading-relaxed">
              <strong>提示：</strong> 此记录将同步至订单时间线，方便记录客户反馈、生产进度或发货详情。
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-500 ml-1 uppercase tracking-widest">动态内容</label>
            <textarea 
              autoFocus rows={4}
              className="w-full rounded-2xl border border-slate-200 p-4 text-base focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all resize-none"
              placeholder="例如：已安排车间生产，预计后天可发货..."
              value={eventModal.content}
              onChange={(e) => setEventModal({ ...eventModal, content: e.target.value })}
            />
          </div>
        </div>
      </Modal>

        <Pagination page={page} total={totalCount} onPageChange={setPage} />
    </div>
  );
}
