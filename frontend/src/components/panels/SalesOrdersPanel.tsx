import { useState, useMemo, useEffect } from 'react';
import { api } from '../../api/client';
import { PartnerSelect } from '../common/PartnerSelect';
import OrderDetailsView from '../common/OrderDetailsView';
import { OrderItemsEditor } from '../common/OrderItemsEditor';
import type { OrderItemDraft } from '../common/OrderItemsEditor';
import Modal from '../common/Modal';
import Pagination from '../common/Pagination';
import { resolvePartnerId, formatPartner } from '../../utils/orderUtils';
import { toast } from '../../utils/toast';
import { useSalesOrders, SalesOrdersFilters } from '../../hooks/useSalesOrders';
import { useCustomerPreferredProducts } from '../../hooks/useCustomerPreferredProducts';
import { usePcbPlans } from '../../hooks/usePcbPlans';
import {
  Card,
  PageHeader,
  Section,
  DueDatePill,
  StatusPillFilterRow,
  OrderListRow,
  ModalFooterButtons,
  DestructiveButton,
} from '../primitives';

/**
 * 销售管理（Stage C-3 redesign，2026-06-18）。
 *
 * 重做要点（详见 docs/ux-audit.md §2.3）：
 *   1. PageHeader 替换自造 h2 + 英文副标题
 *   2. 筛选区从下拉改成顶部 Pill row（状态）+ PartnerSelect（客户）
 *   3. 列表行用响应式 Card（一套渲染，丢掉桌面/移动双重 JSX）
 *   4. 状态用 Pill primitive，金额用 formatMoney（千分位 + 无空格）
 *   5. 列表行右上角加 DueDatePill（销售订单交期）
 *   6. 列表行的「记录动态」按钮**折叠**到行展开的事件流末尾（OrderDetailsView 的
 *      "+ 添加业务动态" 大入口）——视觉负担减半
 *   7. 创建/编辑 Modal 用 Section 分两段：① 客户与交期 ② 订单明细
 *   8. 顺带：交期字段、价格可选、明细复用上一条等交互打磨（详见 OrderItemsEditor）
 *
 * 与后端的契约：
 *   - 编辑订单**不带 status**——状态推进必须走 api.updateSalesOrderStatus
 *     （详见 rules/frontend-rules.md §2.2 与 docs/PRD.md §9.2 changelog 2026-05-21）。
 *   - expected_delivery_date 走通用 PATCH，可空。
 */

const PAGE_SIZE = 30;

/** 顶部状态 Pill 筛选行的选项；"全部"由 StatusPillFilterRow 自动加，不需要在这里列。 */
const STATUS_FILTERS = [
  { value: 'ORDERED', label: '待处理' },
  { value: 'PRODUCING', label: '生产中' },
  { value: 'SHIPPED', label: '已发货' },
  { value: 'COMPLETED', label: '已完成' },
] as const;

/** 列表行状态 → Pill tone + 中文 label。 */
const STATUS_PILL: Record<
  string,
  { label: string; tone: 'default' | 'warning' | 'accent' | 'success' }
> = {
  ORDERED: { label: '待处理', tone: 'default' },
  PRODUCING: { label: '生产中', tone: 'warning' },
  SHIPPED: { label: '已发货', tone: 'accent' },
  COMPLETED: { label: '已完成', tone: 'success' },
};

interface SalesOrdersPanelProps {
  products: any[];
  partners: any[];
  categories: any[];
  isManager: boolean;
  canCreateEvents: boolean;
}

// PartnerSelect 的"显示值 + 解析 ID"。提交到后端时只用 partner（ID）或 partner_name。
interface PanelFiltersState {
  status: string;
  customerInput: string;
  customerId: number | null;
}

interface OrderFormState {
  customerField: string;
  customerId: number | null;
  /** ISO "YYYY-MM-DD" 或空串。后端可接受 null。 */
  expectedDeliveryDate: string;
  items: OrderItemDraft[];
}

const FIELD_LABEL_CLS = 'text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5';

