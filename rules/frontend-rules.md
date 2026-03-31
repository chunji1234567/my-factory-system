# Frontend Rules

1. **Architecture**
   - Use React + TypeScript with functional components and hooks only.
   - Keep components small and focused; prefer composition over large monoliths.
   - Extract reusable hooks for data fetching (e.g., `useProducts`), and place them under `src/hooks`.

2. **Styling & UI**
   - Tailwind CSS is the default styling mechanism. Avoid inline styles unless dynamic.
   - Maintain responsive layout using Tailwind grid/flex utilities.
   - All user-facing forms must include labels describing数据类型；批量操作/创建表单应优先使用 modal，并确保交互步骤最少。
   - 列表交互需一致：销售/采购订单表格行点击后必须展开一个“明细 + 事件”区域，移动端通过卡片或折叠面板提供等效信息；不要为两个模块分别实现不同的交互模式。

3. **Data & State**
   - Always fetch data through API utilities (`src/api/client.ts`) to ensure JWT headers are attached.
   - Follow DRY: reuse mapping helpers (e.g., `mapProducts`, `mapSalesOrders`) when transforming API responses.
   - Use loading/error/empty placeholders for every data-driven component；复杂列表需按分类/筛选组织数据。
   - 若接口因权限隐藏某些字段（例如金额字段返回 `null`），前端必须优雅降级直接隐藏列，禁止直接对 `null` 调用格式化方法导致报错。
   - 针对移动/桌面双端的列表（例如发货控制、收货中心），同一个数据源需在大屏保留表格，小屏提供折叠卡片，且筛选按钮/状态切换应与桌面行为一致。

4. **Code Quality**
   - Apply SOLID/DRY/KISS principles: components/hooks should focus on单一职责；复杂界面（库存中心、API 测试）需拆分为筛选区、表格、弹窗等子组件。
   - Keep code readable; avoid deeply nested JSX—extract子组件或 hooks when needed.
   - Type all props/interfaces explicitly. Avoid `any` unless absolutely necessary.
