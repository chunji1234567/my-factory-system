import { ReactNode } from 'react';

/**
 * 页面里的小区块标题（"项目明细" / "物料配方" / "今日待排" 等）。
 *
 * 视觉：左侧一条 4px 高的色条 + 加粗 subheading。
 * 用于在 Card / 弹窗里给二级内容打标。
 *
 * 用法：
 *   <Section title="物料配方" action={<Button>+ 添加</Button>}>
 *     ...内容...
 *   </Section>
 *
 * 详见 docs/design-system.md。
 */

type SectionAccent = 'primary' | 'accent' | 'success' | 'danger';

interface SectionProps {
  title: string;
  children: ReactNode;
  /** 左侧色条颜色，默认 primary。 */
  accent?: SectionAccent;
  /** 右上角操作。可选。 */
  action?: ReactNode;
  className?: string;
}

const ACCENT_CLS: Record<SectionAccent, string> = {
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  danger: 'bg-danger',
};

export function Section({
  title,
  children,
  accent = 'primary',
  action,
  className = '',
}: SectionProps) {
  return (
    <section className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-1 h-4 rounded-full ${ACCENT_CLS[accent]}`} />
          <h3 className="text-micro text-ink-muted uppercase">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
