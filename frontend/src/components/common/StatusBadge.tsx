interface Props {
  status: string;
  label?: string;
  kind: 'sales' | 'shipping' | 'purchase';
}

const COLORS: Record<string, string> = {
  default: 'bg-slate-100 text-slate-700',
};

const SALES_COLORS: Record<string, string> = {
  ORDERED: 'bg-blue-100 text-blue-700',
  PRODUCING: 'bg-amber-100 text-amber-700',
  SHIPPED: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-rose-100 text-rose-700',
};

const PURCHASE_COLORS: Record<string, string> = {
  ORDERED: 'bg-blue-100 text-blue-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  RECEIVED: 'bg-emerald-100 text-emerald-700',
};

const SALES_LABELS: Record<string, string> = {
  ORDERED: '已下单',
  PRODUCING: '生产中',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  PENDING: '待处理',
};

const PURCHASE_LABELS: Record<string, string> = {
  ORDERED: '已下单',
  PARTIAL: '部分入库',
  RECEIVED: '全部入库',
};

function getColor(kind: Props['kind'], status: string) {
  if (kind === 'sales' || kind === 'shipping') {
    return SALES_COLORS[status] || COLORS.default;
  }
  if (kind === 'purchase') {
    return PURCHASE_COLORS[status] || COLORS.default;
  }
  return COLORS.default;
}

function getLabel(kind: Props['kind'], status: string, fallback?: string) {
  if (kind === 'sales' || kind === 'shipping') {
    return SALES_LABELS[status] || fallback || status;
  }
  if (kind === 'purchase') {
    return PURCHASE_LABELS[status] || fallback || status;
  }
  return fallback || status;
}

export default function StatusBadge({ status, label, kind }: Props) {
  const classes = getColor(kind, status);
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>
      {getLabel(kind, status, label)}
    </span>
  );
}
