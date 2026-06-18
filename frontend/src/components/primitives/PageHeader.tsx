import { ReactNode } from 'react';

/**
 * 页面顶部标题区——所有面板第一行都用它。
 *
 * 现在散落在各个面板里的写法不统一：
 *   - SalesOrdersPanel：text-2xl + uppercase 小字描述
 *   - PcbPlanPanel：同上但 spacing 不同
 *   - PartnerManagementPanel：直接 <h2>
 * 用 PageHeader 后视觉立刻一致。
 *
 * 用法：
 *   <PageHeader
 *     title="销售管理"
 *     eyebrow="Outbound Sales · Orders"
 *     actions={<Button>+ 新建销售单</Button>}
 *   />
 *
 * 详见 docs/design-system.md。
 */

interface PageHeaderProps {
  title: string;
  /** 标题上方的小字 caption（uppercase 灰字）。可选。 */
  eyebrow?: string;
  /** 标题下方的描述文字（normal case，灰色 body）。可选。 */
  description?: string;
  /** 右侧操作区（按钮 / Pill 等）。 */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div>
        {eyebrow && (
          <p className="text-micro text-ink-faint uppercase mb-1">{eyebrow}</p>
        )}
        <h2 className="text-heading text-ink tracking-tight">{title}</h2>
        {description && (
          <p className="text-caption text-ink-muted mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
