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
import { usePurchaseOrders, PurchaseOrdersFilters } from '../../hooks/usePurchaseOrders';
import {
  Card,
  PageHeader,
  Section,
  DueDatePill,
  StatusPillFilterRow,
  OrderListRow,
  ModalFooterButtons,
  DestructiveButton,
  ConfirmDialog,
} from '../primitives';

/**
 * 采购管理（Stage C-4 redesign，2026-06-18）。
 *
 * 与 SalesOrdersPanel 镜像对称，借助 3 个新 primitives（StatusPillFilterRow /
 * OrderListRow / ModalFooterButtons）降低重复。详见 docs/ux-audit.md §2.4。
 *
 * 主要改动：
 *   1. 标题区改 PageHeader（中文化，丢英文副标题 "Inbound Logistics Control"）
 *   2. 筛选改 server-side（之前 client-side usePaginatedFilter 与销售口径不一致）
 *   3. 修 typo：`bg白` → `bg-white`、`text-rigth` → `text-right`（顺便整段不用了）
 *   4. 自管订单数据，自带 hook + 分页——和 SalesOrdersPanel 对齐，
 *      App.tsx 不再传 orders/loading/error/onRefresh
 *   5. 「记录动态」按钮折叠进行展开里（OrderDetailsView 的 + 添加业务动态 入口）
 *   6. 列表行加 DueDatePill（expected_arrival_date）
 *   7. 编辑 Modal Section 分段：① 供应商与到货 ② 订单明细
 *   8. 金额走 formatMoney 千分位
 *
 * 与后端契约：与销售单不同，采购单的编辑表单可以带 status——后端没有像销售
 * 那样禁止通用 PATCH 改状态（采购的状态机更简单：ORDERED → PARTIAL → RECEIVED
 * 且 PARTIAL 由 ReceivingLog 自动驱动）。
 */

const PAGE_SIZE = 30;

/** "全部"由 StatusPillFilterRow 自动加，这里只列业务状态。 */
const STATUS_FILTERS = [
  { value: 'ORDERED', label: '已下单' },
  { value: 'PARTIAL', label: '部分入库' },
  { value: 'RECEIVED', label: '全部入库' },
] as const;

/** 列表行 + Modal 内显示用的状态映射。 */
const STATUS_PILL: Record<
  string,
  { label: string; tone: 'default' | 'warning' | 'accent' | 'success' }
> = {
  ORDERED: { label: '已下单', tone: 'default' },
  PARTIAL: { label: '部分入库', tone: 'warning' },
  RECEIVED: { label: '全部入库', tone: 'success' },
};

interface PurchasePanelProps {
  products: any[];
  partners: any[];
  categories: any[];
  isManager: boolean;
  canCreateEvents: boolean;
}

interface PanelFiltersState {
  status: string;
  supplierInput: string;
  supplierId: number | null;
  /** 2026-06-19 归档机制：默认 false → 列表只显示未归档单；勾上"查看已归档"
   *  切到 true，列表显示已归档单。详见 docs/PRD.md §9.4。 */
  viewArchived: boolean;
}

interface OrderFormState {
  supplierField: string;
  supplierId: number | null;
  /** ISO "YYYY-MM-DD" 或空串。后端可空。 */
  expectedArrivalDate: string;
  /** 采购单允许通用 PATCH 改 status（与销售不同——见模块顶 docstring）。 */
  status: string;
  /** 2026-06-19：供应商订单号，可空。详见 PurchaseOrderResponse.partner_order_no 文档。 */
  partnerOrderNo: string;
  items: OrderItemDraft[];
}

const FIELD_LABEL_CLS = 'text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5';

