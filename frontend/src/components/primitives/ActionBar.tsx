import { ReactNode } from 'react';

/**
 * 表单/明细行最后一栏的"操作区"——把 N 个按钮 + 一个输入框组合成一致的样式。
 *
 * 解决的问题：当前面板里的"输入数量 + 按钮"组合每个面板自己写一份，间距颜色都不同。
 *
 * 用法：
 *   <ActionBar>
 *     <ActionBar.Input value={qty} onChange={setQty} max={remaining} />
 *     <ActionBar.PrimaryButton onClick={handleSubmit}>排产</ActionBar.PrimaryButton>
 *   </ActionBar>
 *
 *   <ActionBar align="end">
 *     <ActionBar.GhostButton onClick={onEdit}>编辑</ActionBar.GhostButton>
 *     <ActionBar.PrimaryButton onClick={onSubmit}>提交</ActionBar.PrimaryButton>
 *   </ActionBar>
 *
 * 详见 docs/design-system.md。
 */

interface ActionBarProps {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function ActionBar({ children, align = 'start', className = '' }: ActionBarProps) {
  const alignCls = { start: 'justify-start', center: 'justify-center', end: 'justify-end' }[align];
  return (
    <div className={`flex items-center gap-2 ${alignCls} ${className}`}>{children}</div>
  );
}

// -------- Sub-components --------

interface InputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  max?: number;
  min?: number;
  disabled?: boolean;
  type?: 'number' | 'text';
  className?: string;
}

ActionBar.Input = function ActionBarInput({
  value, onChange, placeholder, max, min, disabled, type = 'number', className = '',
}: InputProps) {
  return (
    <input
      type={type}
      min={min}
      max={max}
      step="1"
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`flex-1 min-w-0 rounded-input border border-line px-3 py-1.5 text-body
                  outline-none focus:border-line-focus focus:ring-2 focus:ring-primary/5
                  disabled:bg-surface-muted disabled:text-ink-faint transition-colors ${className}`}
    />
  );
};

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  loading?: boolean;
}

ActionBar.PrimaryButton = function ActionBarPrimaryButton({
  children, onClick, disabled, type = 'button', loading, className = '',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`rounded-pill bg-primary text-on-primary px-4 py-1.5 text-caption font-bold
                  hover:bg-primary-hover active:scale-95 transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${className}`}
    >
      {loading ? '...' : children}
    </button>
  );
};

ActionBar.GhostButton = function ActionBarGhostButton({
  children, onClick, disabled, type = 'button', className = '',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-pill border border-line-strong text-ink-body px-4 py-1.5 text-caption font-bold
                  hover:bg-surface-subtle hover:border-line-focus active:scale-95 transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
};

ActionBar.DangerButton = function ActionBarDangerButton({
  children, onClick, disabled, type = 'button', className = '',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-pill bg-danger-surface text-danger-ink border border-danger/20 px-4 py-1.5 text-caption font-bold
                  hover:bg-danger hover:text-on-primary active:scale-95 transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
};
