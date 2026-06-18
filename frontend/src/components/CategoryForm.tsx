import { useState } from 'react';
import { api } from '../api/client';
import { Card, Section } from './primitives';

/**
 * 新建物料分类表单（Stage C-6 redesign，2026-06-18）。
 *
 * 渲染在 Modal 内部：自带 submit 按钮（不走 Modal.footer），保持自治。
 *
 * 分类类型选项必须与后端 core.Category.TYPE_CHOICES 保持一致。
 * BOARD（板材）自 BOM-2.0（2026-05-21）起弃用——板材不再作为半成品独立分类，
 * 改用 PCB 方案展开到原材料层，所以这里也不暴露。
 * 详见 docs/PRD.md §3.1 与 §9.4 changelog 2026-05-21。
 */

const TYPE_OPTIONS = [
  { value: 'RAW_MATERIAL', label: '原材料' },
  { value: 'SELF_MADE', label: '自产件（外壳）' },
  { value: 'CABLE', label: '线材' },
  { value: 'FINISHED', label: '成品' },
] as const;

const FIELD_LABEL_CLS = 'text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5';
const INPUT_CLS =
  'w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none ' +
  'focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors';

interface Props {
  onSuccess?: () => void;
}

export default function CategoryForm({ onSuccess }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('RAW_MATERIAL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.createCategory({ name: name.trim(), category_type: type });
      setName('');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-section-gap">
      <Section title="分类信息">
        <div className="space-y-3">
          <div className="space-y-1">
            <span className={FIELD_LABEL_CLS}>名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLS}
              placeholder="例：电阻 / 电容 / 芯片"
              required
              autoFocus
            />
          </div>
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
          </div>
        </div>
      </Section>

      {error && (
        <Card tone="danger" padding="tight" flat>
          <p className="text-caption text-danger-ink">⚠ {error}</p>
        </Card>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="rounded-pill bg-primary text-on-primary px-8 py-2 text-caption font-bold
                     hover:bg-primary-hover active:scale-95 transition-all
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? '提交中...' : '创建分类'}
        </button>
      </div>
    </form>
  );
}
