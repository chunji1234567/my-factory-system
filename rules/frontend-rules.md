# Frontend Rules

## 1. Architecture & Composition
- 使用 React + TypeScript 函数组件与 hooks；`panelConfig` 定义的面板在 `App.tsx` 中统一调度，新增面板必须遵守相同的导航与权限处理（URL + localStorage 同步）。
- 数据抓取统一通过 `src/hooks/use*` 与 `api/client`，hooks 负责 loading/error/reload；任何组件禁止直接 `fetch`。
- 可复用的业务组件（`FilterBar`、`NavbarButton`、`PartnerSelect`、`OrderItemsEditor`、`OrderDetailsView` 等）必须放在 `src/components/common` 并在多个面板间共享，避免复制粘贴样式或逻辑。
- 复杂表单或列表需拆成“筛选区 + 主列表 + 弹窗/抽屉”结构：筛选逻辑在顶部，主列表负责展示与展开明细，弹窗承担创建/编辑。

## 2. Styling & Interaction
- Tailwind CSS 为唯一样式方案，按照“筛选条圆角模块 + 表格/卡片”视觉规范；样式无法通过 Tailwind 表达时，再用行内 style。
- 所有筛选区域使用 `FilterBar`；若需要重置按钮，默认用 `NavbarButton variant="outline"`。列表操作按钮保持“深色=主操作、描边=辅助”。
- `PartnerSelect`/datalist 是合作方输入的唯一入口，需解析 `#ID`；不要自行写正则或额外输入框。
- 销售 & 采购 & 仓库面板的表格行点击后要展开 `OrderDetailsView`（或等效卡片）；移动端使用折叠卡片但提供同样信息。
- Modal/Drawer 里的表单：字段必须附带 label/placeholder/required 校验，提交前验证数值范围（数量、金额等）。批量操作（库存调整/发货录入）需逐项提示校验错误。

## 3. Data & State Management
- 所有列表必须实现 loading / error / empty 三态显示；分页默认 30 条，利用 `Pagination` 组件或与 hook 内置分页保持一致。
- 过滤状态（搜索词、筛选条件、分页等）放在面板级 state 中，并在依赖改变时 `useEffect` 校准页码（例如筛选后重置到第一页）。
- 在需要解析合作方/产品/分类时，优先使用 `orderUtils`、`partnerUtils` 提供的 helper，禁止重复实现 `formatPartner`、`resolvePartnerId`。
- hooks 返回的数据是不可变引用，面板内部如需派生（分组、排序）必须包裹在 `useMemo`，避免重复计算和 render storm。
- 事件/日志写入操作完成后应刷新源数据（调用对应 `reload` 或 `onRefresh`），保持列表、详情、统计一致；出现 `null` 金额/字段时直接隐藏列或显示 `-`，不要格式化 `null`。

## 4. Code Quality & Testing
- 保持 SOLID/DRY/KISS：大文件应拆分，重复逻辑抽成 hooks；表格/卡片内避免三层以上嵌套 JSX，必要时提子组件。
- 所有 props/interface 必须显式声明类型；除非第三方库限制，禁止 `any`。
- 与后端对接前先在 `api/client.ts` 定义类型和方法，然后在 hooks/组件中调用；若新增字段需同时更新类型与 UI。
- 在本地运行 `npm run build` 作为最小验证；新增或重构批量操作、事件流时，需要在 PR 描述或文档中列出手动回归要点。

## 5. UX Consistency Checklist
- 导航：`NavbarButton` 控制 active 状态；退出按钮固定在导航右侧，调用 `logout`。
- 筛选：重置逻辑需同时清空输入值与解析 ID；若筛选依赖 datalist，记得更新 `list` id 避免冲突。
- 弹窗：打开时初始化草稿数据，关闭后清空；保存按钮在右侧且在提交中禁用。
- 事件 & 日志：创建事件需选择类型（发货/退货/备注等），表单提交失败要展示 `alert` 或 message。
- 图库/移动视图：卡片需包含图片占位、基础信息、库存状态以及直接操作按钮；低库存显示醒目提示。

## 6. Documentation Alignment
- 更新或新增面板/交互后，必须同步 `docs/PRD.md` 与 `rules/frontend-rules.md`，确保 PRD 描述、规则与实现一致。
- 若引入新的通用组件或 hook，添加 README/注释说明用途，并在相关面板引用，禁止“只在一个文件里定义 + 使用”。

