/**
 * StatusPillFilterRow —— 顶部状态筛选 Pill row。
 *
 * 替代下拉 select 的状态筛选，让用户一眼看到所有可选项 + 当前选中。
 * 第一个"全部"由组件本身渲染（value=''），调用方只需传业务状态选项。
 *
 * 设计取舍：
 *   - 选项 Pill 用横向 flex + flex-wrap，移动端能换行
 *   - 选中态用 `bg-primary text-on-primary`，未选中用 `bg-surface + border-line`
 *   - "重置"按钮只在有筛选时显示，节省视觉重量
 *
 * 当前消费方：
 *   - SalesOrdersPanel（销售状态：ORDERED/PRODUCING/SHIPPED/COMPLETED）
 *   - PurchasePanel（采购状态：ORDERED/PARTIAL/RECEIVED）
 */

interface Option {
  value: string;
  label: string;
}

interface Props {
  /** 业务状态选项；"全部"由组件自己渲染，不要传进来。 */
  options: readonly Option[];
  /** 当前选中状态值；空串 = 全部。 */
  value: string;
  onChange: (value: string) => void;
  /** 可选：右侧的"重置"按钮回调，只在 value 不为空时显示。 */
  onReset?: () => void;
}

export function StatusPillFilterRow({ options, value, onChange, onReset }: Props) {
  const ALL = { value: '', label: '全部' };
  const all = [ALL, ...options];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {all.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value || 'all'}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1 rounded-pill text-caption font-bold transition-colors ${
              active
                ? 'bg-primary text-on-primary'
                : 'bg-surface text-ink-body border border-line hover:border-line-focus'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
      {value && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="ml-2 text-micro text-ink-faint hover:text-ink-body underline"
        >
          重置
        </button>
      )}
    </div>
  );
}
