import { useEffect, useMemo, useState } from 'react';
import Modal from '../../common/Modal';
import { api } from '../../../api/client';
import type { StockAdjustmentType } from '../../../types';
import { stockAdjustmentOptions } from '../../../types';
import {
  Card,
  Section,
  SearchableSelect,
  ModalFooterButtons,
} from '../../primitives';

/**
 * 库存调整 Modal —— 单件 + 多件批量两套，跨面板共用。
 *
 * 当前消费方：
 *   - InventoryPanel（原材料 + 线材半成品）
 *   - SelfMadeGalleryPanel（自产件外壳 + 线材）
 *
 * 设计要点（详见 docs/PRD.md §3.1 与 ux-audit.md §2.6/§2.7）：
 *   - StockAdjustment 是 append-only 事件，录后不可改/删——错了请录反向冲销。
 *     UI 用 Card tone="danger" padding="tight" 单段提示，不重复多处弹。
 *   - 用户 2026-06-18 确认：出库后库存允许暂时为负，UI 软警示（warning）而非硬阻塞。
 *   - 三种类型 Pill 选择（入库 / 出库 / 生产入库），默认入库（最高频）。
 *
 * 字段映射：调用方传 AdjustableProduct（已抹平 InventoryProduct camelCase 与
 * ProductResponse snake_case 差异），让本组件与具体业务模型解耦。
 */

export interface AdjustableProduct {
  id: number;
  internalCode: string;
  modelName: string;
  stockQuantity: number;
  minStock: number;
}

const FIELD_LABEL_CLS = 'text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5';

// ============================================================================
// 单件调整 Modal
// ============================================================================

interface SingleAdjustModalProps {
  open: boolean;
  product: AdjustableProduct | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Modal 标题；不传默认"调整库存"。 */
  title?: string;
}

