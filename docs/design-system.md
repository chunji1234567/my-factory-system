# Design System（2026-06-17 Stage A 落地）

> 视觉语言的"原子"集中定义。这份文档是**所有新增 UI 的强制规范**。
> 散落在面板里的 inline `bg-white rounded-3xl border-slate-100 p-5 shadow-sm`
> 这种写法都属于反模式，逐步全部替换为下面的 token / primitive。

---

## 1. 设计原则

1. **语义化 > 描述化**：颜色叫 `primary` / `accent` / `success`，不叫 `slate-900` / `amber-700` / `emerald-600`。换皮肤只改 token。
2. **少即是多**：颜色 ≤ 7 个角色，圆角 3 档，阴影 2 层，字号 5 级。任何"多一个变体"的需求都要先证明现有的不够用。
3. **复用 > 复制**：见到"上次某面板写过的样式"立即应该是某个 primitive，而不是再写一份。

---

## 2. Token 表（`tailwind.config.js`）

### 2.1 颜色

| 角色 | Tailwind class | 实际色值 | 用途 |
|---|---|---|---|
| **primary** | `bg-primary` / `text-primary` | `#0f172a` (slate-900) | 主操作按钮 / 主标题文字 |
| primary-hover | `bg-primary-hover` | `#1e293b` (slate-800) | 主按钮 hover |
| on-primary | `text-on-primary` | `#fff` | 主操作按钮上的文字 |
| **surface** | `bg-surface` | `#fff` | 卡片底 |
| surface-subtle | `bg-surface-subtle` | `#f8fafc` (slate-50) | 页面底 / 弱化区块 |
| surface-muted | `bg-surface-muted` | `#f1f5f9` (slate-100) | 失效输入框 / chip 底 |
| **ink** | `text-ink` | `#0f172a` | 主标题 |
| ink-strong | `text-ink-strong` | `#1e293b` | 副标题 |
| ink-body | `text-ink-body` | `#334155` | 正文 |
| ink-muted | `text-ink-muted` | `#64748b` | 弱化辅助 |
| ink-faint | `text-ink-faint` | `#94a3b8` | 占位 / 失效 |
| **line** | `border-line` | `#f1f5f9` | 默认细线 |
| line-strong | `border-line-strong` | `#e2e8f0` | 强调线 |
| line-focus | `border-line-focus` | `#0f172a` | 聚焦 |
| **accent** | `bg-accent` / `text-accent` | `#b45309` (amber-700) | "今日待办" / 强调 |
| accent-surface | `bg-accent-surface` | `#fef3c7` (amber-100) | 同上的背景 |
| accent-ink | `text-accent-ink` | `#92400e` (amber-800) | 同上的文字 |
| **success** | `bg-success` / `text-success` | `#047857` (emerald-700) | 已完成 / 已发完 |
| success-surface | `bg-success-surface` | `#d1fae5` (emerald-100) | 同上背景 |
| **warning** | `bg-warning` / `text-warning` | `#d97706` (amber-600) | 生产中 / 部分发货 |
| **danger** | `bg-danger` / `text-danger` | `#e11d48` (rose-600) | 不可逆 / 删除 / 报错 |
| danger-surface | `bg-danger-surface` | `#ffe4e6` (rose-100) | 同上背景 |
| danger-ink | `text-danger-ink` | `#9f1239` (rose-800) | 同上文字 |

### 2.2 圆角

| Token | Class | px | 用途 |
|---|---|---|---|
| card | `rounded-card` | 24 | 大块卡片 / 弹窗 |
| input | `rounded-input` | 12 | 输入框 / 小按钮 / chip |
| pill | `rounded-pill` | ∞ | 全圆角按钮 / 徽章 |

### 2.3 阴影

| Token | Class | 用途 |
|---|---|---|
| card | `shadow-card` | 默认卡片 |
| card-hover | `shadow-card-hover` | hover 升起 |

### 2.4 字号

| Token | Class | size / weight | 用途 |
|---|---|---|---|
| heading | `text-heading` | 24 / 700 | 页面 h2（PageHeader 主标题） |
| subheading | `text-subheading` | 18 / 700 | 卡片标题 |
| body | `text-body` | 14 / 400 | 标准正文（Tailwind 默认 text-sm） |
| caption | `text-caption` | 12 / 500 | 弱化辅助 |
| micro | `text-micro` | 11 / 700 + tracking | UPPER 标签（"项目明细" / "操作"） |

---

## 3. 原子组件（`src/components/primitives/`）

### 3.1 `<Card>`

通用容器。**所有内容块都用它**。

```tsx
import { Card } from '../primitives';

// 标准卡片
<Card>
  <h3>方案 A</h3>
  <p>...</p>
</Card>

// 可点击 + hover 升起
<Card interactive onClick={() => openDetail(id)}>...</Card>

// 嵌套二级卡片（无阴影）
<Card tone="subtle" flat padding="tight">...</Card>

// 警示卡片（accent 底）
<Card tone="accent">今日待办：5 张销售单需排产</Card>

// 危险卡片（不可逆动作前的提示）
<Card tone="danger" padding="tight">⚠ 此操作不可逆，将扣除原材料库存</Card>
```

