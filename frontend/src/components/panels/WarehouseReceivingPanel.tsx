import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import Pagination from '../common/Pagination';
import {
  usePurchaseOrders,
  PurchaseOrderResponse,
  PurchaseOrdersFilters,
} from '../../hooks/usePurchaseOrders';
import { Card, PageHeader, StatusPillFilterRow } from '../primitives';
import { ReceivingOrderTable } from './warehouse/ReceivingOrderTable';
import { ReceivingModal } from './warehouse/ReceivingModal';
import { ReceivingBatchModal } from './warehouse/ReceivingBatchModal';

/**
 * 收货中心（Stage C-5 redesign，2026-06-18）。
 *
 * 改造要点（详见 docs/ux-audit.md §2.5）：
 *   1. 自管 usePurchaseOrders（带 server-side filter + 分页），不再从 App.tsx 拿 props
 *   2. PageHeader 替换自造 h2 + 英文副标题
 *   3. 顶部状态筛选用 StatusPillFilterRow（去掉巨大的"待收货/部分到货"双 tab）
 *   4. 默认 filter = 不限状态——已入库（RECEIVED）订单会沉到底（按 status 排序）
 *   5. 收货 Modal 简化：删"选择物料"下拉、数量默认剩量、Modal 顶部 banner 改 Section
 *   6. 新增批量收货：订单卡顶部「全部按可收量收货」→ ReceivingBatchModal 一次性 POST N 条
 *   7. DueDatePill 显示采购订单 expected_arrival_date 紧迫度
 *
 * 与排产/发货卡片共用同一套 design tokens 与 primitives。
 */

const PAGE_SIZE = 30;

const STATUS_FILTERS = [
  { value: 'ORDERED', label: '已下单' },
  { value: 'PARTIAL', label: '部分入库' },
  { value: 'RECEIVED', label: '全部入库' },
] as const;

const STATUS_PILL: Record<
  string,
  { label: string; tone: 'default' | 'warning' | 'accent' | 'success' }
> = {
  ORDERED: { label: '已下单', tone: 'default' },
  PARTIAL: { label: '部分入库', tone: 'warning' },
  RECEIVED: { label: '全部入库', tone: 'success' },
};

const statusOf = (s: string) =>
  STATUS_PILL[s] ?? { label: s, tone: 'default' as const };

export default function WarehouseReceivingPanel() {
  // --- 筛选 + 分页 ---
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [supplier, setSupplier] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filterStatus, supplier]);

  const apiFilters = useMemo<PurchaseOrdersFilters>(() => {
    const f: PurchaseOrdersFilters = {};
    if (filterStatus) f.status = filterStatus;
    if (supplier.trim()) f.partner_name = supplier.trim();
    return f;
  }, [filterStatus, supplier]);

  const ordersQuery = usePurchaseOrders({
    enabled: true,
    page,
    pageSize: PAGE_SIZE,
    filters: apiFilters,
  });

  const pagedOrders = ordersQuery.data;
  const totalCount = ordersQuery.pagination.totalCount;
  const onRefresh = ordersQuery.reload;

  // --- 单条收货 Modal ---
  const [singleModal, setSingleModal] = useState<{
    open: boolean;
    orderId: number | null;
    itemId: number | null;
  }>({ open: false, orderId: null, itemId: null });
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleSaving, setSingleSaving] = useState(false);

  const handleOpenSingle = (orderId: number, itemId: number) => {
    setSingleModal({ open: true, orderId, itemId });
    setSingleError(null);
  };

  const handleCloseSingle = () => setSingleModal({ open: false, orderId: null, itemId: null });

  const handleSingleSubmit = async ({ quantity, remark }: { quantity: number; remark: string }) => {
    if (!singleModal.itemId) return;
    try {
      setSingleSaving(true);
      setSingleError(null);
      await api.createReceivingLog({
        purchase_item: singleModal.itemId,
        quantity_received: quantity,
        remark: remark || undefined,
      });
      handleCloseSingle();
      await onRefresh();
    } catch (err: any) {
      setSingleError(err?.message ?? '入库失败');
    } finally {
      setSingleSaving(false);
    }
  };

  // --- 批量收货 Modal ---
  const [batchModal, setBatchModal] = useState<{ open: boolean; orderId: number | null }>({
    open: false,
    orderId: null,
  });
  const [batchSaving, setBatchSaving] = useState(false);

  const handleOpenBatch = (orderId: number) => {
    setBatchModal({ open: true, orderId });
  };
  const handleCloseBatch = () => setBatchModal({ open: false, orderId: null });

  const handleBatchSubmit = async (
    payloads: { purchase_item: number; quantity_received: number; remark?: string }[],
  ) => {
    setBatchSaving(true);
    try {
      const failures: { item: any; msg: string }[] = [];
      // 串行避免后端 ReceivingLog 校验在并发下漂移
      for (const p of payloads) {
        try {
          await api.createReceivingLog(p);
        } catch (err: any) {
          const item =
            pagedOrders
              .flatMap((o) => o.items)
              .find((i) => i.id === p.purchase_item) ?? { id: p.purchase_item };
          failures.push({ item, msg: err?.message ?? '入库失败' });
        }
      }
      await onRefresh();
      if (failures.length === 0) handleCloseBatch();
      return failures;
    } finally {
      setBatchSaving(false);
    }
  };

  const currentSingleOrder: PurchaseOrderResponse | null = singleModal.orderId
    ? pagedOrders.find((o) => o.id === singleModal.orderId) ?? null
    : null;
  const currentBatchOrder: PurchaseOrderResponse | null = batchModal.orderId
    ? pagedOrders.find((o) => o.id === batchModal.orderId) ?? null
    : null;

  return (
    <div className="space-y-section-gap animate-in fade-in duration-500 pb-20">
      <PageHeader title="收货中心" description="按供应商核对到货并入库" />

      {/* 筛选区 */}
      <Card flat tone="subtle" padding="tight">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 max-w-md">
            <input
              className="w-full rounded-input border border-line bg-surface px-4 py-2 text-body outline-none
                         focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
              placeholder="按供应商名称搜索..."
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>
          <StatusPillFilterRow
            options={STATUS_FILTERS}
            value={filterStatus}
            onChange={setFilterStatus}
            onReset={
              filterStatus || supplier
                ? () => {
                    setFilterStatus('');
                    setSupplier('');
                  }
                : undefined
            }
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
          <p className="text-center text-caption text-ink-faint py-10">没有匹配的采购订单</p>
        </Card>
      ) : (
        <ReceivingOrderTable
          orders={pagedOrders}
          statusOf={statusOf}
          onReceiveOne={handleOpenSingle}
          onReceiveAll={handleOpenBatch}
        />
      )}

      <Pagination page={page} total={totalCount} onPageChange={setPage} />

      {/* 单条收货 Modal */}
      <ReceivingModal
        open={singleModal.open}
        onClose={handleCloseSingle}
        order={currentSingleOrder}
        itemId={singleModal.itemId}
        onSubmit={handleSingleSubmit}
        error={singleError}
        saving={singleSaving}
      />

      {/* 批量收货 Modal */}
      <ReceivingBatchModal
        open={batchModal.open}
        onClose={handleCloseBatch}
        order={currentBatchOrder}
        onSubmit={handleBatchSubmit}
        saving={batchSaving}
      />
    </div>
  );
}
