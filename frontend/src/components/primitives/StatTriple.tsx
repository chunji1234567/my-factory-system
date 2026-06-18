import { ReactNode } from 'react';

/**
 * 销售/排产/发货 几个面板里随处可见的"四个数字摆一起"模式的统一组件。
 *
 * 当前 BOM-2.1 的销售明细有四个关键派生量：
 *   总量 / 已生产 / 已发 / 待排
 * 旧实现散落在 OrderDetailsView / SalesOrdersPanel / ShippingStatusTable，
 * 三处 UI 不一致。StatTriple（虽然名字是 Triple，实际支持 N stats）让
 * 这种数字组合在所有面板里长一个样。
 *
 * 用法：
 *   <StatTriple
 *     stats={[
 *       { label: '总量', value: 100 },
 *       { label: '已生产', value: 70, tone: 'success' },
 *       { label: '已发', value: 20 },
 *       { label: '待排', value: 30, tone: 'accent', emphasis: true },
 *     ]}
 *   />
 *
 * 详见 docs/design-system.md。
 */

type StatTone = 'default' | 'accent' | 'success' | 'danger' | 'muted';

const TONE_CLS: Record<StatTone, string> = {
  default: 'text-ink-strong',
  accent: 'text-accent-ink',
  success: 'text-success',
  danger: 'text-danger',
  muted: 'text-ink-faint',
};

export interface Stat {
  label: string;
  value: ReactNode;
  tone?: StatTone;
  /** 加粗强调（用于"最关键"那个数字，比如 "可发"）。 */
  emphasis?: boolean;
}

interface StatTripleProps {
  stats: Stat[];
  /** 排版方向，默认 horizontal。 */
  layout?: 'horizontal' | 'compact';
  className?: string;
}

export function StatTriple({ stats, layout = 'horizontal', className = '' }: StatTripleProps) {
  if (layout === 'compact') {
    // 行内紧凑布局：「总量 100 · 已生产 70 · 待排 30」
    return (
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-caption ${className}`}>
        {stats.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span className="text-ink-faint">{s.label}</span>
            <span className={`font-mono ${TONE_CLS[s.tone ?? 'default']} ${s.emphasis ? 'font-bold' : ''}`}>
              {s.value}
            </span>
          </span>
        ))}
      </div>
    );
  }
  // horizontal 卡片式：每个 stat 占一格，label 上 value 下
  return (
    <div className={`grid grid-flow-col auto-cols-fr gap-3 ${className}`}>
      {stats.map((s, i) => (
        <div key={i} className="flex flex-col items-center text-center py-2 px-1 rounded-input bg-surface-subtle">
          <span className="text-micro text-ink-faint uppercase">{s.label}</span>
          <span className={`text-lg font-mono mt-0.5 ${TONE_CLS[s.tone ?? 'default']} ${s.emphasis ? 'font-bold' : 'font-semibold'}`}>
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}
