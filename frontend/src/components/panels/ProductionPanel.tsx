import { useState, useMemo } from 'react';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { useSalesOrders } from '../../hooks/useSalesOrders';
import Modal from '../common/Modal';
import { Card, PageHeader, Section, StatTriple, BomTriple, ActionBar, Pill, DueDatePill } from '../primitives';

/**
 * 排产中心（Stage C-1 redesign，2026-06-17）。
 *
 * 视角：以销售明细为主体的"今日排产"。
 *
 * 重构要点（详见 docs/ux-audit.md §2.1 与 docs/design-system.md）：
 *   1. 列表 = 卡片网格（grid-cols-3），不再是 12 列表格——视觉密度从"满屏数字"
 *      降到"几张卡片"。
 *   2. 每张卡只显示 3 个数字（已生产 / 待排 / 总量），"已发"在排产场景下无用，
 *      移除。
 *   3. **全局批量化**：顶部 ActionBar 三个按钮——"全部按建议填满 / 全部清空 /
 *      一键提交（已填 N 张）"。日常 8 个客户排产从 8×3 次交互压到 1 次提交 + 1 次确认。
 *   4. window.confirm 替换为 Modal 汇总抽屉：列出本次排产的明细 + 共计扣料数。
 *      "确认排产并扣料"按钮一次按下完成所有 POST。
 *   5. awaiting=0 的明细折叠到底部"今日已排完（N 张）" Section，不再占主视野。
 *   6. 全面使用 primitives（Card / PageHeader / StatTriple / ActionBar / Pill），
 *      去掉硬编码 amber/slate 色阶。
 *
 * 详见 docs/PRD.md §4.5 BOM-2.1 业务约束（过排产禁止 + 创建即扣料 + 首条记录推 PRODUCING）。
 */

const PAGE_SIZE = 100;

interface Row {
  order_id: number;
  order_no: string;
  partner_name: string;
  item_id: number;
  custom_product_name: string;
  /**
   * 销售明细的细节描述——商标 / 颜色 / 印刷工艺等关键生产信息。
   * 排产员看这条字段决定"今天用哪个品牌的料"，必须在卡片显眼处展示。
   */
  detail_description: string;
  /**
   * BOM 三件套——排产前一眼能确认会扣哪三样料。
   * 字段全部允许 null：旧数据可能没挂全；新数据 serializer 强制三件齐。
   */
  shell_name: string | null;       // 外壳
  pcb_plan_name: string | null;    // PCB 方案
  cable_name: string | null;       // 线材
  /**
   * 销售订单交期（ISO "YYYY-MM-DD"，可空）——卡片右上角 DueDatePill 来源。
   * 紧迫的订单（≤3 天 / 已逾期）应优先排产。
   */
  expected_delivery_date: string | null;
  quantity: number;
  produced: number;
  awaiting: number; // 待排 = quantity - produced
}

