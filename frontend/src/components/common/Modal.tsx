import { ReactNode, useEffect } from 'react';

/**
 * 基础 Modal 容器（Stage C-12 redesign，2026-06-18）。
 *
 * design tokens 同步：
 *   - 遮罩 bg-ink/40（替代 bg-slate-900/40）
 *   - 卡片 bg-surface（替代 bg-white）+ shadow-card-hover（替代 shadow-2xl）
 *   - 圆角 rounded-card（24px，替代 rounded-2xl 16px）；移动端顶部 rounded-t-card
 *   - 分隔线 border-line（替代 border-slate-50）
 *   - 标题 text-subheading（替代 text-xl font-bold）
 *   - 关闭按钮 hover:bg-surface-subtle（替代 bg-slate-50）+ text-ink-faint → text-ink-body
 *   - 底部条 bg-surface-subtle/50（替代 bg-slate-50/50）
 */

interface ModalProps {
  title: string;
  open: boolean;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

export default function Modal({
  title,
  open,
  onClose,
  children,
  footer,
  maxWidth = 'max-w-lg',
}: ModalProps) {
  // 打开时锁定背景滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm p-0 sm:p-4 transition-all">
      {/* 背景点击关闭 */}
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className={`
          relative w-full ${maxWidth} bg-surface shadow-card-hover
          rounded-t-card sm:rounded-card
          flex flex-col max-h-[95vh] sm:max-h-[90vh]
          animate-in slide-in-from-bottom sm:zoom-in-95 duration-300
        `}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-subheading text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-subtle rounded-pill text-ink-faint hover:text-ink-body transition-colors"
            aria-label="关闭"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">{children}</div>

        {/* Footer */}
        {footer && (
          <footer className="border-t border-line bg-surface-subtle/50 p-4 flex justify-end gap-3 rounded-b-card">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
