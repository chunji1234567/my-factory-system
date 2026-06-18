import { useEffect, useMemo, useState } from 'react';
import Modal from '../../common/Modal';
import { Card, Section, ModalFooterButtons, ActionBar } from '../../primitives';

/**
 * 批量收货 Modal（Stage C-5 新增，2026-06-18）。
 *
 * 触发：订单卡顶部「全部按可收量收货」按钮。
 *
 * 内容：列出该订单所有未收完的 item，每行预填数量 = 剩量。用户改一改 +「一次性入库」。
 * 这是收货员的日常——一批货来一次性入库，单条 Modal 走 N 次很烦。
 *
 * 提交：串行 POST N 条 ReceivingLog；任何失败不阻断其他成功的提交，
 * 但失败列表会回填到 error 数组里给父组件提示。
 *
 * 设计取舍：
 *   - 不做选项展开/折叠——直接全部列出，用户能整体看清"这次会收 X 个物料"
 *   - 数量为 0 的条目自动跳过（用户清空数量 = 不收）
 *   - 备注作用于本次所有条目，写一遍即可（典型场景：同一批车送来）
 */

interface PurchaseItem {
  id: number;
  product: number;
  product_detail?: { model_name: string } | null;
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

interface SubmitFailure {
  item: PurchaseItem;
  msg: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  order: Order | null;
  /** 提交时把每条 `{itemId, quantity, remark}` 串行交给父组件去发请求。 */
  onSubmit: (
    payloads: { purchase_item: number; quantity_received: number; remark?: string }[],
  ) => Promise<SubmitFailure[]>;
  saving: boolean;
}

export function ReceivingBatchModal({ open, onClose, order, onSubmit, saving }: Props) {
  const pending = useMemo(() => {
    if (!order) return [];
    return order.items
      .map((i) => ({
        item: i,
        remaining: Math.max(0, Number(i.quantity) - Number(i.received_quantity ?? 0)),
      }))
      .filter((row) => row.remaining > 0);
  }, [order]);

  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [remark, setRemark] = useState('');
  const [failures, setFailures] = useState<SubmitFailure[]>([]);

  // 打开 Modal 时把所有剩量预填进 drafts
  useEffect(() => {
    if (open) {
      const init: Record<number, string> = {};
      for (const row of pending) init[row.item.id] = String(row.remaining);
      setDrafts(init);
      setRemark('');
      setFailures([]);
    }
  }, [open, pending]);

  const validRows = useMemo(() => {
    return pending
      .map((row) => {
        const raw = drafts[row.item.id];
        const qty = Number(raw);
        if (!raw || raw.trim() === '' || !(qty > 0) || qty > row.remaining) return null;
        return { item: row.item, qty };
      })
      .filter((x): x is { item: PurchaseItem; qty: number } => x !== null);
  }, [pending, drafts]);

  const totalUnits = validRows.reduce((s, r) => s + r.qty, 0);

  const fillAll = () => {
    const next: Record<number, string> = {};
    for (const row of pending) next[row.item.id] = String(row.remaining);
    setDrafts(next);
  };
  const clearAll = () => setDrafts({});

  if (!order) return null;

  const handleSubmit = async () => {
    if (validRows.length === 0) return;
    const payloads = validRows.map((r) => ({
      purchase_item: r.item.id,
      quantity_received: r.qty,
      remark: remark.trim() || undefined,
    }));
    const fails = await onSubmit(payloads);
    setFailures(fails);
    if (fails.length === 0) {
      // 父组件已经关 Modal
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="批量收货"
      maxWidth="max-w-3xl"
      footer={
        <ModalFooterButtons
          onCancel={onClose}
          onSubmit={handleSubmit}
          isSaving={saving}
          submitDisabled={validRows.length === 0}
          submitLabel={`一次性入库（${validRows.length} 条 · 共 ${totalUnits}）`}
          savingLabel="入库中..."
        />
      }
    >
      <div className="space-y-section-gap">
        {/* 订单上下文 mini header */}
        <Card flat tone="subtle" padding="tight">
          <p className="text-body font-bold text-ink truncate">
            {order.partner_name || `供应商#${order.partner}`}
          </p>
          <p className="text-micro text-ink-faint font-mono mt-0.5">{order.order_no}</p>
        </Card>

        {/* 通用备注 */}
        <Section title="批次备注（应用到所有条目，可选）">
          <input
            type="text"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="例：6/18 第一车 / 包装完好"
            className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none
                       focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
          />
        </Section>

        {/* 顶部 ActionBar */}
        <div className="flex items-center justify-end">
          <ActionBar align="end">
            <ActionBar.GhostButton onClick={fillAll}>全部按剩量填满</ActionBar.GhostButton>
            <ActionBar.GhostButton onClick={clearAll}>全部清空</ActionBar.GhostButton>
          </ActionBar>
        </div>

        {/* 明细列表 */}
        <Section title={`未收完明细（${pending.length} 条）`}>
          {pending.length === 0 ? (
            <Card flat tone="subtle" padding="tight">
              <p className="text-center text-caption text-ink-faint py-6">
                该订单已全部入库，无需批量收货
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {pending.map(({ item, remaining }) => {
                const raw = drafts[item.id] ?? '';
                const qtyNum = Number(raw);
                const isOverflow = raw.trim() !== '' && qtyNum > remaining;
                return (
                  <Card key={item.id} flat tone="subtle" padding="tight">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-bold text-ink truncate">
                          {item.product_detail?.model_name || `物料#${item.product}`}
                        </p>
                        <p className="text-micro text-ink-faint mt-0.5">
                          剩 <span className="font-mono text-ink-body font-bold">{remaining}</span>
                          {' · '}已收{' '}
                          <span className="font-mono text-ink-body">
                            {Number(item.received_quantity ?? 0)}
                          </span>{' '}
                          / 总量 <span className="font-mono text-ink-body">{Number(item.quantity)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max={remaining}
                          step="0.01"
                          value={raw}
                          onChange={(e) =>
                            setDrafts((p) => ({ ...p, [item.id]: e.target.value }))
                          }
                          className={`w-24 rounded-input border bg-surface px-2 py-1.5 text-body font-mono text-right outline-none
                                      transition-colors
                                      ${isOverflow ? 'border-danger text-danger' : 'border-line focus:border-line-focus'}`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDrafts((p) => ({ ...p, [item.id]: String(remaining) }))
                          }
                          className="rounded-pill border border-line-strong text-ink-body px-3 py-1 text-micro font-bold
                                     hover:bg-surface hover:border-line-focus transition-all whitespace-nowrap"
                        >
                          填满
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Section>

        {failures.length > 0 && (
          <Card tone="danger" padding="tight" flat>
            <p className="text-caption text-danger-ink font-bold mb-1">
              ⚠ {failures.length} 条入库失败：
            </p>
            <ul className="text-micro text-danger-ink space-y-0.5">
              {failures.map((f) => (
                <li key={f.item.id}>
                  · {f.item.product_detail?.model_name || `物料#${f.item.product}`} — {f.msg}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Modal>
  );
}
