/**
 * 金额格式化 —— 跨面板统一显示形态：`¥1,234.00`（无空格、有千分位）。
 *
 * 关键边界：
 *   * `null` / `undefined` / `''` → 返回 `fallback`（默认 "—"）。
 *     **绝不** 把 null 静默渲染成 `¥0.00`——后端 MonetaryMaskMixin 对非
 *     manager 角色会把 `price` 置为 null（金额脱敏，见 docs/PRD.md §5）。
 *   * `NaN` / 非数字串 → `fallback`。
 *   * 0 / 0.0 → `¥0.00`（保留显示）。
 *
 * 设计取舍：
 *   * 用 `Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' })`
 *     得到 `¥1,234.00` 标准国际化输出，比手工 `'¥' + toFixed(2)` 更稳。
 *   * 但 Intl 默认会输出 `¥1,234.00` 也可能输出 `￥`（取决于 locale）。
 *     我们固定走 `currencyDisplay: 'symbol'` + 后置 `replace`，保证永远是
 *     普通 `¥`。
 */

const FORMATTER = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  currencyDisplay: 'symbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return fallback;
  // Intl 在 zh-CN 下输出 "¥1,234.00"；个别环境会输出全角 "￥"，做一次替换兜底。
  return FORMATTER.format(num).replace('￥', '¥');
}

/**
 * 把销售单/采购单的明细数组按 (price × quantity) 累加。
 * 跳过 price 为 null 的明细（脱敏数据不参与汇总，免得出错觉）。
 *
 * `qtyField` 可选，默认 `quantity`。要算"已发金额"传 `'shipped_quantity'`，
 * 要算"待发金额"传一个虚拟字段——不支持，调用方自己 reduce。
 */
export function sumMoney(
  items: Array<{ price?: unknown; quantity?: unknown; shipped_quantity?: unknown }>,
  qtyField: 'quantity' | 'shipped_quantity' = 'quantity',
): number {
  return items.reduce((s, item) => {
    if (item.price === null || item.price === undefined || item.price === '') return s;
    const price = Number(item.price);
    const qty = Number(item[qtyField] ?? 0);
    if (Number.isNaN(price) || Number.isNaN(qty)) return s;
    return s + price * qty;
  }, 0);
}
