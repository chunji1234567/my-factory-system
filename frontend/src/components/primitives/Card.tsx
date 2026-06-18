import { ReactNode } from 'react';

/**
 * 通用卡片容器。整个项目里所有"内容块"都应该用这个。
 *
 * 视觉默认：
 *   - 圆角：rounded-card（24px）
 *   - 边框：1px line（slate-100）
 *   - 阴影：低（hover 升起）
 *   - 内边距：p-5（20px）
 *
 * Variants：
 *   - tone="default"：白底，标准内容
 *   - tone="subtle"：浅灰底，弱化区块（嵌套在 default 里的二级 card）
 *   - tone="accent"：accent-surface 底 + accent border，强调"今日待办" / 警示
 *   - interactive=true：加 hover 上升效果
 *   - flat=true：去阴影（嵌套场景）
 *
 * 详见 docs/design-system.md。
 */

type CardTone = 'default' | 'subtle' | 'accent' | 'danger';

interface CardProps {
  children: ReactNode;
  tone?: CardTone;
  interactive?: boolean;
  flat?: boolean;
  padding?: 'normal' | 'tight' | 'none';
  className?: string;
  onClick?: () => void;
}

const TONE_CLASSES: Record<CardTone, string> = {
  default: 'bg-surface border-line',
  subtle: 'bg-surface-subtle border-line',
  accent: 'bg-accent-surface border-accent/20',
  danger: 'bg-danger-surface border-danger/20',
};

const PADDING_CLASSES = {
  normal: 'p-5',
  tight: 'p-3',
  none: '',
} as const;

export function Card({
  children,
  tone = 'default',
  interactive = false,
  flat = false,
  padding = 'normal',
  className = '',
  onClick,
}: CardProps) {
  const shadowCls = flat ? '' : interactive ? 'shadow-card hover:shadow-card-hover transition-shadow' : 'shadow-card';
  const cursorCls = onClick ? 'cursor-pointer' : '';
  return (
    <div
      onClick={onClick}
      className={`rounded-card border ${TONE_CLASSES[tone]} ${PADDING_CLASSES[padding]} ${shadowCls} ${cursorCls} ${className}`}
    >
      {children}
    </div>
  );
}
