/**
 * 分页组件（Stage C-12 redesign，2026-06-18）。
 *
 * design tokens：
 *   - 容器 bg-surface + border-line + rounded-card（替代 bg-white rounded-3xl border-slate-100）
 *   - 文字 text-ink / text-ink-faint（替代 slate-900 / slate-400）
 *   - 按钮 hover:bg-surface-subtle + rounded-pill（替代 slate-50 + rounded-full）
 *   - END OF LIST 提示用 text-caption + text-ink-faint
 */

interface PaginationProps {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  page = 1,
  total = 0,
  pageSize = 30,
  onPageChange,
}: PaginationProps) {
  const safeTotal = typeof total === 'number' ? total : 0;
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize));

  if (totalPages <= 1) {
    return (
      <div className="flex justify-center p-4">
        <span className="text-micro font-mono italic text-ink-faint">END OF LIST</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-surface rounded-card border border-line shadow-card">
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="px-4 py-2 text-caption font-bold text-ink-body disabled:opacity-30
                   hover:bg-surface-subtle rounded-pill transition-colors"
      >
        ← 上一页
      </button>

      <div className="flex items-center gap-2">
        <span className="text-body font-bold font-mono text-ink">{page}</span>
        <span className="text-body text-ink-faint">/</span>
        <span className="text-body font-mono text-ink-faint">{totalPages}</span>
      </div>

      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="px-4 py-2 text-caption font-bold text-ink-body disabled:opacity-30
                   hover:bg-surface-subtle rounded-pill transition-colors"
      >
        下一页 →
      </button>
    </div>
  );
}
