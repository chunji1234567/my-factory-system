/**
 * ModalFooterButtons —— Modal 底部的"取消 / 提交"按钮组合。
 *
 * 替代各面板里手写的 12 行 button 样式，保证所有弹窗的底部按钮长一个样：
 *   - 取消：outline + border-line-strong + hover surface-subtle
 *   - 提交：primary 实色 + hover primary-hover + active scale + loading 时显示替代文本
 *
 * 当前消费方：SalesOrdersPanel + PurchasePanel 的 编辑/创建 Modal 与 添加业务动态 Modal。
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
}: Props) {
  return (
    <>
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
    </>
  );
}
