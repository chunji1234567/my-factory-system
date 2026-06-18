import { Card, Section, StatTriple, Pill } from '../primitives';
import { formatMoney, sumMoney } from '../../utils/money';

/**
 * 订单展开详情视图（Stage C-3 重做，2026-06-18）。
 *
 * 顶部摘要带 StatTriple：
 *   - **销售**：订单总额 / 已发金额 / 待发金额（accent，emphasis）
 *   - **采购**：订单总额 / 已收金额 / 待收金额（accent，emphasis）
 *
 * 中间明细 = primitives Card grid，去掉自造的 bg-white rounded-2xl 与 amber 圆点。
 * 右侧事件流保留，但视觉收敛到 design tokens（不再 bg-amber-400）。
 *
 * `onAddEvent` 透传：父组件在事件流末尾渲染"+ 添加业务动态"大号入口。
 * 详见 docs/ux-audit.md §2.3 #1（把"记录动态"按钮从列表行折叠到这里）。
 */
interface Props {
  items: any[];
  events: any[];
  mode: 'purchase' | 'sales';
  orderId?: number;
  onAddEvent?: (orderId: number) => void;
  /** 显示"+ 添加业务动态"入口（仅 canCreateEvents 时父组件传 true） */
  canAddEvent?: boolean;
}

export default function OrderDetailsView({
  items,
  events,
  mode,
  orderId,
  onAddEvent,
  canAddEvent = false,
}: Props) {
  // --- 顶部摘要带：金额三件 ---
  // total = 订单总额；handled = 已发金额(销售) / 已收金额(采购)；pending = 待办金额
  const total = sumMoney(items, 'quantity');
  const handled =
    mode === 'sales'
      ? sumMoney(items, 'shipped_quantity')
      : items.reduce((s, item) => {
          // 采购的"已收金额"用 received_quantity 累加；自定义 reduce 避开
          // sumMoney 仅支持 quantity / shipped_quantity 两个内置字段的限制。
          if (item.price === null || item.price === undefined || item.price === '') return s;
          const price = Number(item.price);
          const qty = Number(item.received_quantity ?? 0);
          return Number.isNaN(price) || Number.isNaN(qty) ? s : s + price * qty;
        }, 0);
  const pending = Math.max(0, total - handled);

  return (
    <div className="bg-surface-subtle border-t border-line animate-in fade-in slide-in-from-top-2 duration-300 p-6">
      <div className="space-y-section-gap">
        {/* 顶部摘要带 */}
        <Section title="订单金额概览" accent="accent">
          <StatTriple
            stats={[
              { label: mode === 'sales' ? '订单总额' : '采购总额', value: formatMoney(total) },
              {
                label: mode === 'sales' ? '已发金额' : '已收金额',
                value: formatMoney(handled),
                tone: 'accent',
                emphasis: true,
              },
              {
                label: mode === 'sales' ? '待发金额' : '待收金额',
                value: formatMoney(pending),
                tone: pending > 0 ? 'default' : 'muted',
              },
            ]}
          />
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左：明细清单 */}
          <div className="lg:col-span-2">
            <Section title={`项目明细（${items.length} 条）`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((item) => (
                  <Card key={item.id} flat tone="default" padding="tight">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-bold text-ink text-body truncate">
                        {mode === 'purchase'
                          ? item.product_detail?.model_name || `物料#${item.product}`
                          : item.custom_product_name}
                      </p>
                      <Pill tone="muted" outline>
                        {item.quantity} {item.unit || 'PCS'}
                      </Pill>
                    </div>

                    {mode === 'sales' && item.detail_description && (
                      <p
                        className="text-caption text-ink-muted italic leading-relaxed pl-2 border-l-2 border-line-strong"
                        title={item.detail_description}
                      >
                        {item.detail_description}
                      </p>
                    )}

                    <div className="mt-3 flex justify-between items-center text-caption text-ink-faint border-t border-line pt-2">
                      <span>单价 <span className="text-ink-body font-mono">{formatMoney(item.price)}</span></span>
                      <span className="font-bold">
                        小计 <span className="text-ink font-mono">
                          {item.price === null || item.price === undefined || item.price === ''
                            ? '—'
                            : formatMoney(Number(item.price) * Number(item.quantity))}
                        </span>
                      </span>
                    </div>

                    {mode === 'sales' && (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-micro text-ink-faint border-t border-line pt-2">
                        <span>已生产 <span className="font-mono text-ink-body">{Number(item.produced_quantity ?? 0)}</span></span>
                        <span>已发 <span className="font-mono text-ink-body">{Number(item.shipped_quantity ?? 0)}</span></span>
                        <span>待排 <span className="font-mono text-warning">{Math.max(0, Number(item.quantity ?? 0) - Number(item.produced_quantity ?? 0))}</span></span>
                        <span>可发 <span className="font-mono text-accent-ink">{Number(item.available_to_ship_quantity ?? 0)}</span></span>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </Section>
          </div>

          {/* 右：事件流 */}
          <div className="lg:col-span-1">
            <Section title="订单执行日志" accent="accent">
              <div className="relative space-y-4 before:absolute before:inset-0 before:ml-2 before:-translate-x-px before:h-full before:w-0.5 before:bg-line">
                {events?.length ? (
                  events.map((event) => (
                    <div key={event.id} className="relative pl-6 group">
                      <div className="absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-surface border-2 border-line-strong group-hover:border-line-focus transition-colors" />
                      <Card flat padding="tight">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-micro font-bold text-ink uppercase">
                            {event.event_type_label || event.event_type}
                          </span>
                          <span className="text-micro text-ink-faint font-mono">
                            {new Date(event.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-caption text-ink-body leading-relaxed whitespace-pre-line">
                          {event.content}
                        </p>
                        {event.operator && (
                          <p className="mt-2 text-micro text-ink-faint text-right italic">
                            —— {event.operator}
                          </p>
                        )}
                      </Card>
                    </div>
                  ))
                ) : (
                  <Card flat tone="subtle" padding="tight">
                    <p className="text-center text-micro text-ink-faint py-4 italic">
                      暂无业务动态
                    </p>
                  </Card>
                )}

                {/* "+ 添加业务动态" 大号入口（替代列表行的"记录动态"按钮） */}
                {canAddEvent && orderId && onAddEvent && (
                  <button
                    type="button"
                    onClick={() => onAddEvent(orderId)}
                    className="relative pl-6 w-full text-left group"
                  >
                    <div className="absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-surface border-2 border-accent group-hover:scale-110 transition-transform" />
                    <Card flat tone="subtle" padding="tight" className="group-hover:border-accent transition-colors">
                      <p className="text-caption text-accent-ink font-bold text-center">
                        + 添加业务动态
                      </p>
                    </Card>
                  </button>
                )}
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
