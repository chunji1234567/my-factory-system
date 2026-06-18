import { ReactNode } from 'react';

/**
 * 状态徽章 / 标签。比现有 StatusBadge 更通用——任何"短文字 + 色调"标记。
 *
 * 用法：
 *   <Pill tone="success">已完成</Pill>
 *   <Pill tone="warning" outline>生产中</Pill>
 *   <Pill tone="muted">已下架</Pill>
 *
 * Tone 对应 BOM-2.1 的常见业务状态：
 *   default     - 中性
 *   accent      - 待办 / 今日（amber）
 *   warning     - 生产中 / 部分发货
 *   success     - 已完成 / 全部已发
 *   danger      - 异常 / 取消
 *   muted       - 已下架 / 已归档
 *
 * 详见 docs/design-system.md。
 */

type PillTone = 'default' | 'accent' | 'warning' | 'success' | 'danger' | 'muted';

interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  /** outline=true：透明底 + 描边；false=填充。 */
  outline?: boolean;
  className?: string;
}

const TONE_FILLED: Record<PillTone, string> = {
  default: 'bg-surface-muted text-ink-body',
  accent: 'bg-accent-surface text-accent-ink',
  warning: 'bg-warning/15 text-warning',
  success: 'bg-success-surface text-success',
  danger: 'bg-danger-surface text-danger-ink',
  muted: 'bg-surface-muted text-ink-faint',
};

const TONE_OUTLINE: Record<PillTone, string> = {
  default: 'border-line-strong text-ink-body',
  accent: 'border-accent/30 text-accent-ink',
  warning: 'border-warning/40 text-warning',
  success: 'border-success/30 text-success',
  danger: 'border-danger/30 text-danger',
  muted: 'border-line-strong text-ink-faint',
};

export function Pill({ children, tone = 'default', outline = false, className = '' }: PillProps) {
  const cls = outline
    ? `border ${TONE_OUTLINE[tone]} bg-transparent`
    : TONE_FILLED[tone];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-pill text-caption font-bold ${cls} ${className}`}>
      {children}
    </span>
  );
}
