/**
 * Design System 原子组件（Stage A，2026-06-17）。
 *
 * 所有面板应该优先用这里的组件，而不是自己写 inline 卡片 / 标题 / 按钮组合。
 * 这样：
 *   - 视觉自动一致（颜色、圆角、间距、阴影都从 tokens 来）
 *   - 想换 design language 时只改 tokens + primitives，不动业务面板
 *   - 新人接手前端只要看 docs/design-system.md 就懂规则
 *
 * 反模式：见到 inline `bg-white rounded-3xl border ...` 这种自造卡片，
 * 一律应该改成 <Card>。详见 docs/design-system.md "反模式" 一节。
 */

export { Card } from './Card';
export { PageHeader } from './PageHeader';
export { Section } from './Section';
export { StatTriple } from './StatTriple';
export type { Stat } from './StatTriple';
export { BomTriple } from './BomTriple';
export { ActionBar } from './ActionBar';
export { Pill } from './Pill';
export { DueDatePill } from './DueDatePill';
export { SearchableSelect } from './SearchableSelect';
export { StatusPillFilterRow } from './StatusPillFilterRow';
export { OrderListRow } from './OrderListRow';
export { ModalFooterButtons, DestructiveButton } from './ModalFooterButtons';
