import { useEffect, useState } from 'react';
import {
  getCurrentToasts,
  subscribeToast,
  toast,
  type ToastItem,
  type ToastVariant,
} from '../utils/toast';

/**
 * Toaster —— App.tsx 根级挂载一次，订阅 toast store 渲染所有当前通知。
 *
 * 视觉细节：
 *   - 桌面：右上角 `fixed top-4 right-4`，多条堆叠 `gap-2`，最大宽 `max-w-md`
 *   - 移动：底部居中 `bottom-4 inset-x-4`，更接近原生移动 toast 的预期
 *   - 4 个 variant 配色严格 design tokens：success/danger/warning/accent
 *   - 进出动画：滑入 + 淡入；关闭时手动点 × 立即移除
 *   - 不抢键盘焦点（aria-live="polite"）
 *
 * 不持有任何自己的状态——纯订阅 + 渲染。
 */

const VARIANT_STYLES: Record<
  ToastVariant,
  { container: string; icon: string; iconChar: string }
> = {
  success: {
    container: 'bg-success-surface border-success/40 text-success',
    icon: 'text-success',
    iconChar: '✓',
  },
  error: {
    container: 'bg-danger-surface border-danger/40 text-danger-ink',
    icon: 'text-danger',
    iconChar: '⚠',
  },
  warning: {
    container: 'bg-warning/15 border-warning/40 text-warning',
    icon: 'text-warning',
    iconChar: '!',
  },
  info: {
    container: 'bg-accent-surface border-accent/40 text-accent-ink',
    icon: 'text-accent',
    iconChar: 'i',
  },
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>(getCurrentToasts);

  useEffect(() => subscribeToast(setItems), []);

  if (items.length === 0) return null;

  return (
    <div
      // 桌面右上角；移动 < md 改成底部全宽
      className="fixed z-[60] flex flex-col gap-2 pointer-events-none
                 top-4 right-4 max-w-md w-[calc(100%-2rem)]
                 md:w-auto md:min-w-[20rem]"
      aria-live="polite"
      aria-atomic="true"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const style = VARIANT_STYLES[item.variant];
  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-card border
                  ${style.container}
                  px-4 py-3 shadow-card-hover
                  animate-in slide-in-from-right fade-in duration-300`}
      role={item.variant === 'error' ? 'alert' : 'status'}
    >
      <span
        className={`shrink-0 inline-flex items-center justify-center w-5 h-5
                    rounded-pill bg-surface/40 text-caption font-bold
                    ${style.icon}`}
        aria-hidden
      >
        {style.iconChar}
      </span>
      <p className="flex-1 text-body leading-snug whitespace-pre-wrap break-words">
        {item.message}
      </p>
      <button
        type="button"
        onClick={() => toast.dismiss(item.id)}
        className="shrink-0 -mr-1 -mt-1 text-lg leading-none opacity-60 hover:opacity-100 transition-opacity"
        aria-label="关闭"
      >
        ×
      </button>
    </div>
  );
}
