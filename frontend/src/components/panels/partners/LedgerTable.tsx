import { Card } from '../../primitives';
import { formatMoney } from '../../../utils/money';

/**
 * 财务台账表（Stage C-8 redesign，2026-06-18）。
 *
 * 一条 entry = 一笔记账，按时间倒序显示。后端返回 debit_amount / credit_amount /
 * amount 三个字段——debit 是借方（应收增加 / 应付减少），credit 是贷方。amount
 * 是综合后的"净额变动"。详见 docs/PRD.md §4.4 财务模型。
 *
 * 设计取舍：
 *   - 表格 + 移动端卡片双层渲染合并为响应式 Card row（grid 控制列）
 *   - 颜色：借方走 success（绿）+，贷方走 danger（红）-，符合习惯
 *   - 金额走 formatMoney（千分位 + 无空格）
 *   - 空状态 / 来源单号引用都用 Card primitives，去掉自造调色
 */

const LEDGER_ENTRY_TYPE_LABEL: Record<string, string> = {
  SALES: '销售单',
  PURCHASE: '采购单',
  FINANCE: '流水',
  ADJUST: '调账',
  OPENING: '期初',
};

interface LedgerEntry {
  id: number;
  created_at: string;
  entry_type: string;
  debit_amount: number | string | null;
  credit_amount: number | string | null;
  amount: number | string;
  note?: string | null;
  sales_order_no?: string | null;
  purchase_order_no?: string | null;
  transaction_id?: string | number | null;
}

interface Props {
  entries: LedgerEntry[];
}

export function LedgerTable({ entries }: Props) {
  if (!entries.length) {
    return (
      <Card flat tone="subtle" padding="tight">
        <p className="text-center text-caption text-ink-faint italic py-10">
          暂无对账流水记录
        </p>
      </Card>
    );
  }

  return (
    <Card padding="none">
      {/* 表头（仅桌面端显示） */}
      <div className="hidden md:grid grid-cols-[10rem_5rem_7rem_7rem_7rem_minmax(0,1fr)] gap-3 px-5 py-2.5 border-b border-line text-micro font-bold text-ink-faint uppercase tracking-wider bg-surface-subtle/40">
        <span>日期时间</span>
        <span>业务类型</span>
        <span className="text-right">借方 (+)</span>
        <span className="text-right">贷方 (-)</span>
        <span className="text-right">净额</span>
        <span>备注 / 来源单号</span>
      </div>
      {/* 行 */}
      <div className="divide-y divide-line">
        {entries.map((entry) => {
          const net = Number(entry.amount);
          const source =
            entry.sales_order_no ||
            entry.purchase_order_no ||
            (entry.transaction_id ? `流水#${entry.transaction_id}` : '—');
          const debitNum = Number(entry.debit_amount ?? 0);
          const creditNum = Number(entry.credit_amount ?? 0);
          return (
            <div
              key={entry.id}
              className="grid grid-cols-2 md:grid-cols-[10rem_5rem_7rem_7rem_7rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-5 py-3
                         hover:bg-surface-subtle/40 transition-colors items-center"
            >
              {/* 时间 */}
              <div className="text-micro font-mono text-ink-faint md:text-caption">
                <span className="md:hidden font-bold uppercase tracking-wider mr-1">时间</span>
                {new Date(entry.created_at).toLocaleString('zh-CN', { hour12: false })}
              </div>
              {/* 类型 */}
              <div className="text-caption font-bold text-ink-body">
                {LEDGER_ENTRY_TYPE_LABEL[entry.entry_type] || entry.entry_type}
              </div>
              {/* 借方 */}
              <div className="md:text-right text-caption font-mono">
                <span className="md:hidden text-ink-faint mr-1">借</span>
                {debitNum ? (
                  <span className="text-success font-bold">
                    +{formatMoney(debitNum).replace('¥', '¥')}
                  </span>
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </div>
              {/* 贷方 */}
              <div className="md:text-right text-caption font-mono">
                <span className="md:hidden text-ink-faint mr-1">贷</span>
                {creditNum ? (
                  <span className="text-danger font-bold">
                    -{formatMoney(creditNum)}
                  </span>
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </div>
              {/* 净额 */}
              <div className="md:text-right text-caption font-mono font-bold">
                <span className="md:hidden text-ink-faint mr-1">净额</span>
                <span className={net >= 0 ? 'text-success' : 'text-danger'}>
                  {net >= 0 ? '+' : ''}
                  {formatMoney(net)}
                </span>
              </div>
              {/* 备注 / 来源 */}
              <div className="col-span-2 md:col-span-1 min-w-0">
                <p className="text-caption text-ink-body truncate" title={entry.note ?? undefined}>
                  {entry.note || '无备注'}
                </p>
                <p className="text-micro text-ink-faint font-mono truncate">REF: {source}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default LedgerTable;
