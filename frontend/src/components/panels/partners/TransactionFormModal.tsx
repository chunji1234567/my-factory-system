import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import type {
  FinanceTransactionResponse,
  FinanceTransactionType,
} from '../../../hooks/useFinanceTransactions';
import Modal from '../../common/Modal';
import { Card, Section, ModalFooterButtons } from '../../primitives';

/**
 * 财务流水 Modal（新建 + 编辑同款，Stage C-8 redesign 2026-06-18）。
 *
 * Modal 已经把"对哪个合作方记账"在外部锁死——绑定到当前 detail 视图的合作方。
 * 这样比原 FinanceDetailPanel 的"合作方下拉"省一步，也消除"误记到错合作方"风险。
 *
 * 流水类型语义（与后端 FinanceTransaction.transaction_type 对齐）：
 *   - RECEIPT：收款（应收减少，对客户用）
 *   - PAYMENT：付款（应付减少，对供应商用）
 *   - ADJUST：调账（可正可负，金额带符号）
 *
 * 表单字段：金额 + 类型 + 备注；保存时根据 partner_type 自动推荐默认类型。
 */

const TYPE_OPTIONS: Array<{ value: FinanceTransactionType; label: string; hint: string }> = [
  { value: 'RECEIPT', label: '收款', hint: '客户付钱给我们，应收减少' },
  { value: 'PAYMENT', label: '付款', hint: '我们付钱给供应商，应付减少' },
  { value: 'ADJUST', label: '调账', hint: '人工调整余额，金额可正可负' },
];

const FIELD_LABEL_CLS =
  'text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5';

interface Props {
  open: boolean;
  /** 当前合作方 —— 创建/编辑 always 锁死到这个合作方。 */
  partnerId: number;
  partnerName: string;
  /** 合作方类型：决定 type 字段的默认值（CUSTOMER → RECEIPT；SUPPLIER → PAYMENT；BOTH → RECEIPT）。 */
  partnerType: 'CUSTOMER' | 'SUPPLIER' | 'BOTH' | string;
  /** 编辑时传入；为 null 则是创建。 */
  editing: FinanceTransactionResponse | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function TransactionFormModal({
  open,
  partnerId,
  partnerName,
  partnerType,
  editing,
  onClose,
  onSuccess,
}: Props) {
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<FinanceTransactionType>('RECEIPT');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开 / 切换 editing 时重置表单
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const displayAmount =
        editing.transaction_type === 'ADJUST' ? editing.amount : Math.abs(editing.amount);
      setAmount(String(displayAmount));
      setType(editing.transaction_type);
      setNote(editing.note ?? '');
    } else {
      // 创建：根据合作方类型推荐默认 transaction_type
      const defaultType: FinanceTransactionType =
        partnerType === 'SUPPLIER' ? 'PAYMENT' : 'RECEIPT';
      setAmount('');
      setType(defaultType);
      setNote('');
    }
    setError(null);
  }, [open, editing, partnerType]);

  const amountNum = Number(amount);
  const isInvalid =
    amount.trim() === '' || Number.isNaN(amountNum) || amountNum === 0;

  const handleSubmit = async () => {
    if (isInvalid) return;
    // 后端约定：ADJUST 保留符号；RECEIPT/PAYMENT 强制传正数（后端按 type 决定方向）。
    const normalizedAmount = type === 'ADJUST' ? amountNum : Math.abs(amountNum);
    try {
      setSaving(true);
      setError(null);
      if (editing) {
        await api.updateFinanceTransaction(editing.id, {
          partner: partnerId,
          amount: normalizedAmount,
          transaction_type: type,
          note: note.trim() || undefined,
        });
      } else {
        await api.createFinanceTransaction({
          partner: partnerId,
          amount: normalizedAmount,
          transaction_type: type,
          note: note.trim() || undefined,
        });
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '编辑财务流水' : '新建财务流水'}
      maxWidth="max-w-lg"
      footer={
        <ModalFooterButtons
          onCancel={onClose}
          onSubmit={handleSubmit}
          isSaving={saving}
          submitDisabled={isInvalid}
          submitLabel={editing ? '保存修改' : '创建流水'}
          savingLabel="提交中..."
        />
      }
    >
      <div className="space-y-section-gap">
        {/* 合作方上下文（只读） */}
        <Card flat tone="subtle" padding="tight">
          <p className="text-micro text-ink-faint uppercase tracking-wider">记账对象</p>
          <p className="text-body font-bold text-ink mt-0.5">
            {partnerName} <span className="font-mono text-ink-faint">#{partnerId}</span>
          </p>
        </Card>

        <Section title="流水内容">
          <div className="space-y-3">
            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>类型</span>
              <div className="flex flex-wrap gap-2">
                {TYPE_OPTIONS.map((opt) => {
                  const active = type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      className={`px-4 py-1.5 rounded-pill text-caption font-bold transition-colors ${
                        active
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface text-ink-body border border-line hover:border-line-focus'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-micro text-ink-faint ml-0.5">
                {TYPE_OPTIONS.find((o) => o.value === type)?.hint}
              </p>
            </div>

            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>
                金额{type === 'ADJUST' ? '（允许负数，按符号生效）' : '（正数）'}
              </span>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={type === 'ADJUST' ? '例：-500（减余额）' : '例：5000'}
                className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body font-mono outline-none
                           focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>备注（可选）</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例：6/18 微信转账 / 现金 / 押金扣除"
                className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none
                           focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
              />
            </div>
          </div>
        </Section>

        {error && (
          <Card tone="danger" padding="tight" flat>
            <p className="text-caption text-danger-ink">⚠ {error}</p>
          </Card>
        )}
      </div>
    </Modal>
  );
}
