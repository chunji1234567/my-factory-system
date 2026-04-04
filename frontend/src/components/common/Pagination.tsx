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
  onPageChange 
}: PaginationProps) {
  
  // 使用 Math.max 确保至少为 1，防止出现 0 或 NaN
  const safeTotal = typeof total === 'number' ? total : 0;
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize));
  
  // 如果只有一页，可以选择隐藏分页或禁用按钮
  if (totalPages <= 1) {
    return (
      <div className="flex justify-center p-4">
        <span className="text-xs text-slate-400 font-mono italic">END OF LIST</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white rounded-3xl border border-slate-100 shadow-sm">
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="p-2 disabled:opacity-30 hover:bg-slate-50 rounded-full transition-colors"
      >
        ← 上一页
      </button>
      
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-slate-900">{page}</span>
        <span className="text-sm text-slate-400">/</span>
        <span className="text-sm text-slate-400">{totalPages}</span>
      </div>

      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="p-2 disabled:opacity-30 hover:bg-slate-50 rounded-full transition-colors"
      >
        下一页 →
      </button>
    </div>
  );
}