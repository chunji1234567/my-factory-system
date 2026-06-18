import { useEffect, useState } from 'react';
import Modal from '../../common/Modal';
import { Card, Section, ModalFooterButtons } from '../../primitives';

/**
 * 单条收货 Modal（Stage C-5 redesign，2026-06-18）。
 *
 * 改造要点（详见 docs/ux-audit.md §2.5）：
 *   - 删掉旧版"选择收货物料"下拉——从订单卡某一行点进来时已经明确 item，
 *     再选一遍是冗余。Modal 只读显示当前物料名 + 剩量。
 *   - 数量字段默认 = 剩量，placeholder 也写 `剩 N`，用户改一下就行（最常见
 *     场景：实收 = 剩量；偶尔少量短收）。
 *   - 顶部那张深色 banner 删掉，改用 Section 风格 mini header（供应商 / 单号）。
 *   - 底部按钮统一走 ModalFooterButtons。
 */

interface PurchaseItem {
  id: number;
  product: number;
  product_detail?: { model_name: string; description?: string } | null;
  quantity: number;
  received_quantity?: number;
}

interface Order {
  id: number;
  partner_name?: string;
  partner?: number;
  order_no: string;
  items: PurchaseItem[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  order: Order | null;
  itemId: number | null;
  /** 提交时把 `{quantity, remark}` 交给父组件去发请求。 */
  onSubmit: (params: { quantity: number; remark: string }) => Promise<void> | void;
  error: string | null;
  saving: boolean;
}

export function ReceivingModal({ open, onClose, order, itemId, onSubmit, error, saving }: Props) {
  const item = order?.items.find((i) => i.id === itemId) ?? null;
  const remaining = item ? Math.max(0, Number(item.quantity) - Number(item.received_quantity ?? 0)) : 0;

  const [quantity, setQuantity] = useState<string>('');
  const [remark, setRemark] = useState<string>('');

  // 打开 Modal 或换 item 时，默认数量 = 剩量，备注清空。
  useEffect(() => {
    if (open && item) {
      setQuantity(String(remaining));
      setRemark('');
    }
  }, [open, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order || !item) return null;

  const qtyNum = Number(quantity);
  const isOverflow = quantity.trim() !== '' && qtyNum > remaining;
  const isInvalid = quantity.trim() === '' || qtyNum <= 0 || isOverflow;

  const handleSubmit = () => {
    onSubmit({ quantity: qtyNum, remark: remark.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="确认收货"
      maxWidth="max-w-lg"
      footer={
        <ModalFooterButtons
          onCancel={onClose}
          onSubmit={handleSubmit}
          isSaving={saving}
          submitDisabled={isInvalid}
          submitLabel="确认入库"
          savingLabel="入库中..."
        />
      }
    >
      <div className="space-y-section-gap">
        {/* 订单上下文 mini header */}
        <Card flat tone="subtle" padding="tight">
          <p className="text-body font-bold text-ink truncate">{order.partner_name || `供应商#${order.partner}`}</p>
          <p className="text-micro text-ink-faint font-mono mt-0.5">{order.order_no}</p>
        </Card>

        {/* 物料只读卡 */}
        <Section title="收货物料">
          <Card flat tone="default" padding="tight">
            <p className="text-body font-bold text-ink">
              {item.product_detail?.model_name || `物料#${item.product}`}
            </p>
            {item.product_detail?.description && (
              <p className="text-caption text-ink-muted italic mt-1 leading-relaxed">
                {item.product_detail.description}
              </p>
            )}
            <p className="text-caption text-ink-faint mt-2">
              剩量 <span className="font-mono text-ink-body font-bold">{remaining}</span> · 已收{' '}
              <span className="font-mono text-ink-body">{Number(item.received_quantity ?? 0)}</span> / 总量{' '}
              <span className="font-mono text-ink-body">{Number(item.quantity)}</span>
            </p>
          </Card>
        </Section>

        {/* 数量 + 备注 */}
        <Section title="本次到货">
          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5">
                本次入库数量
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                max={remaining}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={`w-full rounded-input border bg-surface px-3 py-2 text-body font-mono outline-none
                            focus:ring-2 focus:ring-primary/5 transition-colors
                            ${isOverflow ? 'border-danger text-danger' : 'border-line focus:border-line-focus'}`}
                placeholder={`剩 ${remaining}`}
              />
              {isOverflow && (
                <p className="text-micro text-danger ml-0.5">超过剩量 {remaining}</p>
              )}
            </div>
            <div className="space-y-1">
              <span className="text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5">
                批次备注（可选）
              </span>
              <input
                type="text"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="例：包装有破损 / 缺纸箱"
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
