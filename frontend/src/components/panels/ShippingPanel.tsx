import { useState, useMemo } from 'react';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { useSalesOrders } from '../../hooks/useSalesOrders';
import { useShippingLogs, ShippingLogResponse } from '../../hooks/useShippingLogs';
import Modal from '../common/Modal';
import Pagination from '../common/Pagination';
import { Card, PageHeader, Section, StatTriple, BomTriple, ActionBar, Pill, DueDatePill } from '../primitives';

/**
 * 发货控制（Stage C-2 redesign，2026-06-17）。
 *
 * 三 Tab 拆分（按 docs/ux-audit.md §2.2 计划重做，发货单从历史流水触发）：
 *
 *   1. 「待发列表」—— 按订单分组的卡片。每个销售订单一张大 Card，里面列该订单
 *      所有可发明细。每条明细旁一个 `[全发 N 套]` 按钮，点击即创建一条 ShippingLog
 *      （数量 = available_to_ship_quantity）。这是"今天给客户全发"的最常用场景。
 *      若要部分发货，去 Tab 2 录入精确数量。
 *
 *   2. 「录入发货」—— 选订单 → 自动展开所有可发明细，每行默认 quantity =
 *      available_to_ship。用户改 1~2 个数字 + 提交。运单号顶部统一填。
 *      支持"复用上次"快捷填运单号。
 *
 *   3. 「历史流水」—— 按日期分组的时间线。每条流水有勾选框，顶部 ActionBar：
 *      「为选中 N 条生成发货单」打开 Modal 显示打印友好的发货单 + 打印按钮。
 *      发货单本质上是**对已发生 ShippingLog 的凭证打印**，不是发货流程的一部分。
 *
 * 业务背景：用户可能"做 20000 但先发 10000"——这意味着实际发货量是 ShippingLog 的
 * 即时事实，发货单的内容应该来自历史流水（已发生），而不是预测发货意图。
 *
 * 详见 docs/PRD.md §4.5 BOM-2.1 业务约束（ShippingLog ≤ available_to_ship）。
 */

const SALES_PAGE_SIZE = 200;
const HISTORY_PAGE_SIZE = 50;

type TabKey = 'pending' | 'history';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: '待发列表' },
  { key: 'history', label: '历史流水' },
];

const LAST_TRACKING_KEY = 'mfs-last-tracking-no';