### 3.2 `<PageHeader>`

每个面板的第一行。统一标题层级。

```tsx
import { PageHeader } from '../primitives';

<PageHeader
  title="销售管理"
  eyebrow="Outbound Sales · Orders"
  description="维护销售订单与发货节奏"
  actions={<button className="...">+ 新建销售单</button>}
/>
```

### 3.3 `<Section>`

页面里的小区块。左侧色条 + 灰字 UPPER 标题。

```tsx
import { Section } from '../primitives';

<Section title="项目明细" action={<button>+ 添加</button>}>
  ...list...
</Section>

<Section title="不可逆动作" accent="danger">
  ...
</Section>
```

### 3.4 `<StatTriple>`

"数字摆一起"的统一展示。销售明细、排产明细都用这个展示派生量。

```tsx
import { StatTriple } from '../primitives';

// 卡片格式
<StatTriple
  stats={[
    { label: '总量', value: 100 },
    { label: '已生产', value: 70, tone: 'success' },
    { label: '已发', value: 20 },
    { label: '可发', value: 50, tone: 'accent', emphasis: true },
  ]}
/>

// 紧凑行内格式（嵌入 Card 顶部的"指标条"）
<StatTriple
  layout="compact"
  stats={[
    { label: '总量', value: 100 },
    { label: '可发', value: 50, tone: 'accent', emphasis: true },
  ]}
/>
```

### 3.5 `<ActionBar>` + 子组件

输入 + 按钮的统一布局。

```tsx
import { ActionBar } from '../primitives';

// 排产中心每行的"输数量 + 排产按钮"
<ActionBar>
  <ActionBar.Input
    value={draft}
    onChange={setDraft}
    max={remaining}
    placeholder={`≤ ${remaining}`}
  />
  <ActionBar.PrimaryButton onClick={handleSubmit} loading={isSaving}>
    排产
  </ActionBar.PrimaryButton>
</ActionBar>

// 列表行的右侧操作
<ActionBar align="end">
  <ActionBar.GhostButton onClick={onEdit}>编辑</ActionBar.GhostButton>
  <ActionBar.DangerButton onClick={onDelete}>删除</ActionBar.DangerButton>
</ActionBar>
```

### 3.6 `<Pill>`

状态徽章 / 标签。`StatusBadge` 的更通用版（后续可考虑统一）。

```tsx
import { Pill } from '../primitives';

<Pill tone="success">已完成</Pill>
<Pill tone="warning" outline>生产中</Pill>
<Pill tone="muted">已下架</Pill>
<Pill tone="accent">今日</Pill>
```

---

## 4. 反模式（看到就改）

```tsx
// ❌ 反模式
<div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
  <h2 className="text-2xl font-bold text-slate-900">页面标题</h2>
  ...
</div>

// ✅ 正解
<Card>
  <PageHeader title="页面标题" />
  ...
</Card>
```

```tsx
// ❌ 反模式：散落的色阶
<span className="text-slate-400 text-xs">已发</span>
<span className="font-mono text-slate-700">20</span>

// ✅ 正解
<StatTriple stats={[{ label: '已发', value: 20 }]} layout="compact" />
```

```tsx
// ❌ 反模式：随手写的按钮
<button className="rounded-full bg-slate-900 text-white px-6 py-2 text-sm font-bold ...">
  确认
</button>

// ✅ 正解
<ActionBar.PrimaryButton onClick={...}>确认</ActionBar.PrimaryButton>
```

---

## 5. 迁移路径

旧面板**不强制立即迁移**——但任何修改的面板都要顺手用 primitive。

迁移优先级（详见 `docs/ux-audit.md`，Stage B 输出）：

1. ProductionPanel（最新写的，最痛）
2. ShippingPanel + 3 个子组件（三个大模块需要瘦身）
3. SalesOrdersPanel（最经常用，杂乱）
4. InventoryPanel
5. 其余面板

迁移技巧：**每个面板每次最多重写一遍**，不要持续小修补。一次性重写完往往比小修小补干净。

---

## 6. 后续可能新增的 token / primitive

如果发现下面这些场景没有现成 token，可以加：

- **状态色**：除了 success / warning / danger，可能需要 `info`（蓝色，"通知"）—— 暂时用 ink-muted 代替
- **空状态组件** `<EmptyState>`：当前各面板"暂无数据"展示不一致，下次抽
- **数据表格** `<DataTable>`：当前各种列表表格 / 卡片混用，需要统一
- **图标系统**：当前用 emoji（✓ ⚠ ×），可以引入 lucide-react，但 bundle 会变大，先观察需求

加新 token 之前**先 review 现有的**，避免污染。