export default function PurchasePanel({
  products,
  partners,
  isManager,
  categories,
  canCreateEvents,
}: PurchasePanelProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [modal, setModal] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    draftId: number | null;
  }>({ open: false, mode: 'create', draftId: null });

  const [form, setForm] = useState<OrderFormState>({
    supplierField: '',
    supplierId: null,
    expectedArrivalDate: '',
    status: 'ORDERED',
    partnerOrderNo: '',
    items: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [eventModal, setEventModal] = useState({
    open: false,
    orderId: null as number | null,
    content: '',
  });
  // 归档确认对话框（2026-06-19）。与 SalesOrdersPanel 同口径，详见 §9.4。
  const [archiveConfirm, setArchiveConfirm] = useState<{
    mode: 'batch' | 'unarchive' | null;
    orderId?: number;
    orderNo?: string;
  }>({ mode: null });
  const [archiveWorking, setArchiveWorking] = useState(false);
  // 删除订单确认（2026-06-19 统一用 ConfirmDialog 替代 window.confirm）。
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; orderId: number | null }>({
    open: false,
    orderId: null,
  });
  const [deleteWorking, setDeleteWorking] = useState(false);

  // --- 筛选 + 分页：UI 态 → PurchaseOrdersFilters ---
  const [panelFilters, setPanelFilters] = useState<PanelFiltersState>({
    status: '',
    supplierInput: '',
    supplierId: null,
    viewArchived: false,
  });
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [panelFilters]);

  const apiFilters = useMemo<PurchaseOrdersFilters>(() => {
    const next: PurchaseOrdersFilters = {};
    if (panelFilters.status) next.status = panelFilters.status;
    if (panelFilters.supplierId) {
      next.partner = panelFilters.supplierId;
    } else if (panelFilters.supplierInput.trim()) {
      next.partner_name = panelFilters.supplierInput.trim();
    }
    // 仅在"查看已归档"开启时显式传 is_archived=true；关闭时不传，让后端
    // 默认 queryset 走 is_archived=False（详见 docs/PRD.md §9.4）。
    if (panelFilters.viewArchived) {
      next.is_archived = true;
    }
    return next;
  }, [panelFilters]);

  const ordersQuery = usePurchaseOrders({
    enabled: true,
    page,
    pageSize: PAGE_SIZE,
    filters: apiFilters,
  });
  const pagedOrders = ordersQuery.data;
  const totalCount = ordersQuery.pagination.totalCount;
  const onRefresh = ordersQuery.reload;

  const supplierOptions = useMemo(
    () => partners.filter((p: any) => p.partner_type === 'SUPPLIER' || p.partner_type === 'BOTH'),
    [partners],
  );

  const categoryOptions = useMemo(
    () => (categories || []).map((c: any) => ({ value: String(c.id), label: c.name })),
    [categories],
  );

  const resetFilters = () =>
    setPanelFilters({ status: '', supplierInput: '', supplierId: null, viewArchived: false });

  // --- 业务动作 ---
  const handleAddEvent = (orderId: number) => {
    setEventModal({ open: true, orderId, content: '' });
  };

  const submitEvent = async () => {
    if (!eventModal.content.trim() || !eventModal.orderId) return;
    try {
      setIsSaving(true);
      await api.createPurchaseOrderEvent(eventModal.orderId, {
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
      supplierField: '',
      supplierId: null,
      expectedArrivalDate: '',
      status: 'ORDERED',
      partnerOrderNo: '',
      items: [
        { id: null, category: '', product: '', price: '', quantity: '' },
      ],
    });
    setModal({ open: true, mode: 'create', draftId: null });
  };

  const openEdit = (order: any) => {
    setForm({
      supplierField: formatPartner(order.partner_name, order.partner),
      supplierId: Number(order.partner) || null,
      expectedArrivalDate: order.expected_arrival_date || '',
      status: order.status,
      partnerOrderNo: order.partner_order_no || '',
      items: order.items.map((i: any) => ({
        id: i.id,
        category: String(i.product_detail?.category_detail?.id || ''),
        product: String(i.product),
        price: i.price !== null && i.price !== undefined ? String(i.price) : '',
        quantity: String(i.quantity),
      })),
    });
    setModal({ open: true, mode: 'edit', draftId: order.id });
  };

  const handleSubmit = async () => {
    const sId = form.supplierId ?? resolvePartnerId(form.supplierField, supplierOptions);
    if (!sId) {
      toast.warning('请选择有效的供应商');
      return;
    }

    // 价格可选；数量必填且 > 0。采购明细不需要校验三件套（那是销售）。
    const validItems = form.items.filter(
      (item) => item.product && Number(item.quantity) > 0,
    );
    if (validItems.length === 0) {
      toast.warning('订单至少需要包含一项有效明细，且数量大于 0');
      return;
    }

    try {
      setIsSaving(true);
      const itemsPayload = validItems.map((i) => ({
        id: i.id || undefined,
        product: Number(i.product),
        price: i.price.trim() === '' ? 0 : Number(i.price),
        quantity: Number(i.quantity),
      }));

      const expected = form.expectedArrivalDate.trim() || null;

      if (modal.mode === 'create') {
        // 2026-06-19：供应商订单号
        const partnerOrderNo = form.partnerOrderNo.trim();
        await api.createPurchaseOrder({
          partner: sId,
          items_payload: itemsPayload,
          expected_arrival_date: expected,
          partner_order_no: partnerOrderNo,
        });
      } else {
        const partnerOrderNo = form.partnerOrderNo.trim();
        await api.updatePurchaseOrder(modal.draftId!, {
          partner: sId,
          status: form.status,
          items_payload: itemsPayload,
          expected_arrival_date: expected,
          partner_order_no: partnerOrderNo,
        });
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
   * 删除采购订单（仅 ORDERED 状态可调用）。
   *
   * 安全机制（详见 SalesOrdersPanel.handleDeleteOrder 同款注释）：
   *   - 仅 status === 'ORDERED'：PARTIAL/RECEIVED 已有 ReceivingLog 改过 stock_quantity，
   *     删订单会留下"消失的入库"审计断点
   *   - CASCADE 链路自动归位 Partner.balance（应付金额跟着减）
   *   - ConfirmDialog 提示单号 + 供应商 + 明细数（2026-06-19 替代 window.confirm）
   */
  const openDeleteOrderConfirm = () => {
    if (modal.mode !== 'edit' || !modal.draftId) return;
    const order = ordersQuery.data.find((o) => o.id === modal.draftId);
    if (!order) return;
    if (order.status !== 'ORDERED') {
      toast.info('只能删除"已下单"状态的采购单');
      return;
    }
    setDeleteConfirm({ open: true, orderId: modal.draftId });
  };

  const handleDeleteOrderConfirm = async () => {
    if (!deleteConfirm.orderId) return;
    try {
      setDeleteWorking(true);
      await api.deletePurchaseOrder(deleteConfirm.orderId);
      setDeleteConfirm({ open: false, orderId: null });
      setModal({ ...modal, open: false });
      onRefresh();
      toast.success('采购单已删除');
    } catch (e: any) {
      toast.error(`删除失败：${e?.message ?? '未知错误'}`);
    } finally {
      setDeleteWorking(false);
    }
  };

  /** 当前编辑中的订单，用来判断 status 决定删除按钮是否禁用。 */
  const editingOrder = modal.mode === 'edit' && modal.draftId
    ? ordersQuery.data.find((o) => o.id === modal.draftId)
    : null;
  const canDelete = !!editingOrder && editingOrder.status === 'ORDERED';

  /** 当前要删除的订单（用于 ConfirmDialog message 渲染）。 */
  const deletingOrder = deleteConfirm.orderId
    ? ordersQuery.data.find((o) => o.id === deleteConfirm.orderId) ?? null
    : null;

  /** 2026-06-19：下载采购订单确认书 PDF（同 SalesOrdersPanel）。 */
  const handleDownloadPdf = async (orderId: number) => {
    try {
      const { blob, filename } = await api.downloadPurchaseOrderPdf(orderId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF 下载完成');
    } catch (e: any) {
      toast.error(`下载失败：${e?.message ?? '未知错误'}`);
    }
  };

  // ----- 归档机制（2026-06-19）：confirm 走 ConfirmDialog primitive ---------

  /** 点"年末归档"按钮：打开批量归档确认窗。 */
  const openArchiveBatchConfirm = () => setArchiveConfirm({ mode: 'batch' });

  /** 点单条"取消归档"按钮：打开取消归档确认窗。 */
  const openUnarchiveConfirm = (orderId: number, orderNo: string) =>
    setArchiveConfirm({ mode: 'unarchive', orderId, orderNo });

  /** ConfirmDialog 的 onConfirm —— 根据 mode 路由到对应的 async 操作。 */
  const handleArchiveConfirm = async () => {
    if (archiveConfirm.mode === 'batch') {
      try {
        setArchiveWorking(true);
        const result = await api.archivePurchaseOrdersBatch();
        const count = (result as any)?.archived_count ?? 0;
        setArchiveConfirm({ mode: null });
        if (count === 0) {
          toast.info('没有可归档的采购单（需 status=全部入库 且未归档）');
        } else {
          toast.success(`已归档 ${count} 张采购单`);
        }
        onRefresh();
      } catch (e: any) {
        toast.error(`归档失败：${e?.message ?? '未知错误'}`);
      } finally {
        setArchiveWorking(false);
      }
    } else if (archiveConfirm.mode === 'unarchive' && archiveConfirm.orderId) {
      try {
        setArchiveWorking(true);
        await api.unarchivePurchaseOrder(archiveConfirm.orderId);
        setArchiveConfirm({ mode: null });
        toast.success('已取消归档');
        onRefresh();
      } catch (e: any) {
        toast.error(`取消归档失败：${e?.message ?? '未知错误'}`);
      } finally {
        setArchiveWorking(false);
      }
    }
  };

  return (
    <div className="space-y-section-gap animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="采购管理"
        description="按供应商查看采购订单与到货进度"
        actions={
          isManager && (
            <div className="flex items-center gap-2">
              <button
                onClick={openArchiveBatchConfirm}
                className="rounded-pill border border-line-strong bg-surface text-ink-body
                           px-4 py-2 text-caption font-bold
                           hover:bg-surface-subtle hover:border-line-focus transition-all"
                title="一键归档所有已全部入库的采购单（详见 PRD §9.4 归档机制）"
              >
                年末归档
              </button>
              <button
                onClick={openCreate}
                className="rounded-pill bg-primary text-on-primary px-5 py-2 text-caption font-bold
                           hover:bg-primary-hover active:scale-95 transition-all shadow-card"
              >
                + 新建采购单
              </button>
            </div>
          )
        }
      />

      {/* 筛选区 */}
      <Card flat tone="subtle" padding="tight">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 max-w-md">
            <PartnerSelect
              id="purchase-filter"
              partners={supplierOptions}
              value={panelFilters.supplierInput}
              onChange={(val, id) =>
                setPanelFilters((prev) => ({
                  ...prev,
                  supplierInput: val,
                  supplierId: id ?? null,
                }))
              }
            />
          </div>
          <StatusPillFilterRow
            options={STATUS_FILTERS}
            value={panelFilters.status}
            onChange={(status) => setPanelFilters((prev) => ({ ...prev, status }))}
            onReset={
              panelFilters.supplierInput || panelFilters.status || panelFilters.viewArchived ? resetFilters : undefined
            }
          />
        </div>
        {/* 查看已归档复选框——勾上后 list 切到归档单视图（详见 §9.4 归档机制）。 */}
        <label className="mt-2 flex items-center gap-2 text-caption text-ink-faint cursor-pointer select-none w-fit">
          <input
            type="checkbox"
            checked={panelFilters.viewArchived}
            onChange={(e) =>
              setPanelFilters((prev) => ({ ...prev, viewArchived: e.target.checked }))
            }
            className="rounded border-line-strong"
          />
          查看已归档订单
        </label>
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
            没有匹配的采购订单
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
                title={order.partner_name || `供应商#${order.partner}`}
                // 2026-06-19：供应商单号优先，内部单号灰显；空则只显示内部单号
                subtitle={
                  order.partner_order_no
                    ? `${order.partner_order_no}  ·  ${order.order_no}`
                    : order.order_no
                }
                dueDate={order.expected_arrival_date}
                statusLabel={statusInfo.label}
                statusTone={statusInfo.tone}
                amount={order.total_amount}
                archived={Boolean(order.is_archived)}
                canEdit={isManager && !order.is_archived}
                onEdit={() => openEdit(order)}
                expanded={expanded}
                onToggleExpand={() => setExpandedId(expanded ? null : order.id)}
                expandedContent={
                  <div>
                    {/* 2026-06-19：操作条——下载 PDF + 取消归档（如有）。
                        同 SalesOrdersPanel 处理 */}
                    <div className="px-5 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-line">
                      <p className="text-micro text-ink-faint">
                        {order.is_archived && (
                          <>
                            已归档 · {order.archived_at?.slice(0, 10) ?? '未知日期'}
                            {order.archived_by ? ` · 操作员 ${order.archived_by}` : ''}
                          </>
                        )}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(order.id)}
                          className="rounded-pill border border-line-strong text-ink-body px-3 py-1
                                     text-micro font-bold hover:bg-surface hover:border-line-focus
                                     transition-all whitespace-nowrap"
                          title="下载采购订单确认书 PDF（给供应商签字）"
                        >
                          ⬇ 下载采购单
                        </button>
                        {order.is_archived && isManager && (
                          <button
                            type="button"
                            onClick={() => openUnarchiveConfirm(order.id, order.order_no)}
                            className="rounded-pill border border-line-strong text-ink-body px-3 py-1
                                       text-micro font-bold hover:bg-surface hover:border-line-focus
                                       transition-all whitespace-nowrap"
                          >
                            取消归档
                          </button>
                        )}
                      </div>
                    </div>
                    <OrderDetailsView
                      mode="purchase"
                      items={order.items}
                      events={order.events || []}
                      orderId={order.id}
                      onAddEvent={handleAddEvent}
                      canAddEvent={canCreateEvents && !order.is_archived}
                    />
                  </div>
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
        title={modal.mode === 'create' ? '创建采购单' : '修改采购单'}
        maxWidth="max-w-4xl"
        footer={
          <ModalFooterButtons
            onCancel={() => setModal({ ...modal, open: false })}
            onSubmit={handleSubmit}
            isSaving={isSaving}
            destructiveAction={
              modal.mode === 'edit' ? (
                <DestructiveButton
                  onClick={openDeleteOrderConfirm}
                  disabled={!canDelete || isSaving}
                  title={
                    canDelete
                      ? '删除此采购单（不可撤销）'
                      : '仅"已下单"状态的采购单可删除——已有入库时不允许'
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
          <Section title="① 供应商与到货">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1">
                <span className={FIELD_LABEL_CLS}>供应商</span>
                <PartnerSelect
                  id="modal-supplier"
                  partners={supplierOptions}
                  value={form.supplierField}
                  onChange={(val, id) =>
                    setForm({ ...form, supplierField: val, supplierId: id ?? null })
                  }
                />
              </div>
              <div className="space-y-1">
                <span className={FIELD_LABEL_CLS}>预计到货日期（可选）</span>
                <input
                  type="date"
                  value={form.expectedArrivalDate}
                  onChange={(e) =>
                    setForm({ ...form, expectedArrivalDate: e.target.value })
                  }
                  className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none
                             focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
                />
                {form.expectedArrivalDate && (
                  <div className="pt-1">
                    <DueDatePill date={form.expectedArrivalDate} prefix="距到货" />
                  </div>
                )}
              </div>
            </div>
            {/* 2026-06-19：供应商订单号 */}
            <div className="mt-3 space-y-1">
              <span className={FIELD_LABEL_CLS}>供应商订单号（可选）</span>
              <input
                type="text"
                value={form.partnerOrderNo}
                onChange={(e) => setForm({ ...form, partnerOrderNo: e.target.value })}
                placeholder="供应商系统里的订单编号。可空。"
                className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none
                           focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
                maxLength={100}
              />
              <p className="text-micro text-ink-faint">
                若填写，收货 / PDF 都优先用此单号；空则用我们的内部单号
              </p>
            </div>
            {/* 状态编辑（采购允许通用 PATCH 改状态，仅在 edit 模式显示） */}
            {modal.mode === 'edit' && (
              <div className="mt-3 space-y-1">
                <span className={FIELD_LABEL_CLS}>当前状态</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full md:w-1/3 rounded-input border border-line bg-surface px-3 py-2 text-body outline-none
                             focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
                >
                  {STATUS_FILTERS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Section>
          <Section title="② 订单明细">
            <OrderItemsEditor
              mode="purchase"
              items={form.items}
              products={products}
              categoryOptions={categoryOptions}
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
              此记录将同步至订单时间线，方便后续追溯发货、收货或沟通进度。
            </p>
          </Card>
          <div className="space-y-1">
            <span className={FIELD_LABEL_CLS}>动态内容</span>
            <textarea
              autoFocus
              rows={4}
              className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none
                         focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors resize-none"
              placeholder="例如：已联系厂家，预计下周三准时发货..."
              value={eventModal.content}
              onChange={(e) => setEventModal({ ...eventModal, content: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* 归档相关确认窗（2026-06-19）—— 替代 window.confirm 默认丑窗 */}
      <ConfirmDialog
        open={archiveConfirm.mode === 'batch'}
        onClose={() => !archiveWorking && setArchiveConfirm({ mode: null })}
        onConfirm={handleArchiveConfirm}
        isWorking={archiveWorking}
        title="年末归档采购单"
        confirmLabel="确认归档"
        message={
          <div className="space-y-3">
            <p>会把所有 <strong className="text-ink">全部入库</strong> 且未归档的采购单标记为已归档。</p>
            <div className="rounded-input bg-surface-subtle/60 px-3 py-2 text-caption text-ink-faint space-y-1">
              <p>• 日常列表不再显示这些单（可勾"查看已归档"看到）</p>
              <p>• 供应商应付余额、财务流水仍然包含</p>
              <p>• manager 可单条"取消归档"恢复</p>
            </div>
          </div>
        }
      />
      <ConfirmDialog
        open={archiveConfirm.mode === 'unarchive'}
        onClose={() => !archiveWorking && setArchiveConfirm({ mode: null })}
        onConfirm={handleArchiveConfirm}
        isWorking={archiveWorking}
        title="取消归档"
        confirmLabel="取消归档"
        message={
          <p>
            确认取消归档采购单 <strong className="text-ink font-mono">{archiveConfirm.orderNo}</strong>？
            <br /><span className="text-ink-faint">取消后订单可再次编辑和操作。</span>
          </p>
        }
      />

      {/* 删除订单确认（2026-06-19 替代 window.confirm，详见 §9.4 changelog） */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => !deleteWorking && setDeleteConfirm({ open: false, orderId: null })}
        onConfirm={handleDeleteOrderConfirm}
        isWorking={deleteWorking}
        tone="danger"
        title="删除采购单"
        confirmLabel="确认删除"
        message={
          deletingOrder ? (
            <div className="space-y-3">
              <p>确认删除以下采购单？</p>
              <div className="rounded-input bg-surface-subtle/60 px-3 py-2 text-caption text-ink-body space-y-1">
                <p>单号：<span className="font-mono">{deletingOrder.order_no}</span></p>
                <p>供应商：{deletingOrder.partner_name ?? `#${deletingOrder.partner}`}</p>
                <p>明细数：{deletingOrder.items?.length ?? 0} 条</p>
              </div>
              <p className="text-caption text-danger-ink">
                此操作不可撤销。删除后供应商应付余额会自动减去该订单金额。
              </p>
            </div>
          ) : null
        }
      />
    </div>
  );
}
