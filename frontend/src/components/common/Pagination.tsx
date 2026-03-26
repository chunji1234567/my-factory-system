import type { ReactNode } from 'react';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange(page: number): void;
  pageSizeText?: ReactNode;
}

export default function Pagination({ page, pageSize, total, onPageChange, pageSizeText }: Props) {
  if (total <= pageSize) {
    return null;
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const goTo = (next: number) => {
    const target = Math.min(Math.max(next, 1), totalPages);
    if (target !== page) {
      onPageChange(target);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span>
        显示 {from}-{to} / {total}
        {pageSizeText && <span className="ml-2 text-xs text-slate-500">{pageSizeText}</span>}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-full border border-slate-200 px-3 py-1 disabled:opacity-40"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
        >
          上一页
        </button>
        <span>
          第 {page} / {totalPages} 页
        </span>
        <button
          type="button"
          className="rounded-full border border-slate-200 px-3 py-1 disabled:opacity-40"
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