export function SingleAdjustModal({
  open,
  product,
  onClose,
  onSuccess,
  title = '调整库存',
}: SingleAdjustModalProps) {
  const [type, setType] = useState<StockAdjustmentType>('MANUAL_IN');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType('MANUAL_IN');
      setQuantity('');
      setNote('');
      setError(null);
    }
  }, [open]);

  if (!product) return null;

  const qtyNum = Number(quantity);
  const isInvalid = quantity.trim() === '' || !(qtyNum > 0);
  const typeMeta = stockAdjustmentOptions.find((o) => o.value === type);
  const goesNegative = type === 'MANUAL_OUT' && qtyNum > product.stockQuantity;
  const afterStock =
    type === 'MANUAL_OUT' ? product.stockQuantity - qtyNum : product.stockQuantity + qtyNum;

  const handleSubmit = async () => {
    if (isInvalid) return;
    try {
      setSaving(true);
      setError(null);
      await api.createStockAdjustment({
        product: product.id,
        adjustment_type: type,
        quantity: qtyNum,
        note: note.trim() || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? '提交失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-lg"
      footer={
        <ModalFooterButtons
          onCancel={onClose}
          onSubmit={handleSubmit}
          isSaving={saving}
          submitDisabled={isInvalid}
          submitLabel={`确认${typeMeta?.shortLabel ?? '调整'}${qtyNum > 0 ? ` ${qtyNum.toLocaleString()}` : ''}`}
          savingLabel="提交中..."
        />
      }
    >
      <div className="space-y-section-gap">
        <Card flat tone="subtle" padding="tight">
          <p className="text-micro font-mono text-ink-faint">{product.internalCode}</p>
          <p className="text-body font-bold text-ink mt-0.5">{product.modelName}</p>
          <p className="text-caption text-ink-faint mt-2">
            当前库存{' '}
            <span className="font-mono text-ink-body font-bold">
              {product.stockQuantity.toLocaleString()}
            </span>{' '}
            · 安全库存{' '}
            <span className="font-mono text-ink-muted">
              {product.minStock.toLocaleString()}
            </span>
          </p>
        </Card>

        <Section title="调整内容">
          <div className="space-y-3">
            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>调整类型</span>
              <div className="flex flex-wrap gap-2">
                {stockAdjustmentOptions.map((opt) => {
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
            </div>

            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>数量</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="例：5000"
                className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body font-mono outline-none
                           focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
              />
              {qtyNum > 0 && (
                <p
                  className={`text-micro ml-0.5 ${
                    goesNegative ? 'text-warning' : 'text-ink-faint'
                  }`}
                >
                  调整后库存 ={' '}
                  <span className="font-mono font-bold">
                    {afterStock.toLocaleString()}
                  </span>
                  {goesNegative && '（暂时为负，确认无误后再提交）'}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>备注（可选）</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例：6/18 损耗 / 现金补料 / 调拨"
                className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none
                           focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
              />
            </div>
          </div>
        </Section>

        <Card tone="danger" padding="tight" flat>
          <p className="text-caption text-danger-ink leading-relaxed">
            ⚠ 提交后**不可撤销**——StockAdjustment 是 append-only 事件。
            录错请加一笔反向类型冲销。
          </p>
        </Card>

        {error && (
          <Card tone="danger" padding="tight" flat>
            <p className="text-caption text-danger-ink">⚠ {error}</p>
          </Card>
        )}
      </div>
    </Modal>
  );
}

// ============================================================================
// 多件批量 Modal
// ============================================================================

interface BatchRow {
  productId: number;
  quantity: string;
}

interface BatchAdjustModalProps {
  open: boolean;
  /** 可加入批次的物料列表（调用方自行筛选作用域，比如自产件 / 原材料）。 */
  products: AdjustableProduct[];
  onClose: () => void;
  onSuccess: () => void;
  /** Modal 标题；不传默认"多件批量调整"。 */
  title?: string;
  /** "继续添加"占位符前缀。 */
  pickerPlaceholderPrefix?: string;
}

export function BatchAdjustModal({
  open,
  products,
  onClose,
  onSuccess,
  title = '多件批量调整',
  pickerPlaceholderPrefix = '继续添加',
}: BatchAdjustModalProps) {
  const [type, setType] = useState<StockAdjustmentType>('MANUAL_IN');
  const [globalNote, setGlobalNote] = useState('');
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [picker, setPicker] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [failures, setFailures] = useState<{ product: AdjustableProduct; msg: string }[]>([]);

  useEffect(() => {
    if (open) {
      setType('MANUAL_IN');
      setGlobalNote('');
      setRows([]);
      setPicker('');
      setFailures([]);
    }
  }, [open]);

  const productMap = useMemo(() => {
    const m = new Map<number, AdjustableProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const pickerOptions = useMemo(() => {
    const selectedSet = new Set(rows.map((r) => r.productId));
    return products
      .filter((p) => !selectedSet.has(p.id))
      .map((p) => ({
        value: String(p.id),
        label: `${p.modelName} (${p.internalCode})`,
      }));
  }, [products, rows]);

  const handlePick = (v: string) => {
    if (!v) return;
    const pid = Number(v);
    if (Number.isNaN(pid)) return;
    setRows((prev) =>
      prev.some((r) => r.productId === pid)
        ? prev
        : [...prev, { productId: pid, quantity: '' }],
    );
    setPicker('');
  };

  const updateQty = (productId: number, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.productId === productId ? { ...r, quantity: value } : r)),
    );
  };

  const removeRow = (productId: number) => {
    setRows((prev) => prev.filter((r) => r.productId !== productId));
  };

  // 出库后库存可能为负——允许提交，行级软警示。
  const validRows = rows.filter((r) => {
    const p = productMap.get(r.productId);
    if (!p) return false;
    const qty = Number(r.quantity);
    return qty > 0;
  });

  const handleSubmit = async () => {
    if (validRows.length === 0) return;
    setSaving(true);
    setFailures([]);
    try {
      const fails: { product: AdjustableProduct; msg: string }[] = [];
      for (const r of validRows) {
        const p = productMap.get(r.productId);
        if (!p) continue;
        try {
          await api.createStockAdjustment({
            product: p.id,
            adjustment_type: type,
            quantity: Number(r.quantity),
            note: globalNote.trim() || undefined,
          });
        } catch (err: any) {
          fails.push({ product: p, msg: err?.message ?? '提交失败' });
        }
      }
      if (fails.length === 0) {
        onSuccess();
      } else {
        setFailures(fails);
      }
    } finally {
      setSaving(false);
    }
  };

  const typeMeta = stockAdjustmentOptions.find((o) => o.value === type);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-3xl"
      footer={
        <ModalFooterButtons
          onCancel={onClose}
          onSubmit={handleSubmit}
          isSaving={saving}
          submitDisabled={validRows.length === 0}
          submitLabel={`确认${typeMeta?.shortLabel ?? '调整'} ${validRows.length} 件`}
          savingLabel="提交中..."
        />
      }
    >
      <div className="space-y-section-gap">
        <Section title="① 通用设置">
          <div className="space-y-3">
            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>本批调整类型（应用到所有物料）</span>
              <div className="flex flex-wrap gap-2">
                {stockAdjustmentOptions.map((opt) => {
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
            </div>
            <div className="space-y-1">
              <span className={FIELD_LABEL_CLS}>批次备注（可选，应用到所有物料）</span>
              <input
                type="text"
                value={globalNote}
                onChange={(e) => setGlobalNote(e.target.value)}
                placeholder="例：6/18 自产件入库"
                className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none
                           focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
              />
            </div>
          </div>
        </Section>

        <Section title="② 添加物料">
          <SearchableSelect
            options={pickerOptions}
            value={picker}
            onChange={handlePick}
            placeholder={`${pickerPlaceholderPrefix}（已选 ${rows.length} 件）`}
          />
        </Section>

        <Section title={`③ 已加物料（${rows.length} 件 · 有效 ${validRows.length} 件）`}>
          {rows.length === 0 ? (
            <Card flat tone="subtle" padding="tight">
              <p className="text-center text-caption text-ink-faint py-6">
                请在上方搜索框里添加要调整的物料
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const p = productMap.get(r.productId);
                if (!p) return null;
                const qtyNum = Number(r.quantity);
                const isInvalid = r.quantity.trim() === '' || !(qtyNum > 0);
                const goesNegative = type === 'MANUAL_OUT' && qtyNum > p.stockQuantity;
                const afterStock =
                  type === 'MANUAL_OUT' ? p.stockQuantity - qtyNum : p.stockQuantity + qtyNum;
                return (
                  <Card key={r.productId} flat tone="subtle" padding="tight">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-bold text-ink truncate">{p.modelName}</p>
                        <p className="text-micro text-ink-faint mt-0.5">
                          {p.internalCode} · 当前库存{' '}
                          <span className="font-mono text-ink-body">
                            {p.stockQuantity.toLocaleString()}
                          </span>
                        </p>
                      </div>
                      <div className="shrink-0 space-y-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.quantity}
                          onChange={(e) => updateQty(p.id, e.target.value)}
                          placeholder="数量"
                          className={`w-32 rounded-input border bg-surface px-3 py-1.5 text-body font-mono text-right
                                      outline-none focus:ring-2 focus:ring-primary/5 transition-colors
                                      ${
                                        isInvalid && r.quantity.trim() !== ''
                                          ? 'border-danger text-danger'
                                          : 'border-line focus:border-line-focus'
                                      }`}
                        />
                        {qtyNum > 0 && (
                          <p
                            className={`text-micro text-right ${
                              goesNegative ? 'text-warning' : 'text-ink-faint'
                            }`}
                          >
                            调整后 ={' '}
                            <span className="font-mono font-bold">
                              {afterStock.toLocaleString()}
                            </span>
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeRow(p.id)}
                        className="shrink-0 text-micro text-ink-faint hover:text-danger transition-colors px-2 py-1"
                        title="移除"
                      >
                        ×
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Section>

        <Card tone="danger" padding="tight" flat>
          <p className="text-caption text-danger-ink leading-relaxed">
            ⚠ 提交后**不可撤销**。每件物料生成一条独立的 StockAdjustment 事件，
            录错请加反向类型冲销。
          </p>
        </Card>

        {failures.length > 0 && (
          <Card tone="danger" padding="tight" flat>
            <p className="text-caption text-danger-ink font-bold mb-1">
              ⚠ {failures.length} 件失败：
            </p>
            <ul className="text-micro text-danger-ink space-y-0.5">
              {failures.map((f) => (
                <li key={f.product.id}>
                  · {f.product.modelName} — {f.msg}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Modal>
  );
}