export default function ShippingPanel() {
  const [activeTab, setActiveTab] = useState<TabKey>('pending');

  return (
    <div className="space-y-section-gap animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="发货控制"
        description="单条发或批量发都行 · 历史流水可生成发货单"
        actions={
          <div className="flex items-center gap-1 bg-surface-subtle p-1 rounded-pill">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-1.5 rounded-pill text-caption font-bold transition-all
                  ${activeTab === t.key
                    ? 'bg-surface text-ink shadow-card'
                    : 'text-ink-muted hover:text-ink-body'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      {activeTab === 'pending' && <PendingTab />}
      {activeTab === 'history' && <HistoryTab />}
    </div>
  );
}

// ============================================================================
// Tab 1：待发列表 —— 扁平卡片网格（对齐排产中心的视觉模型）
//
// 设计理念（参考 ProductionPanel）：
//   1. 销售明细打平成 Row[]，每条 = 一张卡，丢弃订单分组层级。一屏密度从
//      "嵌套大 Card + 多个 ItemRow"降到"24 张小卡"，扫视成本更低。
//   2. 卡片用 grid-cols-1/2/3 自适应铺开。卡片头部带客户/单号，便于跨订单识别。
//   3. 全局 ActionBar：搜索 / 运单号 / 全部填满 / 全部清空 / 一键发货。
//   4. 单条不再有自己的"发货"按钮——所有提交统一走顶部"一键发货 → 确认 Modal"。
//      减少误触，又让批量场景天然顺畅。
//   5. available=0 的明细折叠到底部，类似排产的"今日已排完"。
// ============================================================================

interface ShipRow {
  order_id: number;
  order_no: string;
  partner_name: string;
  item_id: number;
  custom_product_name: string;
  detail_description: string;
  /**
   * BOM 三件套——发货员在装车前可一眼核对实际组合是否对得上单子。
   * 数据缺失时显示为 null，UI 渲染成 "—"。
   */
  shell_name: string | null;       // 外壳
  pcb_plan_name: string | null;    // PCB 方案
  cable_name: string | null;       // 线材
  /**
   * 销售订单交期（ISO "YYYY-MM-DD"，可空）——卡片右上角 DueDatePill 来源。
   * 临近交期的订单应优先发货。
   */
  expected_delivery_date: string | null;
  quantity: number;
  shipped: number;
  available: number;
}

function PendingTab() {
  const [search, setSearch] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const ordersQuery = useSalesOrders({
    enabled: true,
    page: 1,
    pageSize: SALES_PAGE_SIZE,
  });

  // 打平：销售明细级 Row（参考 ProductionPanel.allRows）
  const allRows: ShipRow[] = useMemo(() => {
    const out: ShipRow[] = [];
    for (const order of ordersQuery.data) {
      if (order.status === 'COMPLETED') continue;
      for (const item of order.items) {
        out.push({
          order_id: order.id,
          order_no: order.order_no,
          partner_name: order.partner_name ?? '—',
          item_id: item.id,
          custom_product_name: item.custom_product_name,
          detail_description: item.detail_description ?? '',
          shell_name: item.product_detail?.model_name ?? null,
          pcb_plan_name: item.pcb_plan_detail?.name ?? null,
          cable_name: item.cable_detail?.model_name ?? null,
          expected_delivery_date: order.expected_delivery_date ?? null,
          quantity: Number(item.quantity ?? 0),
          shipped: Number(item.shipped_quantity ?? 0),
          available: Number(item.available_to_ship_quantity ?? 0),
        });
      }
    }
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      return out.filter((r) =>
        r.order_no.toLowerCase().includes(kw) ||
        r.partner_name.toLowerCase().includes(kw) ||
        r.custom_product_name.toLowerCase().includes(kw) ||
        r.detail_description.toLowerCase().includes(kw),
      );
    }
    return out;
  }, [ordersQuery.data, search]);

  const pendingRows = useMemo(() => allRows.filter((r) => r.available > 0), [allRows]);
  const doneRows = useMemo(() => allRows.filter((r) => r.available === 0), [allRows]);

  const fillAll = () => {
    const next: Record<number, string> = { ...drafts };
    for (const r of pendingRows) next[r.item_id] = String(r.available);
    setDrafts(next);
  };
  const clearAll = () => setDrafts({});

  type Pending = { row: ShipRow; qty: number };
  const pending: Pending[] = useMemo(() => {
    const list: Pending[] = [];
    for (const r of pendingRows) {
      const raw = drafts[r.item_id];
      if (!raw || raw.trim() === '') continue;
      const qty = Number(raw);
      if (!(qty > 0) || qty > r.available) continue;
      list.push({ row: r, qty });
    }
    return list;
  }, [pendingRows, drafts]);

  const summary = useMemo(() => {
    const totalSets = pending.reduce((s, p) => s + p.qty, 0);
    const customers = new Set(pending.map((p) => p.row.partner_name));
    const orders = new Set(pending.map((p) => p.row.order_no));
    return {
      count: pending.length,
      totalSets,
      customerCount: customers.size,
      orderCount: orders.size,
    };
  }, [pending]);

  const handleReuseLast = () => {
    const last = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_TRACKING_KEY) : null;
    if (last) setTrackingNo(last);
    else toast.info('暂无上次的运单号');
  };

  const openConfirm = () => {
    if (pending.length === 0) {
      toast.warning('请先在卡片里填写要发货的数量（或点"全部按可发量填满"）');
      return;
    }
    setSubmitError(null);
    setConfirmOpen(true);
  };

  const handleSubmitAll = async () => {
    try {
      setSubmitting(true);
      setSubmitError(null);
      const failures: { row: ShipRow; msg: string }[] = [];
      for (const p of pending) {
        try {
          await api.createShippingLog({
            sales_item: p.row.item_id,
            quantity_shipped: p.qty,
            tracking_no: trackingNo.trim() || undefined,
          });
        } catch (err: any) {
          failures.push({ row: p.row, msg: err?.message ?? '未知错误' });
        }
      }
      if (failures.length > 0) {
        setSubmitError(
          `${failures.length}/${pending.length} 条发货失败：\n` +
          failures.map((f) => `· ${f.row.order_no} ${f.row.custom_product_name} — ${f.msg}`).join('\n'),
        );
      } else {
        if (trackingNo.trim() && typeof localStorage !== 'undefined') {
          localStorage.setItem(LAST_TRACKING_KEY, trackingNo.trim());
        }
        setConfirmOpen(false);
      }
      setDrafts({});
      ordersQuery.reload();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* 全局 ActionBar：搜索 + 运单号 + 批量操作 */}
      <Card flat tone="subtle" padding="tight">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              className="flex-1 min-w-0 rounded-pill border border-line bg-surface px-4 py-2 text-body outline-none
                         focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
              placeholder="按客户 / 订单号 / 商品 / 细节描述 搜索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex items-center gap-2 md:max-w-md md:w-1/2">
              <input
                type="text"
                placeholder="本次运单号(可选，应用到本次提交的全部发货)"
                value={trackingNo}
                onChange={(e) => setTrackingNo(e.target.value)}
                className="flex-1 min-w-0 rounded-pill border border-line bg-surface px-4 py-2 text-body outline-none
                           focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
              />
              <button
                onClick={handleReuseLast}
                className="shrink-0 rounded-pill border border-line-strong text-ink-body px-3 py-2 text-caption font-bold
                           hover:bg-surface hover:border-line-focus transition-all whitespace-nowrap"
              >
                复用上次
              </button>
            </div>
          </div>
          <ActionBar align="end">
            <ActionBar.GhostButton onClick={fillAll} disabled={pendingRows.length === 0}>
              全部按可发量填满
            </ActionBar.GhostButton>
            <ActionBar.GhostButton onClick={clearAll} disabled={Object.keys(drafts).length === 0}>
              全部清空
            </ActionBar.GhostButton>
            <ActionBar.PrimaryButton onClick={openConfirm} disabled={pending.length === 0}>
              一键发货（已填 {pending.length} 张）
            </ActionBar.PrimaryButton>
          </ActionBar>
        </div>
      </Card>

      {/* 待发卡片网格 */}
      {ordersQuery.loading ? (
        <Card><p className="text-center text-caption text-ink-faint py-6">加载中...</p></Card>
      ) : ordersQuery.error ? (
        <Card tone="danger" padding="tight">
          <p className="text-caption text-danger-ink">⚠ {ordersQuery.error}</p>
        </Card>
      ) : pendingRows.length === 0 ? (
        <Card>
          <p className="text-center text-caption text-ink-faint py-10">
             当前没有可发货的销售明细
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pendingRows.map((r) => (
            <ShippingCard
              key={r.item_id}
              row={r}
              draft={drafts[r.item_id] ?? ''}
              onDraftChange={(v) =>
                setDrafts((prev) => ({ ...prev, [r.item_id]: v }))
              }
              onFillSuggested={() =>
                setDrafts((prev) => ({ ...prev, [r.item_id]: String(r.available) }))
              }
            />
          ))}
        </div>
      )}

      {/* 已发完折叠区（对齐排产中心的"今日已排完"） */}
      {doneRows.length > 0 && (
        <Section title={`已发完（${doneRows.length} 张）`} accent="success">
          <details className="text-body text-ink-muted">
            <summary className="cursor-pointer text-caption hover:text-ink-body select-none">
              展开查看
            </summary>
            <ul className="mt-3 space-y-1 text-caption">
              {doneRows.map((r) => (
                <li key={r.item_id} className="flex items-center gap-2">
                  <span className="font-mono text-ink-faint">{r.order_no}</span>
                  <span className="text-ink-faint">·</span>
                  <span>{r.partner_name}</span>
                  <span className="text-ink-faint">·</span>
                  <span>{r.custom_product_name}</span>
                </li>
              ))}
            </ul>
          </details>
        </Section>
      )}

      {/* 一键发货确认 Modal */}
      <Modal
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        title="确认本次发货"
        maxWidth="max-w-2xl"
        footer={
          <>
            <ActionBar.GhostButton onClick={() => setConfirmOpen(false)} disabled={submitting}>
              取消
            </ActionBar.GhostButton>
            <ActionBar.PrimaryButton onClick={handleSubmitAll} disabled={submitting} loading={submitting}>
              确认发货
            </ActionBar.PrimaryButton>
          </>
        }
      >
        <div className="space-y-4">
          <StatTriple
            stats={[
              { label: '明细数', value: summary.count },
              { label: '总套数', value: summary.totalSets, tone: 'accent', emphasis: true },
              { label: '客户', value: summary.customerCount },
              { label: '订单', value: summary.orderCount },
            ]}
          />
          {trackingNo.trim() && (
            <Card flat tone="subtle" padding="tight">
              <p className="text-caption text-ink-muted">
                本次运单号：<span className="font-mono text-ink-body font-bold">{trackingNo.trim()}</span>
              </p>
            </Card>
          )}
          <Section title={`本次发货明细（${pending.length} 条）`}>
            <ul className="space-y-2">
              {pending.map((p) => (
                <li key={p.row.item_id}>
                  <Card flat tone="subtle" padding="tight">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-bold text-ink truncate">
                          {p.row.custom_product_name}
                        </p>
                        <p className="text-caption text-ink-faint truncate">
                          <span className="font-mono">{p.row.order_no}</span>
                          <span className="mx-1">·</span>
                          {p.row.partner_name}
                        </p>
                        {p.row.detail_description && (
                          <p
                            className="text-caption text-ink-muted italic mt-1 pl-2 border-l-2 border-line-strong leading-relaxed"
                            title={p.row.detail_description}
                          >
                            {p.row.detail_description}
                          </p>
                        )}
                      </div>
                      <Pill tone="accent">
                        {p.qty} 套 / 可发 {p.row.available}
                      </Pill>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </Section>
          {submitError && (
            <Card tone="danger" padding="tight" flat>
              <pre className="text-caption text-danger-ink whitespace-pre-wrap">{submitError}</pre>
            </Card>
          )}
        </div>
      </Modal>
    </>
  );
}

// ============================================================================
// 发货卡片 —— 一条销售明细 = 一张卡（对齐 ProductionCard 的结构）
// ============================================================================

interface ShippingCardProps {
  row: ShipRow;
  draft: string;
  onDraftChange: (v: string) => void;
  onFillSuggested: () => void;
}

function ShippingCard({ row, draft, onDraftChange, onFillSuggested }: ShippingCardProps) {
  const draftQty = Number(draft);
  const isDraftValid = draft.trim() !== '' && draftQty > 0 && draftQty <= row.available;
  const isOverflow = draft.trim() !== '' && draftQty > row.available;

  return (
    <Card interactive>
      <div className="flex flex-col gap-4">
        {/* 顶部：客户 + 单号 / 右上 DueDatePill（交期紧迫度）+ 本次 N 草稿 Pill */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-body font-bold text-ink truncate">{row.partner_name}</p>
            <p className="text-micro text-ink-faint font-mono mt-0.5">{row.order_no}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <DueDatePill date={row.expected_delivery_date} outline />
            {isDraftValid && <Pill tone="accent">本次 {draftQty}</Pill>}
          </div>
        </div>

        {/* 商品 + 备注（备注三行重要信息：商标 / 颜色 / 工艺） */}
        <div>
          <p className="text-caption text-ink-strong font-medium leading-snug">
            {row.custom_product_name}
          </p>
          {row.detail_description && (
            <p
              className="text-caption text-ink-muted italic mt-1 pl-2 border-l-2 border-line-strong leading-relaxed
                         line-clamp-3"
              title={row.detail_description}
            >
              {row.detail_description}
            </p>
          )}
        </div>

        {/* BOM 三件 —— 装车前一眼核对实际组合 */}
        <BomTriple
          shell={row.shell_name}
          pcbPlan={row.pcb_plan_name}
          cable={row.cable_name}
        />

        {/* 三数字：已发 / 可发 / 总量 */}
        <StatTriple
          stats={[
            { label: '已发', value: row.shipped, tone: 'muted' },
            { label: '可发', value: row.available, tone: 'accent', emphasis: true },
            { label: '总量', value: row.quantity, tone: 'muted' },
          ]}
        />

        {/* 底部：输入 + 填 N 按钮 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <input
              type="number"
              min="0"
              max={row.available}
              step="1"
              placeholder={`≤ ${row.available}`}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              className={`w-full rounded-input border px-3 py-2 text-body font-mono outline-none transition-colors
                          ${isOverflow ? 'border-danger text-danger' : 'border-line focus:border-line-focus'}
                          focus:ring-2 focus:ring-primary/5`}
            />
            {isOverflow && (
              <p className="text-micro text-danger mt-1">超过可发量 {row.available}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onFillSuggested}
            className="rounded-pill border border-line-strong text-ink-body px-3 py-2 text-caption font-bold
                       hover:bg-surface-subtle hover:border-line-focus active:scale-95 transition-all whitespace-nowrap"
          >
            填 {row.available}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Tab 3：历史流水 —— 时间线 + 多选生成发货单
// ============================================================================

function HistoryTab() {
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

  const logsQuery = useShippingLogs({
    enabled: true,
    page,
    pageSize: HISTORY_PAGE_SIZE,
  });

  /**
   * 触发后端 PDF 生成（详见 backend/business/api/shipping_note_pdf.py）。
   *
   * 之前用浏览器 HTML print 的方案被废弃了——理由：
   *   - 浏览器边距 / 页眉页脚不稳定，导致打印对齐不准
   *   - Vite dev 模式下 Tailwind <style> 注入时序问题，Chrome 偶尔打空白
   *
   * 现在走 PDF：后端用 ReportLab 输出固定布局，任何 OS/浏览器/打印机都一致。
   * 司机带去客户签收，1 联客户存档，1 联带回。
   */
  const handleExportPdf = async () => {
    if (selectedIds.size === 0 || exporting) return;
    try {
      setExporting(true);
      const blob = await api.exportShippingNotePdf(Array.from(selectedIds));
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      link.download = `shipping_notes_${ts}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.message ?? '导出发货单失败');
    } finally {
      setExporting(false);
    }
  };

  // 按日期分组
  const groupedByDate = useMemo(() => {
    const map = new Map<string, ShippingLogResponse[]>();
    for (const log of logsQuery.data) {
      const d = new Date(log.shipped_at);
      const key = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [logsQuery.data]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectDay = (logs: ShippingLogResponse[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const l of logs) next.add(l.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  return (
    <div className="space-y-4">
      {/* 顶部 ActionBar */}
      <Card flat tone="subtle" padding="tight">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-caption text-ink-muted">
            勾选历史流水可下载 PDF 发货单（A4，司机带去客户签收）。同客户的多条自动合并成一页。
          </div>
          <ActionBar align="end" className="shrink-0">
            <ActionBar.GhostButton onClick={clearSelection} disabled={selectedIds.size === 0}>
              清空选择
            </ActionBar.GhostButton>
            <ActionBar.PrimaryButton
              onClick={handleExportPdf}
              disabled={selectedIds.size === 0 || exporting}
              loading={exporting}
            >
              📄 下载 {selectedIds.size} 条发货单 PDF
            </ActionBar.PrimaryButton>
          </ActionBar>
        </div>
      </Card>

      {logsQuery.loading ? (
        <Card><p className="text-center text-caption text-ink-faint py-6">加载中...</p></Card>
      ) : logsQuery.error ? (
        <Card tone="danger" padding="tight">
          <p className="text-caption text-danger-ink">⚠ {logsQuery.error}</p>
        </Card>
      ) : groupedByDate.length === 0 ? (
        <Card>
          <p className="text-center text-caption text-ink-faint py-10">暂无发货流水</p>
        </Card>
      ) : (
        groupedByDate.map(([dateKey, logs]) => (
          <Section
            key={dateKey}
            title={dateKey}
            action={
              <button
                onClick={() => selectDay(logs)}
                className="text-caption text-ink-muted hover:text-primary underline-offset-2 hover:underline"
              >
                选中当日全部
              </button>
            }
          >
            <div className="space-y-2">
              {logs.map((log) => {
                const time = new Date(log.shipped_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                const selected = selectedIds.has(log.id);
                return (
                  <Card
                    key={log.id}
                    flat
                    tone={selected ? 'accent' : 'subtle'}
                    padding="tight"
                  >
                    <label className="flex items-start justify-between gap-3 cursor-pointer">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelect(log.id)}
                          className="w-4 h-4 mt-0.5 rounded border-line-strong accent-primary cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-body font-bold text-ink truncate">
                            {log.sales_item_detail?.custom_product_name ?? `明细 #${log.sales_item}`}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap mt-1 text-caption text-ink-muted">
                            {log.partner_name && <span>{log.partner_name}</span>}
                            {log.order_no && <>
                              <span className="text-ink-faint">·</span>
                              <span className="font-mono">{log.order_no}</span>
                            </>}
                            <span className="text-ink-faint">·</span>
                            <span>{log.operator ?? '系统'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Pill tone="success">{log.quantity_shipped} 套</Pill>
                        <span className="text-micro text-ink-faint font-mono">
                          {log.tracking_no || '—'} · {time}
                        </span>
                      </div>
                    </label>
                  </Card>
                );
              })}
            </div>
          </Section>
        ))
      )}
      <Pagination
        page={page}
        pageSize={HISTORY_PAGE_SIZE}
        total={logsQuery.pagination.totalCount}
        onPageChange={setPage}
      />
    </div>
  );
}

