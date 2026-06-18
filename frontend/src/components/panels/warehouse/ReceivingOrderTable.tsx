import { Card, Pill, DueDatePill, ActionBar } from '../../primitives';

/**
 * 收货订单卡片（Stage C-5 redesign，2026-06-18）。
 *
 * 文件名沿用 ReceivingOrderTable 以减少 import 变动——内部已经不再是 table，
 * 而是每订单一张 Card + 子明细列表。
 *
 * 改造要点（详见 docs/ux-audit.md §2.5）：
 *   - 桌面/移动统一渲染（去掉 hidden md:block / md:hidden 双重 JSX）
 *   - 订单 Card header = 供应商 + 单号 + DueDatePill(到货) + 状态 Pill
 *     + ActionBar: 「全部按可收量收货」批量按钮
 *   - 每条 item = 嵌套 Card flat tone="subtle" padding="tight"
 *     左边物料名 / 描述，右边「已收/总量」+「收货」按钮
 *   - 进度条删除——只保留 "8/12" 数字 + 完成态变 success 色
 *   - 用 primitives 统一调色板（取代 slate-* / emerald-* 硬编码）
 */

type StatusTone = 'default' | 'warning' | 'accent' | 'success' | 'danger' | 'muted';

interface StatusInfo {
  label: string;
  tone: StatusTone;
}

interface PurchaseItem {
  id: number;
  product: number;
  product_detail?: { model_name?: string; description?: string } | null;
  quantity: number;
  received_quantity?: number;
}

interface Order {
  id: number;
  partner_name?: string;
  partner?: number;
  order_no: string;
  status: string;
  items: PurchaseItem[];
  expected_arrival_date?: string | null;
}

interface Props {
  orders: Order[];
  statusOf: (status: string) => StatusInfo;
  /** 单条收货：打开对应 item 的简化 Modal。 */
  onReceiveOne: (orderId: number, itemId: number) => void;
  /** 批量收货：打开包含该订单所有未收完明细的批量 Modal。 */
  onReceiveAll: (orderId: number) => void;
}

export function ReceivingOrderTable({ orders, statusOf, onReceiveOne, onReceiveAll }: Props) {
  return (
    <div className="space-y-4">
      {orders.map((order) => {
        const status = statusOf(order.status);
        const pendingCount = order.items.filter(
          (i) => Number(i.quantity) - Number(i.received_quantity ?? 0) > 0,
        ).length;
        return (
          <Card key={order.id} padding="none">
            {/* 订单头部 */}
            <div className="p-5 border-b border-line flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-body font-bold text-ink truncate">
                  {order.partner_name || `供应商#${order.partner}`}
                </p>
                <p className="text-micro text-ink-faint font-mono mt-0.5">{order.order_no}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <DueDatePill date={order.expected_arrival_date} outline />
                <Pill tone={status.tone}>{status.label}</Pill>
                {pendingCount > 1 && (
                  <ActionBar align="end">
                    <ActionBar.GhostButton onClick={() => onReceiveAll(order.id)}>
                      全部按可收量收货
                    </ActionBar.GhostButton>
                  </ActionBar>
                )}
              </div>
            </div>

            {/* 明细列表 */}
            <div className="p-5 space-y-2">
              {order.items.map((item) => {
                const received = Number(item.received_quantity ?? 0);
                const total = Number(item.quantity);
                const isDone = received >= total;
                return (
                  <Card key={item.id} flat tone="subtle" padding="tight">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-bold text-ink truncate">
                          {item.product_detail?.model_name || `物料#${item.product}`}
                        </p>
                        {item.product_detail?.description && (
                          <p
                            className="text-caption text-ink-muted italic mt-1 leading-relaxed line-clamp-2"
                            title={item.product_detail.description}
                          >
                            {item.product_detail.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <p
                          className={`text-body font-mono font-bold ${
                            isDone ? 'text-success' : 'text-ink-body'
                          }`}
                        >
                          {received}
                          <span className="text-ink-faint mx-1">/</span>
                          {total}
                        </p>
                        <button
                          type="button"
                          disabled={isDone}
                          onClick={() => onReceiveOne(order.id, item.id)}
                          className={`rounded-pill px-4 py-1.5 text-caption font-bold transition-all whitespace-nowrap
                                      ${
                                        isDone
                                          ? 'bg-surface-muted text-ink-faint cursor-not-allowed'
                                          : 'bg-primary text-on-primary hover:bg-primary-hover active:scale-95'
                                      }`}
                        >
                          {isDone ? '已入库' : '确认收货'}
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
