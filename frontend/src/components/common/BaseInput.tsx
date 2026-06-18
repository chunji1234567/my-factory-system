import React from 'react';

/**
 * 通用受控 input —— 严格遵循 design-system.md 的输入框规范：
 *   - 圆角：`rounded-input`（12px），不是 `rounded-full`
 *   - 边框：`border-line`，焦点 `border-line-focus + ring-primary/5`
 *   - 字号：`text-body`
 *   - 文字颜色：`text-ink`
 *   - 标签：`text-micro uppercase tracking-wider text-ink-faint`
 *
 * 这是 design tokens 全面铺开后（2026-06-18，Stage C-3）从旧 slate-* 调色板
 * 改造过来的——确保 Modal 内"价格 / 数量"与同卡片里的 SearchableSelect、
 * 客户名 input、备注 textarea 视觉完全一致。
 */
interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
}

const LABEL_CLS = 'block text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5';
const INPUT_CLS =
  'w-full rounded-input border bg-surface px-3 py-2 text-body text-ink outline-none ' +
  'focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors ' +
  'disabled:bg-surface-muted disabled:text-ink-faint disabled:cursor-not-allowed';

export const BaseInput = ({ label, error, className = '', ...props }: Props) => (
  <div className="w-full space-y-1">
    {label && <label className={LABEL_CLS}>{label}</label>}
    <input
      className={`${INPUT_CLS} ${error ? 'border-danger' : 'border-line'} ${className}`}
      {...props}
    />
    {error && <p className="text-micro text-danger ml-0.5">{error}</p>}
  </div>
);
