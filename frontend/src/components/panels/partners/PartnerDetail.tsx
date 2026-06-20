import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import type { PartnerResponse } from '../../../hooks/usePartners';
import { useFinanceTransactions } from '../../../hooks/useFinanceTransactions';
import Pagination from '../../common/Pagination';
import { Card, Section, Pill, StatTriple, ActionBar, ConfirmDialog } from '../../primitives';
import { formatMoney } from '../../../utils/money';
import { toast } from '../../../utils/toast';
import { LedgerTable } from './LedgerTable';
import { TransactionFormModal } from './TransactionFormModal';
import type { FinanceTransactionResponse } from '../../../hooks/useFinanceTransactions';

/**
 * 合作方详情（Stage C-8 redesign，2026-06-18）。
 *
 * 合并自旧 PartnerDetailContainer + PartnerDetailView + 部分 FinanceDetailPanel
 * 的功能。三个标签：
 *   - "关联订单"：销售/采购订单 + 明细进度
 *   - "转账流水"：本合作方的 FinanceTransaction 列表 + 新建/编辑/删除（继承自
 *     原 FinanceDetailPanel）
 *   - "财务台账"：财务模块的 PartnerLedgerEntry 流，支持按年导出 CSV
 *
 * 改造要点：
 *   - PageHeader 风格头部：合作方名 + ID + 余额（formatMoney）+ 返回按钮 + 导出
 *   - Tab 用 StatusPillFilterRow 顶起，与销售/采购/收货风格一致
 *   - 旧深色 banner / amber 编辑卡 / rose 错误条全部退场
 *   - 流水 CRUD 走 TransactionFormModal，删除走 ConfirmDialog（2026-06-19 替换 window.confirm）
 */

type TabKey = 'orders' | 'transactions' | 'ledger';

const TABS: { value: TabKey; label: string }[] = [
  { value: 'orders', label: '关联订单' },
  { value: 'transactions', label: '转账流水' },
  { value: 'ledger', label: '财务台账' },
];

function resolveFinanceType(partnerType: string) {
  return partnerType === 'SUPPLIER' ? 'payable' : 'receivable';
}

function typeLabel(t: string) {
  if (t === 'CUSTOMER') return '客户';
  if (t === 'SUPPLIER') return '供应商';
  if (t === 'BOTH') return '全能';
  return t;
}

function typeTone(t: string): 'default' | 'accent' | 'success' | 'warning' {
  if (t === 'CUSTOMER') return 'accent';
  if (t === 'SUPPLIER') return 'warning';
  if (t === 'BOTH') return 'success';
  return 'default';
}

const TXN_LABEL = {
  RECEIPT: '收款',
  PAYMENT: '付款',
  ADJUST: '调账',
} as const;

// 订单状态 → 中文 + Pill tone 映射。销售/采购各一套（枚举不同）。
type StatusTone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';
const SALES_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  ORDERED: { label: '待处理', tone: 'default' },
  PRODUCING: { label: '生产中', tone: 'warning' },
  SHIPPED: { label: '已发货', tone: 'accent' },
  COMPLETED: { label: '已完成', tone: 'success' },
};
const PURCHASE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  ORDERED: { label: '已下单', tone: 'default' },
  PARTIAL: { label: '部分入库', tone: 'warning' },
  RECEIVED: { label: '全部入库', tone: 'success' },
};
function statusOf(status: string, isSupplier: boolean): { label: string; tone: StatusTone } {
  const map = isSupplier ? PURCHASE_STATUS : SALES_STATUS;
  return map[status] ?? { label: status, tone: 'default' };
}

interface Props {
  partner: PartnerResponse;
  onBack: () => void;
  /** 余额可能因为流水提交而变——通知上层重新拉 partners 列表。 */
  onPartnerRefresh: () => void;
}

const ORDERS_PAGE_SIZE = 6;

