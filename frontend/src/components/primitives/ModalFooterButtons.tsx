import { ReactNode } from 'react';

/**
 * ModalFooterButtons —— Modal 底部的"取消 / 提交"按钮组合。
 *
 * 替代各面板里手写的 12 行 button 样式，保证所有弹窗的底部按钮长一个样：
 *   - 取消：outline + border-line-strong + hover surface-subtle
 *   - 提交：primary 实色 + hover primary-hover + active scale + loading 时显示替代文本
 *   - 可选 `destructiveAction`：左下角显眼的"破坏性"动作（如"删除订单"）。
 *     视觉上和取消/提交完全分离——`justify-between` 让它独占左侧。
 *
 * 当前消费方：
 *   - SalesOrdersPanel / PurchasePanel 的 编辑/创建 Modal
 *   - PartnerManagementPanel / PartnerDetail.tsx 的添加业务动态 Modal
 *   - PcbPlanPanel / 库存调整等所有 Modal
 *
 * 用法：
 *   <ModalFooterButtons
 *     onCancel={...}
 *     onSubmit={...}
 *     destructiveAction={
 *       <DestructiveButton onClick={...} disabled={...}>删除订单</DestructiveButton>
 *     }
 *   />
 */

interface Props {
  onCancel: () => void;
  onSubmit: () => void;
  /** 处理中：两按钮 disable，提交按钮显示 loading 文本。 */
  isSaving?: boolean;
  /** 额外的"提交不可用"条件（如表单未填完）。loading 单独控制 disable，不传也行。 */
  submitDisabled?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  /** 提交按钮在 loading 期间显示的文字。 */
  savingLabel?: string;
  /**
   * 左下角破坏性动作 slot —— 不传则不渲染，footer 维持取消/提交右对齐。
   * 传了则 footer 改 `justify-between`，左边显眼地立着"删除订单"之类的危险按钮，
   * 与取消/提交在视觉/认知上彻底分离。
   */
  destructiveAction?: ReactNode;
}

const CANCEL_CLS =
  'rounded-pill border border-line-strong text-ink-body px-5 py-2 text-caption font-bold ' +
  'hover:bg-surface-subtle transition-all disabled:opacity-40 disabled:cursor-not-allowed';

const SUBMIT_CLS =
  'rounded-pill bg-primary text-on-primary px-8 py-2 text-caption font-bold ' +
  'hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed';

export function ModalFooterButtons({
  onCancel,
  onSubmit,
  isSaving = false,
  submitDisabled = false,
  submitLabel = '确认提交',
  cancelLabel = '取消',
  savingLabel = '提交中...',
  destructiveAction,
}: Props) {
  // 注：Modal 组件的 footer 容器是 `flex justify-end`，所以默认情况下两个按钮
  // 靠右。当 destructiveAction 存在时，我们用一个隔离 div 占左侧 → 右侧
  // 取消/提交保持原样，flex 自动撑开中间空白。
  return (
    <div className="flex items-center justify-between gap-3 w-full">
      <div className="flex items-center gap-2">{destructiveAction ?? null}</div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} disabled={isSaving} className={CANCEL_CLS}>
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSaving || submitDisabled}
          className={SUBMIT_CLS}
        >
          {isSaving ? savingLabel : submitLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * 配套的 DestructiveButton —— outline-danger 风格，专门用在 ModalFooterButtons 的
 * `destructiveAction` slot 里。也可单独用在任何"删除/移除"语义的场景。
 *
 * disabled 时变灰，外加 `title` 提示禁用原因。
 */
interface DestructiveButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}

const DESTRUCTIVE_CLS =
  'rounded-pill border border-danger/40 text-danger px-4 py-2 text-caption font-bold ' +
  'hover:bg-danger-surface transition-all ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

export function DestructiveButton({
  onClick,
  disabled = false,
  title,
  children,
}: DestructiveButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={DESTRUCTIVE_CLS}
    >
      {children}
    </button>
  );
}
