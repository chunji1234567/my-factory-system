/**
 * 命令式 toast 通知 store + 公开 API（Stage C-13，2026-06-18 落地）。
 *
 * 替换全项目散落的 `alert()` —— alert 打断流程、视觉粗暴、堆多个会 OK 卡顿。
 * 这套 toast：
 *   - 命令式 import 调用，任意位置都能用（不限于 React 组件树）
 *   - 4 种语义化变体（success / error / warning / info）对齐 design tokens
 *   - 自动消失（error 多停 2 秒，让用户读完报错）
 *   - 多条堆叠在右上角，先进先消
 *   - 配套渲染器 `components/Toaster.tsx`，App.tsx 根挂载一次
 *
 * 用法：
 *   import { toast } from '../../utils/toast';
 *   toast.error('保存失败：' + err.message);
 *   toast.warning('请选择有效的客户');
 *   toast.success('已删除');
 *   toast.info('暂无上次的运单号');
 *
 * 设计参考：react-hot-toast 的 store 模式（轻量、无依赖、无 context 强约束）。
 */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  /** 消失前等待的毫秒数；0 = 不自动消失（用户必须手动关）。 */
  duration: number;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let listeners: Listener[] = [];
let nextId = 0;

function emit() {
  // 复制一份给订阅方，避免引用相等导致 React 不 re-render
  const snapshot = items.slice();
  for (const l of listeners) l(snapshot);
}

function add(variant: ToastVariant, message: string, duration: number): string {
  const id = String(++nextId);
  items = [...items, { id, message, variant, duration }];
  emit();
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

function dismiss(id: string): void {
  const before = items.length;
  items = items.filter((t) => t.id !== id);
  if (items.length !== before) emit();
}

/** 公开 API。每个方法都返回 id，必要时可以提前 `toast.dismiss(id)`。 */
export const toast = {
  success: (message: string, duration = 3500) => add('success', message, duration),
  error: (message: string, duration = 6000) => add('error', message, duration),
  warning: (message: string, duration = 4500) => add('warning', message, duration),
  info: (message: string, duration = 3500) => add('info', message, duration),
  dismiss,
};

/** 供 Toaster 组件订阅 store 用——返回 unsubscribe 函数。 */
export function subscribeToast(listener: Listener): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/** 供 Toaster 组件首次渲染拿当前快照用。 */
export function getCurrentToasts(): ToastItem[] {
  return items.slice();
}