export function PartnerDetail({ partner, onBack, onPartnerRefresh }: Props) {
  const [tab, setTab] = useState<TabKey>('orders');
  const [ordersPage, setOrdersPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // 切合作方时重置
  useEffect(() => {
    setTab('orders');
    setOrdersPage(1);
    setLedgerPage(1);
    setDetailData(null);
  }, [partner.id]);

  // 拉详情：关联订单 + 台账（按 ledgerPage 分页）
  useEffect(() => {
    let active = true;
    setDetailLoading(true);
    setDetailError(null);
    api
      .getFinancePartnerDetail(partner.id, resolveFinanceType(partner.partner_type), {
        ledgerPage,
      })
      .then((data) => {
        if (active) setDetailData(data);
      })
      .catch((err) => {
        if (active) setDetailError(err?.message ?? '详情加载失败');
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [partner.id, partner.partner_type, ledgerPage]);

  // 转账流水：自管 hook，按当前合作方过滤
  const txnsQuery = useFinanceTransactions({
    enabled: tab === 'transactions',
    pageSize: 200,
    filters: { partner: partner.id },
  });

  // --- 流水 CRUD ---
  const [txnModal, setTxnModal] = useState<{
    open: boolean;
    editing: FinanceTransactionResponse | null;
  }>({ open: false, editing: null });

  const openCreateTxn = () => setTxnModal({ open: true, editing: null });
  const openEditTxn = (t: FinanceTransactionResponse) =>
    setTxnModal({ open: true, editing: t });
  const closeTxn = () => setTxnModal({ open: false, editing: null });

  // 删除流水确认（2026-06-19 替代 window.confirm，详见 §9.4 changelog）。
  const [deleteTxnConfirm, setDeleteTxnConfirm] = useState<{
    txn: FinanceTransactionResponse | null;
  }>({ txn: null });
  const [deleteTxnWorking, setDeleteTxnWorking] = useState(false);

  const openDeleteTxnConfirm = (t: FinanceTransactionResponse) => setDeleteTxnConfirm({ txn: t });

  const handleDeleteTxnConfirm = async () => {
    const t = deleteTxnConfirm.txn;
    if (!t) return;
    try {
      setDeleteTxnWorking(true);
      await api.deleteFinanceTransaction(t.id);
      setDeleteTxnConfirm({ txn: null });
      await txnsQuery.reload();
      onPartnerRefresh();
      toast.success('流水已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleteTxnWorking(false);
    }
  };

  // --- 关联订单分页 ---
  const pagedOrders = useMemo(() => {
    const orders = detailData?.orders || [];
    const total = orders.length;
    const start = (ordersPage - 1) * ORDERS_PAGE_SIZE;
    return {
      data: orders.slice(start, start + ORDERS_PAGE_SIZE),
      total,
    };
  }, [detailData, ordersPage]);

  // --- 台账月份区间导出（2026-06-19 改造，详见 docs/PRD.md §9.4）---
  // 之前是"导出 YYYY 年"下拉；改成"起始月 → 结束月"两个 month input。
  // 默认起=结=本月。<input type="month"> 返回 "YYYY-MM"，要拼成 "YYYY-MM-01"
  // 和该月末日 才能传给后端 ledgerFrom/ledgerTo。
  const todayMonth = new Date().toISOString().slice(0, 7);  // "YYYY-MM"
  const [exportFromMonth, setExportFromMonth] = useState<string>(todayMonth);
  const [exportToMonth, setExportToMonth] = useState<string>(todayMonth);
  const [exporting, setExporting] = useState(false);

  /** "YYYY-MM" → "YYYY-MM-01"（起始月第一天） */
  const monthStart = (m: string) => `${m}-01`;

  /** "YYYY-MM" → "YYYY-MM-DD"（该月最后一天，处理 28/29/30/31）*/
  const monthEnd = (m: string) => {
    const [year, mon] = m.split('-').map(Number);
    // mon 是 1-12；Date(year, mon, 0) = 该月最后一天
    const d = new Date(year, mon, 0);
    const dd = String(d.getDate()).padStart(2, '0');
    return `${m}-${dd}`;
  };

  const handleExport = async () => {
    // 参数校验：起 ≤ 结
    if (exportFromMonth > exportToMonth) {
      toast.error('起始月份不能晚于结束月份');
      return;
    }
    try {
      setExporting(true);
      const fromDate = monthStart(exportFromMonth);
      const toDate = monthEnd(exportToMonth);
      const blob = await api.exportFinancePartnerLedger(
        partner.id,
        resolveFinanceType(partner.partner_type),
        {
          ledgerFrom: fromDate,
          ledgerTo: toDate,
          summary: false,  // 导出详细模式（含订单明细 + 财务流水）
        },
      );
      // 文件名优先用后端 Content-Disposition 的中文名（已带区间）。
      // 浏览器对 blob 自动下载时不能直接读 header，所以前端这边也拼一个 fallback。
      const safeName = (detailData?.partner_name || partner.name).replace(
        /[^\w一-龥-]+/g,
        '_',
      );
      const rangeLabel = exportFromMonth === exportToMonth
        ? exportFromMonth
        : `${exportFromMonth}_${exportToMonth}`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // 2026-06-19：从 CSV 切到 xlsx——支持单元格合并、列宽自适应、数字格式
      link.download = `${safeName}_${rangeLabel}_台账.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const balance = Number(partner.balance);
  const isSupplier = partner.partner_type === 'SUPPLIER';

  return (
    <div className="space-y-section-gap animate-in fade-in duration-300">
      {/* 头部 */}
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-heading text-ink tracking-tight">{partner.name}</p>
              <Pill tone={typeTone(partner.partner_type)} outline>
                {typeLabel(partner.partner_type)}
              </Pill>
              <span className="text-micro font-mono text-ink-faint">#{partner.id}</span>
            </div>
            <p className="text-caption text-ink-muted mt-2">
              {isSupplier ? '应付余额' : '应收余额'}：
              <span
                className={`font-mono ml-1 font-bold ${
                  balance >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {formatMoney(balance)}
              </span>
            </p>
          </div>
          {/* 返回按钮 —— 右上角，显眼大号 */}
          <button
            onClick={onBack}
            className="shrink-0 rounded-pill border border-line-strong text-ink-body px-5 py-2 text-caption font-bold
                       hover:bg-surface-subtle hover:border-line-focus active:scale-95 transition-all
                       self-start lg:self-auto"
          >
            ← 返回合作方列表
          </button>
        </div>

        {/* Tab 切换 —— 自定义 pill row，不带"全部"伪选项 */}
        <div className="mt-4 pt-4 border-t border-line">
          <div className="flex items-center gap-1 flex-wrap">
            {TABS.map((t) => {
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  className={`px-4 py-1.5 rounded-pill text-caption font-bold transition-colors ${
                    active
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface text-ink-body border border-line hover:border-line-focus'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* 错误条 */}
      {detailError && (
        <Card tone="danger" padding="tight">
          <p className="text-caption text-danger-ink">⚠ {detailError}</p>
        </Card>
      )}

      {/* === 关联订单 === */}
      {tab === 'orders' && (
        <Section title={`关联订单（${pagedOrders.total} 条）`}>
          {detailLoading && (
            <Card>
              <p className="text-center text-caption text-ink-faint py-6">同步中...</p>
            </Card>
          )}
          {!detailLoading && pagedOrders.total === 0 && (
            <Card>
              <p className="text-center text-caption text-ink-faint py-10 italic">
                暂无订单
              </p>
            </Card>
          )}
          {!detailLoading && pagedOrders.data.length > 0 && (
            <div className="space-y-3">
              {pagedOrders.data.map((order: any) => (
                <OrderCard key={order.id} order={order} isSupplier={isSupplier} />
              ))}
              {pagedOrders.total > ORDERS_PAGE_SIZE && (
                <Pagination
                  page={ordersPage}
                  total={pagedOrders.total}
                  pageSize={ORDERS_PAGE_SIZE}
                  onPageChange={setOrdersPage}
                />
              )}
            </div>
          )}
        </Section>
      )}

      {/* === 转账流水 === */}
      {tab === 'transactions' && (
        <Section
          title={`转账流水（${txnsQuery.data.length} 笔）`}
          action={
            <ActionBar align="end">
              <ActionBar.PrimaryButton onClick={openCreateTxn}>
                + 新建流水
              </ActionBar.PrimaryButton>
            </ActionBar>
          }
        >
          {txnsQuery.loading && (
            <Card>
              <p className="text-center text-caption text-ink-faint py-6">加载中...</p>
            </Card>
          )}
          {!txnsQuery.loading && txnsQuery.data.length === 0 && (
            <Card>
              <p className="text-center text-caption text-ink-faint py-10 italic">
                暂无转账流水
              </p>
            </Card>
          )}
          {!txnsQuery.loading && txnsQuery.data.length > 0 && (
            <Card padding="none">
              <div className="hidden md:grid grid-cols-[8rem_5rem_minmax(0,1fr)_8rem_10rem_6rem] gap-3 px-5 py-2.5 border-b border-line text-micro font-bold text-ink-faint uppercase tracking-wider bg-surface-subtle/40">
                <span>日期</span>
                <span>类型</span>
                <span>备注</span>
                <span className="text-right">金额</span>
                <span>操作员</span>
                <span className="text-right">动作</span>
              </div>
              <div className="divide-y divide-line">
                {txnsQuery.data.map((t) => {
                  const isAdjust = t.transaction_type === 'ADJUST';
                  const displayAmount = isAdjust ? t.amount : Math.abs(t.amount);
                  const sign = isAdjust
                    ? t.amount >= 0
                      ? '+'
                      : '-'
                    : t.transaction_type === 'PAYMENT'
                    ? '-'
                    : '+';
                  const amountColor =
                    sign === '+' ? 'text-success' : 'text-danger';
                  return (
                    <div
                      key={t.id}
                      className="grid grid-cols-2 md:grid-cols-[8rem_5rem_minmax(0,1fr)_8rem_10rem_6rem] gap-x-3 gap-y-1 px-5 py-3
                                 hover:bg-surface-subtle/40 transition-colors items-center"
                    >
                      <div className="text-micro font-mono text-ink-faint md:text-caption">
                        <span className="md:hidden text-ink-faint uppercase tracking-wider mr-1">
                          时间
                        </span>
                        {new Date(t.created_at).toLocaleDateString('zh-CN')}
                      </div>
                      <div className="text-caption font-bold text-ink-body">
                        {TXN_LABEL[t.transaction_type] ?? t.transaction_type}
                      </div>
                      <div className="col-span-2 md:col-span-1 min-w-0">
                        <p
                          className="text-caption text-ink-body truncate"
                          title={t.note ?? undefined}
                        >
                          {t.note || '—'}
                        </p>
                      </div>
                      <div className={`md:text-right font-mono font-bold ${amountColor}`}>
                        {sign}
                        {formatMoney(Math.abs(displayAmount))}
                      </div>
                      <div className="text-caption text-ink-muted truncate">
                        {t.operator || '—'}
                      </div>
                      <div className="col-span-2 md:col-span-1 md:text-right flex md:justify-end gap-2">
                        <button
                          onClick={() => openEditTxn(t)}
                          className="text-micro text-ink-body hover:text-primary underline"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => openDeleteTxnConfirm(t)}
                          className="text-micro text-ink-faint hover:text-danger underline"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </Section>
      )}

      {/* === 财务台账 === */}
      {tab === 'ledger' && (
        <>
          <Section
            title="台账概览"
            action={
              <div className="flex flex-wrap items-center gap-2">
                {/* 2026-06-19：月份区间选择——type="month" 浏览器原生 month picker */}
                <input
                  type="month"
                  value={exportFromMonth}
                  onChange={(e) => setExportFromMonth(e.target.value)}
                  max={exportToMonth}
                  className="rounded-input border border-line bg-surface px-3 py-1.5 text-caption outline-none
                             focus:border-line-focus focus:ring-2 focus:ring-primary/5"
                  title="起始月"
                />
                <span className="text-caption text-ink-faint">→</span>
                <input
                  type="month"
                  value={exportToMonth}
                  onChange={(e) => setExportToMonth(e.target.value)}
                  min={exportFromMonth}
                  className="rounded-input border border-line bg-surface px-3 py-1.5 text-caption outline-none
                             focus:border-line-focus focus:ring-2 focus:ring-primary/5"
                  title="结束月"
                />
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="rounded-pill bg-primary text-on-primary px-4 py-1.5 text-caption font-bold
                             hover:bg-primary-hover active:scale-95 transition-all
                             disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {exporting ? '导出中...' : '导出台账'}
                </button>
              </div>
            }
          >
            <StatTriple
              stats={[
                {
                  label: isSupplier ? '应付余额' : '应收余额',
                  value: formatMoney(balance),
                  tone: balance >= 0 ? 'success' : 'danger',
                  emphasis: true,
                },
                {
                  label: '台账条数',
                  value: detailData?.ledger_pagination?.total_count ?? detailData?.ledger_entries?.length ?? 0,
                },
              ]}
            />
          </Section>

          <Section title="对账明细">
            {detailLoading ? (
              <Card>
                <p className="text-center text-caption text-ink-faint py-6">同步中...</p>
              </Card>
            ) : (
              <>
                <LedgerTable entries={detailData?.ledger_entries || []} />
                {detailData?.ledger_pagination && (
                  <div className="flex items-center justify-between pt-3">
                    <p className="text-micro text-ink-faint">
                      第 {detailData.ledger_pagination.page} / {detailData.ledger_pagination.total_pages} 页
                    </p>
                    <div className="flex gap-2">
                      <button
                        disabled={detailData.ledger_pagination.page <= 1}
                        onClick={() => setLedgerPage(detailData.ledger_pagination.page - 1)}
                        className="rounded-pill border border-line-strong text-ink-body px-4 py-1 text-micro font-bold
                                   hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        上一页
                      </button>
                      <button
                        disabled={
                          detailData.ledger_pagination.page >=
                          detailData.ledger_pagination.total_pages
                        }
                        onClick={() => setLedgerPage(detailData.ledger_pagination.page + 1)}
                        className="rounded-pill border border-line-strong text-ink-body px-4 py-1 text-micro font-bold
                                   hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Section>
        </>
      )}

      {/* 流水 Modal */}
      <TransactionFormModal
        open={txnModal.open}
        partnerId={partner.id}
        partnerName={partner.name}
        partnerType={partner.partner_type}
        editing={txnModal.editing}
        onClose={closeTxn}
        onSuccess={async () => {
          closeTxn();
          await txnsQuery.reload();
          onPartnerRefresh();
        }}
      />

      {/* 删除流水确认（2026-06-19 替代 window.confirm，详见 §9.4 changelog） */}
      <ConfirmDialog
        open={Boolean(deleteTxnConfirm.txn)}
        onClose={() => !deleteTxnWorking && setDeleteTxnConfirm({ txn: null })}
        onConfirm={handleDeleteTxnConfirm}
        isWorking={deleteTxnWorking}
        tone="danger"
        title="删除流水"
        confirmLabel="确认删除"
        message={
          deleteTxnConfirm.txn ? (
            <p>
              确认删除这笔
              <strong className="text-ink">
                {' '}
                {TXN_LABEL[deleteTxnConfirm.txn.transaction_type] ?? deleteTxnConfirm.txn.transaction_type}
              </strong>
              {' '}流水？
              <br /><span className="text-danger-ink">此操作不可撤销。</span>
            </p>
          ) : null
        }
      />
    </div>
  );
}

// ============================================================================
// 关联订单卡片
// ============================================================================

interface OrderCardProps {
  order: any;
  isSupplier: boolean;
}

function OrderCard({ order, isSupplier }: OrderCardProps) {
  const renderItemTitle = (item: any) => {
    if (isSupplier) {
      return item.product_detail?.model_name || `物料#${item.product}`;
    }
    return item.custom_product_name;
  };

  const renderItemProgress = (item: any) => {
    const ordered = Number(item.quantity ?? 0);
    if (isSupplier) {
      const received = Number(item.received_quantity ?? 0);
      return `已收 ${received} / 订购 ${ordered}`;
    }
    const shipped = Number(item.shipped_quantity ?? 0);
    return `已发 ${shipped} / 订购 ${ordered}`;
  };

  const status = statusOf(order.status, isSupplier);

  return (
    <Card flat tone="subtle">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-micro font-mono text-ink-faint">{order.order_no}</p>
          <p className="text-micro text-ink-faint mt-0.5">
            {order.created_at ? new Date(order.created_at).toLocaleString('zh-CN') : '未知时间'}
          </p>
        </div>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>

      {order.items && order.items.length > 0 ? (
        <div className="space-y-2">
          {order.items.map((item: any, idx: number) => (
            <Card key={item.id || `${order.id}-${idx}`} flat tone="default" padding="tight">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-caption font-bold text-ink truncate">
                    {renderItemTitle(item)}
                  </p>
                  {!isSupplier && item.detail_description && (
                    <p className="text-micro text-ink-muted italic mt-0.5 line-clamp-2">
                      {item.detail_description}
                    </p>
                  )}
                  <p className="text-micro text-ink-faint font-mono mt-1">
                    {renderItemProgress(item)}
                  </p>
                </div>
                <Pill tone="muted" outline>
                  {Number(item.quantity ?? 0)} {item.product_detail?.unit || 'PCS'}
                </Pill>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-micro text-ink-faint italic">暂无明细</p>
      )}
    </Card>
  );
}
