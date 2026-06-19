import { ReactNode } from 'react';
import Modal from '../common/Modal';

/**
 * ConfirmDialog —— 项目内统一的"确认 / 取消"对话框（替代 window.confirm 的丑陋默认样式）。
 *
 * 设计取舍：
 *   - 复用 common/Modal 容器，不重新造遮罩/动画/滚动锁
 *   - tone='danger' 的确认按钮用红色——破坏性操作（删除、清空）
 *   - tone='primary' 的确认按钮用主色——一般"确认"动作（归档、保存）
 *   - message 是 ReactNode：允许多行文案 + bold/列表等富文本
 *   - isWorking=true 时两个按钮都 disable + 显示"处理中…"——防重复提交
 *
 * 使用约定：
 *   - 调用方维护 open 状态：useState 一个 `confirmModal` 对象包含 mode + 关联数据
 *   - onConfirm 通常是个 async 函数，调用方应该手动管 isWorking 防重提
 *   - 关掉对话框：设 open=false 或调 onClose（点遮罩 / 关闭按钮也会触发）
 *
 * 详见 docs/PRD.md §9.4 changelog 2026-06-19（年末归档）。
 */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** 主体文案。支持 ReactNode 以便嵌入 <br/> / <strong/> / <ul/> 等。 */
  message: ReactNode;
  /** 确认按钮文本，默认 "确认"。 */
  confirmLabel?: string;
  /** 取消按钮文本，默认 "取消"。 */
  cancelLabel?: string;
  /** 确认按钮样式色调。danger 用于破坏性操作。 */
  tone?: 'primary' | 'danger';
  /** 处理中：两个按钮 disable + 确认按钮换文案。 */
  isWorking?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'primary',
  isWorking = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  // 按钮样式与 ModalFooterButtons / DestructiveButton 完全对齐——保证视觉一致。
  // primary：实色主色按钮（同 ModalFooterButtons SUBMIT_CLS）
  // danger：outline 危险按钮（同 DestructiveButton DESTRUCTIVE_CLS），项目内没有
  //          实色红按钮 token，用 outline 表达"破坏性"
  const confirmClass =
    tone === 'danger'
      ? 'rounded-pill border border-danger/40 text-danger px-5 py-2 text-caption font-bold ' +
        'hover:bg-danger-surface transition-all ' +
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent'
      : 'rounded-pill bg-primary text-on-primary px-5 py-2 text-caption font-bold ' +
        'hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isWorking}
            className="rounded-pill border border-line-strong text-ink-body px-5 py-2 text-caption font-bold
                       hover:bg-surface-subtle transition-all
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isWorking}
            className={confirmClass}
          >
            {isWorking ? '处理中…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-body text-ink-body whitespace-pre-line">{message}</div>
    </Modal>
  );
}
