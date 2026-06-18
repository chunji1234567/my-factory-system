import { ReactNode } from 'react';
import { Card } from './Card';
import { Pill } from './Pill';
import { DueDatePill } from './DueDatePill';
import { formatMoney } from '../../utils/money';

/**
 * OrderListRow —— 销售/采购订单列表的统一行卡片。
 *
 * 负责所有视觉碎片：Card 容器、点击展开、客户/单号区、DueDatePill + 状态 Pill、
 * 千分位金额、编辑按钮、展开区域。调用方只需传"具体数据"+"展开内容"。
 *
 * 设计取舍：
 *   - 用 Card padding="none" 自己控制 hover/click 区域，避免双层 hover 视觉
 *   - 响应式：移动端 flex-wrap 让交期/状态 Pill 自动换行，金额 + 编辑挤到右下
 *   - 编辑按钮 `stopPropagation`——避免点编辑同时触发展开
 *
 * 当前消费方：SalesOrdersPanel + PurchasePanel
 */

type StatusTone = 'default' | 'warning' | 'accent' | 'success' | 'danger' | 'muted';

interface Props {
  /** 标题（粗体），通常是 partner_name。 */
  title: string;
  /** 副标题（mono 灰色小字），通常是 order_no。 */
  subtitle: string;
  /** 交期 ISO 日期串 "YYYY-MM-DD"，可空。 */
  dueDate?: string | null;
  /** 状态 Pill 显示文本（如"待处理"/"部分入库"）。 */
  statusLabel: string;
  /** 状态 Pill tone（见 Pill primitive）。 */
  statusTone: StatusTone;
  /** 金额，走 formatMoney——null/undefined 显示 "—" 而不是 "¥0.00"。 */
  amount: number | string | null | undefined;
  /** 是否显示编辑按钮（通常由权限决定）。 */
  canEdit?: boolean;
  /** 编辑按钮回调；canEdit=true 且提供时才显示按钮。 */
  onEdit?: () => void;
  /** 当前是否展开。 */
  expanded: boolean;
  /** 点击行（除编辑按钮）触发展开/收起。 */
  onToggleExpand: () => void;
  /** 展开时渲染在卡片底部的内容（通常是 OrderDetailsView）。 */
  expandedContent: ReactNode;
}

export function OrderListRow({
  title,
  subtitle,
  dueDate,
  statusLabel,
  statusTone,
  amount,
  canEdit = false,
  onEdit,
  expanded,
  onToggleExpand,
  expandedContent,
}: Props) {
  return (
    <Card padding="none">
      <div
        onClick={onToggleExpand}
        className="cursor-pointer p-5 hover:bg-surface-subtle/40 transition-colors"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-body font-bold text-ink truncate">{title}</p>
            <p className="text-micro text-ink-faint font-mono mt-0.5">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DueDatePill date={dueDate} outline />
            <Pill tone={statusTone}>{statusLabel}</Pill>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <p className="text-subheading font-mono text-ink font-bold">
              {formatMoney(amount)}
            </p>
            {canEdit && onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="rounded-pill border border-line-strong text-ink-body px-3 py-1 text-micro font-bold
                           hover:bg-surface-subtle hover:border-line-focus transition-all whitespace-nowrap"
              >
                编辑
              </button>
            )}
          </div>
        </div>
      </div>
      {expanded && expandedContent}
    </Card>
  );
}