export default function ProductionPanel() {
  const [search, setSearch] = useState('');
  const ordersQuery = useSalesOrders({
    enabled: true,
    page: 1,
    pageSize: PAGE_SIZE,
  });

  // draft = 每条明细的"今日排产数量"草稿（string 适配输入框）
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  // 整批提交时的 Modal 状态
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 把订单/明细打平成 Row[]，过滤掉已 COMPLETED 订单
  const allRows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const order of ordersQuery.data) {
      if (order.status === 'COMPLETED') continue;
      for (const item of order.items) {
        const produced = Number(item.produced_quantity ?? 0);
        const quantity = Number(item.quantity ?? 0);
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
          quantity,
          produced,
          awaiting: Math.max(0, quantity - produced),
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

  // 待排（awaiting > 0）作为主视图；awaiting === 0 折叠到底部
  const pendingRows = useMemo(() => allRows.filter((r) => r.awaiting > 0), [allRows]);
  const doneRows = useMemo(() => allRows.filter((r) => r.awaiting === 0), [allRows]);

  // 批量操作：把所有 pending 卡片的 draft 填成 awaiting
  const fillAllSuggested = () => {
    const next: Record<number, string> = { ...drafts };
    for (const r of pendingRows) {
      next[r.item_id] = String(r.awaiting);
    }
    setDrafts(next);
  };
  const clearAll = () => setDrafts({});

  // 待提交明细：draft > 0 且 ≤ awaiting
  type Pending = { row: Row; qty: number };
  const pendingSubmissions: Pending[] = useMemo(() => {
    const list: Pending[] = [];
    for (const r of pendingRows) {
      const raw = drafts[r.item_id];
      if (!raw || raw.trim() === '') continue;
      const qty = Number(raw);
      if (!(qty > 0) || qty > r.awaiting) continue;
      list.push({ row: r, qty });
    }
    return list;
  }, [pendingRows, drafts]);

  // 汇总：总套数 + 涉及的客户数 + 涉及的订单数
  const summary = useMemo(() => {
    const totalSets = pendingSubmissions.reduce((s, p) => s + p.qty, 0);
    const customers = new Set(pendingSubmissions.map((p) => p.row.partner_name));
    const orders = new Set(pendingSubmissions.map((p) => p.row.order_no));
    return {
      count: pendingSubmissions.length,
      totalSets,
      customerCount: customers.size,
      orderCount: orders.size,
    };
  }, [pendingSubmissions]);

  const openConfirm = () => {
    if (pendingSubmissions.length === 0) {
      toast.warning('请先在卡片里填写要排产的数量（或点"全部按建议填满"）');
      return;
    }
    setSubmitError(null);
    setConfirmOpen(true);
  };

  const handleSubmitAll = async () => {
    try {
      setSubmitting(true);
      setSubmitError(null);
      // 串行提交避免后端串扰；每条单独 try-catch 收集失败
      const failures: { row: Row; msg: string }[] = [];
      for (const p of pendingSubmissions) {
        try {
          await api.createProductionRecord({
            sales_item: p.row.item_id,
            quantity: p.qty,
          });
        } catch (err: any) {
          failures.push({ row: p.row, msg: err?.message ?? '未知错误' });
        }
      }
      if (failures.length > 0) {
        setSubmitError(
          `${failures.length}/${pendingSubmissions.length} 条排产失败：\n` +
          failures.map((f) => `· ${f.row.order_no} ${f.row.custom_product_name} — ${f.msg}`).join('\n'),
        );
      } else {
        setConfirmOpen(false);
      }
      setDrafts({});
      ordersQuery.reload();
    } finally {
      setSubmitting(false);
    }
  };

  // 主视图渲染
  return (
    <div className="space-y-section-gap animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="排产中心"
        description="以销售明细为主视角，输入数量即排产并自动扣料"
      />

      {/* 操作提示卡：一次性放在顶部，不再每张卡都警示 */}
      <Card tone="accent" padding="tight">
        <div className="flex items-start gap-2">
          <span className="text-base">⚠</span>
          <p className="text-caption text-accent-ink leading-relaxed">
            排产创建后**不可撤销**，会立即扣减外壳 / 线材 / PCB 方案展开的原材料。
            如要撤销请由仓管录入反向 <span className="font-mono">StockAdjustment(MANUAL_IN)</span>。
          </p>
        </div>
      </Card>

      {/* 全局批量 ActionBar */}
      <Card flat padding="tight" tone="subtle">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* 左：搜索 */}
          <div className="flex-1 min-w-0">
            <input
              className="w-full rounded-pill border border-line bg-surface px-4 py-2 text-body
                         outline-none focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
              placeholder="按订单号 / 客户 / 商品名 / 细节描述（商标）搜索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* 右：批量动作 */}
          <ActionBar align="end" className="shrink-0">
            <ActionBar.GhostButton onClick={fillAllSuggested} disabled={pendingRows.length === 0}>
              全部按建议填满
            </ActionBar.GhostButton>
            <ActionBar.GhostButton onClick={clearAll} disabled={Object.keys(drafts).length === 0}>
              全部清空
            </ActionBar.GhostButton>
            <ActionBar.PrimaryButton onClick={openConfirm} disabled={pendingSubmissions.length === 0}>
              一键排产（已填 {pendingSubmissions.length} 张）
            </ActionBar.PrimaryButton>
          </ActionBar>
        </div>
      </Card>

      {/* 待排卡片网格 */}
      {ordersQuery.loading ? (
        <Card><p className="text-center text-caption text-ink-faint py-6">加载中...</p></Card>
      ) : ordersQuery.error ? (
        <Card tone="danger" padding="tight">
          <p className="text-caption text-danger-ink">⚠ {ordersQuery.error}</p>
        </Card>
      ) : pendingRows.length === 0 ? (
        <Card>
          <p className="text-center text-caption text-ink-faint py-10">
            🎉 当前没有待排产的销售明细 —— 你今天忙完了
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pendingRows.map((r) => (
            <ProductionCard
              key={r.item_id}
              row={r}
              draft={drafts[r.item_id] ?? ''}
              onDraftChange={(v) =>
                setDrafts((prev) => ({ ...prev, [r.item_id]: v }))
              }
              onFillSuggested={() =>
                setDrafts((prev) => ({ ...prev, [r.item_id]: String(r.awaiting) }))
              }
            />
          ))}
        </div>
      )}

      {/* awaiting=0 折叠区 */}
      {doneRows.length > 0 && (
        <Section title={`今日已排完（${doneRows.length} 张）`} accent="success">
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

      {/* 一键排产确认 Modal */}
      <Modal
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        title="确认排产并扣料"
        maxWidth="max-w-2xl"
        footer={
          <>
            <ActionBar.GhostButton onClick={() => setConfirmOpen(false)} disabled={submitting}>
              取消
            </ActionBar.GhostButton>
            <ActionBar.PrimaryButton onClick={handleSubmitAll} disabled={submitting} loading={submitting}>
              确认排产并扣料
            </ActionBar.PrimaryButton>
          </>
        }
      >
        <div className="space-y-4">
          {/* 顶部汇总 */}
          <StatTriple
            stats={[
              { label: '明细数', value: summary.count },
              { label: '总套数', value: summary.totalSets, tone: 'accent', emphasis: true },
              { label: '客户', value: summary.customerCount },
              { label: '订单', value: summary.orderCount },
            ]}
          />
          {/* 不可逆警示 */}
          <Card tone="danger" padding="tight" flat>
            <p className="text-caption text-danger-ink leading-relaxed">
              ⚠ 提交后立即扣减外壳 + 线材 + PCB 方案展开的原材料库存。**不可逆**。
              如要撤销请由仓管录入反向 <span className="font-mono">StockAdjustment(MANUAL_IN)</span>。
            </p>
          </Card>
          {/* 明细列表 */}
          <Section title={`本次排产明细（${pendingSubmissions.length} 条）`}>
            <ul className="space-y-2">
              {pendingSubmissions.map((p) => (
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
                        {/* 细节描述：商标 / 颜色 / 工艺等关键生产信息，提交前必须能看到 */}
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
                        {p.qty} 套 / 待排 {p.row.awaiting}
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
    </div>
  );
}

// ============================================================================
// 排产卡片 —— 一条销售明细 = 一张卡
// ============================================================================

interface ProductionCardProps {
  row: Row;
  draft: string;
  onDraftChange: (v: string) => void;
  onFillSuggested: () => void;
}

function ProductionCard({ row, draft, onDraftChange, onFillSuggested }: ProductionCardProps) {
  const draftQty = Number(draft);
  const isDraftValid = draft.trim() !== '' && draftQty > 0 && draftQty <= row.awaiting;
  const isOverflow = draft.trim() !== '' && draftQty > row.awaiting;

  return (
    <Card interactive>
      <div className="flex flex-col gap-4">
        {/* 顶部：客户 + 单号 / 右上 DueDatePill（交期紧迫度）+ 今日 N 草稿 Pill */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-body font-bold text-ink truncate">{row.partner_name}</p>
            <p className="text-micro text-ink-faint font-mono mt-0.5">{row.order_no}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <DueDatePill date={row.expected_delivery_date} outline />
            {isDraftValid && <Pill tone="accent">今日 {draftQty}</Pill>}
          </div>
        </div>

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

        {/* BOM 三件 —— 排产前一眼确认会扣什么料 */}
        <BomTriple
          shell={row.shell_name}
          pcbPlan={row.pcb_plan_name}
          cable={row.cable_name}
        />

        {/* 中部：3 个数字（去掉"已发"） */}
        <StatTriple
          stats={[
            { label: '已生产', value: row.produced, tone: 'muted' },
            { label: '待排产', value: row.awaiting, tone: 'accent', emphasis: true },
            { label: '总量', value: row.quantity, tone: 'muted' },
          ]}
        />

        {/* 底部：输入 + 按建议填满 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <input
              type="number"
              min="0"
              max={row.awaiting}
              step="1"
              placeholder={`≤ ${row.awaiting}`}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              className={`w-full rounded-input border px-3 py-2 text-body font-mono outline-none transition-colors
                          ${isOverflow ? 'border-danger text-danger' : 'border-line focus:border-line-focus'}
                          focus:ring-2 focus:ring-primary/5`}
            />
            {isOverflow && (
              <p className="text-micro text-danger mt-1">超过待排数量 {row.awaiting}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onFillSuggested}
            className="rounded-pill border border-line-strong text-ink-body px-3 py-2 text-caption font-bold
                       hover:bg-surface-subtle hover:border-line-focus active:scale-95 transition-all whitespace-nowrap"
          >
            填 {row.awaiting}
          </button>
        </div>
      </div>
    </Card>
  );
}

