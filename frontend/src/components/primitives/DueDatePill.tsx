import { Pill } from './Pill';

/**
 * DueDatePill —— 跨面板共用的"交期紧迫度"标签。
 *
 * 数据契约：传入 ISO 日期串 "YYYY-MM-DD" 或 null/undefined。
 *
 * 紧迫度调色（详见 docs/design-system.md "时间紧迫度"）：
 *   < 0  天        → danger    "逾期 N 天"
 *   0  天          → warning   "今天"
 *   1  天          → warning   "明天"
 *   2 ~ 3 天       → warning   "N 天后"
 *   4 ~ 7 天       → accent    "N 天后"
 *   > 7  天        → muted     "N 天后"
 *   null/undefined → muted     "未约"
 *
 * 阈值经用户确认（2026-06-18）：≤3 天黄色是工厂"该开始加班赶"的预警线。
 *
 * 消费方：
 *   - 排产 ProductionCard 右上角（销售单交期）
 *   - 发货 ShippingCard 右上角（销售单交期）
 *   - 收货 ReceivingPanel 订单卡（采购单到货期）
 *   - 销售/采购列表的日期列
 *
 * 设计取舍：
 *   * 不暴露 tone props——紧迫度只能从日期派生，让调用方覆盖会破坏跨面板一致。
 *   * label 前缀可选：列表里需要"交期 8月3日"，卡片右上角只需"3 天后"。
 *   * outline 透传：卡片右上角想要描边轻量风格时用。
 */

interface DueDatePillProps {
  /** ISO 日期串 "YYYY-MM-DD"。可空——空时显示 "未约" + muted tone。 */
  date?: string | null;
  /** 前缀短标签，比如 "交付" / "到货"。可选——卡片右上角通常不带。 */
  prefix?: string;
  /** 透明底 + 描边样式，避免在已有色背景上抢眼。默认 false。 */
  outline?: boolean;
  className?: string;
}

interface Bucket {
  tone: 'danger' | 'warning' | 'accent' | 'muted';
  label: string;
}

/**
 * 计算"今天 → 目标日"差的整数天数。
 * 用本地时间的 00:00 边界算，避开时区/夏令时的脏漂移。
 */
function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Number.NaN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function bucketize(date: string | null | undefined): Bucket {
  if (!date) return { tone: 'muted', label: '未约' };
  const d = daysUntil(date);
  if (Number.isNaN(d)) return { tone: 'muted', label: '未约' };
  if (d < 0) return { tone: 'danger', label: `逾期 ${-d} 天` };
  if (d === 0) return { tone: 'warning', label: '今天' };
  if (d === 1) return { tone: 'warning', label: '明天' };
  if (d <= 3) return { tone: 'warning', label: `${d} 天后` };
  if (d <= 7) return { tone: 'accent', label: `${d} 天后` };
  return { tone: 'muted', label: `${d} 天后` };
}

export function DueDatePill({ date, prefix, outline, className }: DueDatePillProps) {
  const { tone, label } = bucketize(date);
  return (
    <Pill tone={tone} outline={outline} className={className}>
      {prefix ? `${prefix} ${label}` : label}
    </Pill>
  );
}
