/**
 * BomTriple —— 销售明细的 BOM 三件套（外壳 / PCB 方案 / 线材）展示块。
 *
 * 当前消费方：
 *   - ProductionPanel（排产卡）：排产员排产前确认会扣哪三样
 *   - ShippingPanel 待发列表（发货卡）：发货员核对产品组合
 *
 * 设计取舍（详见 docs/design-system.md）：
 *   * 用 grid `[2.5rem 1fr]` 强制对齐"标签 / 值"两列，比 flex 视觉更整齐。
 *   * 标签固定窄宽 + 灰；值 mono + 加深，缺失时 "—" 占位（数据可能未挂全）。
 *   * 字号 text-micro：与 StatTriple 的二级数字同档，不抢主标题视觉。
 *   * truncate + title 兜底超长值的鼠标悬停。
 */

interface BomTripleProps {
  shell: string | null;
  pcbPlan: string | null;
  cable: string | null;
}

export function BomTriple({ shell, pcbPlan, cable }: BomTripleProps) {
  return (
    <dl className="grid grid-cols-[2.5rem_1fr] gap-x-2 gap-y-0.5 text-micro">
      <dt className="text-ink-faint">外壳</dt>
      <dd className="font-mono text-ink-body truncate" title={shell ?? undefined}>
        {shell ?? <span className="text-ink-faint">—</span>}
      </dd>
      <dt className="text-ink-faint">PCB</dt>
      <dd className="font-mono text-ink-body truncate" title={pcbPlan ?? undefined}>
        {pcbPlan ?? <span className="text-ink-faint">—</span>}
      </dd>
      <dt className="text-ink-faint">线材</dt>
      <dd className="font-mono text-ink-body truncate" title={cable ?? undefined}>
        {cable ?? <span className="text-ink-faint">—</span>}
      </dd>
    </dl>
  );
}