export default function SalesOrdersPanel({
  products,
  partners,
  isManager,
  categories,
  canCreateEvents,
}: SalesOrdersPanelProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [modal, setModal] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    draftId: number | null;
  }>({ open: false, mode: 'create', draftId: null });

  const [form, setForm] = useState<OrderFormState>({
    customerField: '',
    customerId: null,
    expectedDeliveryDate: '',
    items: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [eventModal, setEventModal] = useState({
    open: false,
    orderId: null as number | null,
    content: '',
  });

  // --- 筛选 + 分页：UI 态 → SalesOrdersFilters ---
  const [panelFilters, setPanelFilters] = useState<PanelFiltersState>({
    status: '',
    customerInput: '',
    customerId: null,
  });
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [panelFilters]);

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

  const customerOptions = useMemo(
    () => partners.filter((p: any) => p.partner_type === 'CUSTOMER' || p.partner_type === 'BOTH'),
    [partners],
  );

  const categoryOptions = useMemo(
    () => (categories || []).map((c: any) => ({ value: String(c.id), label: c.name })),
    [categories],
  );

  const resetFilters = () =>
    setPanelFilters({ status: '', customerInput: '', customerId: null });

  const preferredProducts = useCustomerPreferredProducts(form.customerId, Boolean(form.customerId));

  // 销售明细第二件 = PCB 方案。仅在 modal 打开时取，且只显示启用方案。
  const pcbPlans = usePcbPlans({
    enabled: isManager && modal.open,
    filters: { is_active: true },
    pageSize: 100,
  });

  // --- 业务动作 ---
  const handleAddEvent = (orderId: number) => {
    setEventModal({ open: true, orderId, content: '' });
  };

  const submitEvent = async () => {
    if (!eventModal.content.trim() || !eventModal.orderId) return;
    try {
      setIsSaving(true);
      await api.createSalesOrderEvent(eventModal.orderId, {
        event_type: 'REMARK',
        content: eventModal.content.trim(),
      });
      setEventModal({ ...eventModal, open: false });
      onRefresh();
    } catch (err: any) {
      toast.error('保存失败：' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    setForm({
      customerField: '',
      customerId: null,
      expectedDeliveryDate: '',
      items: [
        {
          id: null,
          product: '',
          pcbPlan: '',
          cable: '',
          price: '',
          quantity: '',
          customName: '',
          detailDescription: '',
        },
      ],
    });
    setModal({ open: true, mode: 'create', draftId: null });
  };

  const openEdit = (order: any) => {
    setForm({
      customerField: formatPartner(order.partner_name, order.partner),
      customerId: Number(order.partner) || null,
      expectedDeliveryDate: order.expected_delivery_date || '',
      items: order.items.map((i: any) => ({
        id: i.id,
        product: i.product ? String(i.product) : '',
        pcbPlan: i.pcb_plan ? String(i.pcb_plan) : '',
        cable: i.cable ? String(i.cable) : '',
        price: i.price !== null && i.price !== undefined ? String(i.price) : '',
        quantity: String(i.quantity),
        customName: i.custom_product_name || '',
        detailDescription: i.detail_description || '',
      })),
    });
    setModal({ open: true, mode: 'edit', draftId: order.id });
  };

  const handleSubmit = async () => {
    const cId = form.customerId ?? resolvePartnerId(form.customerField, customerOptions);
    if (!cId) {
      toast.warning('请选择有效的客户');
      return;
    }

    // BOM-2.0：销售明细必须挂三件；价格可选（数量必填且 > 0）。
    const validItems = form.items.filter(
      (item) => item.product && item.pcbPlan && item.cable && Number(item.quantity) > 0,
    );
    if (validItems.length === 0) {
      toast.warning('订单明细不能为空，且每条必须选齐外壳 + PCB 方案 + 线材，并填写数量');
      return;
    }

    try {
      setIsSaving(true);
      const itemsPayload = validItems.map((i) => ({
        id: i.id || undefined,
        product: Number(i.product),
        pcb_plan: Number(i.pcbPlan),
        cable: Number(i.cable),
        // 价格可空：用户没填时不应当被静默写成 0（金额脱敏边界）。
        // 后端 SalesOrderItem.price 默认 0，前端不传 = 跟默认值一致。
        price: i.price.trim() === '' ? 0 : Number(i.price),
        quantity: Number(i.quantity),
        custom_product_name: i.customName,
        detail_description: i.detailDescription,
      }));

      // expected_delivery_date：空串转 null（后端 DateField 可空）。
      const expected = form.expectedDeliveryDate.trim() || null;

      if (modal.mode === 'create') {
        await api.createSalesOrder({
          partner: cId,
          items_payload: itemsPayload,
          expected_delivery_date: expected,
        });
      } else {
        // 编辑走通用 PATCH，**禁止携带 status**——状态推进走专用 endpoint。
        await api.updateSalesOrder(modal.draftId!, {
          partner: cId,
          items_payload: itemsPayload,
          expected_delivery_date: expected,
        });
      }

      // 客户偏好产品同步（仅写新增的 name）
      if (form.customerId) {
        const existingNames = new Set(
          (preferredProducts.data || []).map((p) => p.name.trim().toLowerCase()),
        );
        const trimmedNames: string[] = validItems
          .map((i) => (i.customName ?? '').trim())
          .filter((s): s is string => s.length > 0);
        const newNames = Array.from(
          new Set(trimmedNames.filter((s) => !existingNames.has(s.toLowerCase()))),
        );
        if (newNames.length) {
          await Promise.all(
            newNames.map((name) =>
              api.createCustomerPreferredProduct({ partner: form.customerId!, name }),
            ),
          );
          preferredProducts.reload();
        }
      }
      setModal({ ...modal, open: false });
      onRefresh();
    } catch (e: any) {
      toast.error(e?.message ?? '提交失败');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 删除销售订单（仅 ORDERED 状态可调用）。
   *
   * 安全机制（详见 docs/PRD.md §3.1 与本次会话 audit）：
   *   1. 仅 status === 'ORDERED' 才允许——更高级状态的订单存在 ProductionRecord
   *      / ShippingLog / PRODUCE_CONSUME StockAdjustment，删订单会留下"消失的扣料/
   *      发货"审计断点。signal `auto_promote_to_producing` 保证 ORDERED ↔ 无 PR
   *   2. CASCADE 链路自动归位 Partner.balance：删 SalesOrder → SalesOrderItem
   *      跟着删 → PartnerLedgerEntry(sales_order OneToOne FK) 跟着删 → balance
   *      property 重新 Sum
   *   3. 一次 window.confirm 提示订单号 + 客户 + 明细数 + 不可撤销
   */
  const handleDeleteOrder = async () => {
    if (modal.mode !== 'edit' || !modal.draftId) return;
    const order = ordersQuery.data.find((o) => o.id === modal.draftId);
    if (!order) return;
    if (order.status !== 'ORDERED') {
      toast.info('只能删除"待处理"状态的销售单');
      return;
    }
    const itemCount = order.items?.length ?? 0;
    if (!window.confirm(
      `确认删除销售单？\n\n` +
      `单号：${order.order_no}\n` +
      `客户：${order.partner_name ?? `#${order.partner}`}\n` +
      `明细数：${itemCount} 条\n\n` +
      `此操作不可撤销。删除后客户应收余额会自动减去该订单金额。`,
    )) return;
    try {
      setIsSaving(true);
      await api.deleteSalesOrder(modal.draftId);
      setModal({ ...modal, open: false });
      onRefresh();
      toast.success('销售单已删除');
    } catch (e: any) {
      toast.error(`删除失败：${e?.message ?? '未知错误'}`);
    } finally {
      setIsSaving(false);
    }
  };

  /** 当前编辑中的订单（拿来判断 status，决定删除按钮是否禁用）。 */
  const editingOrder = modal.mode === 'edit' && modal.draftId
    ? ordersQuery.data.find((o) => o.id === modal.draftId)
    : null;
  const canDelete = !!editingOrder && editingOrder.status === 'ORDERED';

  return (
    <div className="space-y-section-gap animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="销售管理"
        description="按客户查看销售订单与明细"
        actions={
          isManager && (
            <button
              onClick={openCreate}
              className="rounded-pill bg-primary text-on-primary px-5 py-2 text-caption font-bold
                         hover:bg-primary-hover active:scale-95 transition-all shadow-card"
            >
              + 新建销售单
            </button>
          )
        }
      />

      {/* 筛选区：客户搜索 + 状态 Pill row */}
      <Card flat tone="subtle" padding="tight">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 max-w-md">
            <PartnerSelect
              id="sales-filter"
              partners={customerOptions}
              value={panelFilters.customerInput}
              onChange={(val, id) =>
                setPanelFilters((prev) => ({
                  ...prev,
                  customerInput: val,
                  customerId: id ?? null,
                }))
              }
            />
          </div>
          <StatusPillFilterRow
            options={STATUS_FILTERS}
            value={panelFilters.status}
            onChange={(status) => setPanelFilters((prev) => ({ ...prev, status }))}
            onReset={panelFilters.customerInput || panelFilters.status ? resetFilters : undefined}
          />
        </div>
      </Card>

      {/* 列表 */}
      {ordersQuery.loading ? (
        <Card>
          <p className="text-center text-caption text-ink-faint py-8">加载中...</p>
        </Card>
      ) : ordersQuery.error ? (
        <Card tone="danger" padding="tight">
          <p className="text-caption text-danger-ink">⚠ {ordersQuery.error}</p>
        </Card>
      ) : pagedOrders.length === 0 ? (
        <Card>
          <p className="text-center text-caption text-ink-faint py-10">
            没有匹配的销售订单
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {pagedOrders.map((order) => {
            const expanded = expandedId === order.id;
            const statusInfo =
              STATUS_PILL[order.status] ?? { label: order.status, tone: 'default' as const };
            return (
              <OrderListRow
                key={order.id}
                title={order.partner_name || `客户#${order.partner}`}
                subtitle={order.order_no}
                dueDate={order.expected_delivery_date}
                statusLabel={statusInfo.label}
                statusTone={statusInfo.tone}
                amount={order.total_amount}
                canEdit={isManager}
                onEdit={() => openEdit(order)}
                expanded={expanded}
                onToggleExpand={() => setExpandedId(expanded ? null : order.id)}
                expandedContent={
                  <OrderDetailsView
                    mode="sales"
                    items={order.items}
                    events={order.events || []}
                    orderId={order.id}
                    onAddEvent={handleAddEvent}
                    canAddEvent={canCreateEvents}
                  />
                }
              />
            );
          })}
        </div>
      )}

      <Pagination page={page} total={totalCount} onPageChange={setPage} />

      {/* 创建/编辑 Modal */}
      <Modal
        open={modal.open}
        onClose={() => setModal({ ...modal, open: false })}
        title={modal.mode === 'create' ? '创建销售单' : '修改销售单'}
        maxWidth="max-w-5xl"
        footer={
          <ModalFooterButtons
            onCancel={() => setModal({ ...modal, open: false })}
            onSubmit={handleSubmit}
            isSaving={isSaving}
            destructiveAction={
              modal.mode === 'edit' ? (
                <DestructiveButton
                  onClick={handleDeleteOrder}
                  disabled={!canDelete || isSaving}
                  title={
                    canDelete
                      ? '删除此销售单（不可撤销）'
                      : '仅"待处理"状态的销售单可删除——已有排产/发货时不允许'
                  }
                >
                  删除订单
                </DestructiveButton>
              ) : null
            }
          />
        }
      >
        <div className="space-y-section-gap">
          <Section title="① 客户与交期">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1">
                <span className={FIELD_LABEL_CLS}>客户</span>
                <PartnerSelect
                  id="modal-customer"
                  partners={customerOptions}
                  value={form.customerField}
                  onChange={(val, id) =>
                    setForm({ ...form, customerField: val, customerId: id ?? null })
                  }
                />
              </div>
              <div className="space-y-1">
                <span className={FIELD_LABEL_CLS}>预计交付日期（可选）</span>
                <input
                  type="date"
                  value={form.expectedDeliveryDate}
                  onChange={(e) =>
                    setForm({ ...form, expectedDeliveryDate: e.target.value })
                  }
                  className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none
                             focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
                />
                {form.expectedDeliveryDate && (
                  <div className="pt-1">
                    <DueDatePill date={form.expectedDeliveryDate} prefix="距交付" />
                  </div>
                )}
              </div>
            </div>
          </Section>
          <Section title="② 订单明细">
            <OrderItemsEditor
              mode="sales"
              items={form.items}
              products={products}
              categoryOptions={categoryOptions}
              pcbPlans={pcbPlans.data || []}
              preferredModelOptions={(preferredProducts.data || []).map((p) => p.name)}
              onChange={(newItems) => setForm({ ...form, items: newItems })}
            />
          </Section>
        </div>
      </Modal>

      {/* 添加业务动态 Modal */}
      <Modal
        open={eventModal.open}
        onClose={() => setEventModal({ ...eventModal, open: false })}
        title="添加业务动态"
        maxWidth="max-w-md"
        footer={
          <ModalFooterButtons
            onCancel={() => setEventModal({ ...eventModal, open: false })}
            onSubmit={submitEvent}
            isSaving={isSaving}
            submitDisabled={!eventModal.content.trim()}
            submitLabel="确认记录"
            savingLabel="保存中..."
          />
        }
      >
        <div className="space-y-4">
          <Card flat tone="accent" padding="tight">
            <p className="text-caption text-accent-ink leading-relaxed">
              此记录将同步至订单时间线，方便记录客户反馈、生产进度或发货详情。
            </p>
          </Card>
          <div className="space-y-1">
            <span className={FIELD_LABEL_CLS}>动态内容</span>
            <textarea
              autoFocus
              rows={4}
              className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none
                         focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors resize-none"
              placeholder="例如：已安排车间生产，预计后天可发货..."
              value={eventModal.content}
              onChange={(e) => setEventModal({ ...eventModal, content: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
