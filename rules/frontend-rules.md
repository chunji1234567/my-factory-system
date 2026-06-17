# Frontend Rules（React + TS + Tailwind 真实版）

本文基于 `frontend/src/` 的实际代码（2026-05-11 精读）重写。每条规则都对应可执行的代码事实——若发现规则与代码不一致，先看 `docs/PRD.md` §9 是否已记入风险，再决定改代码还是改规则。

## 0. 技术栈与运行约束

- React 18 + TypeScript 5 + Vite 5 + Tailwind 3，使用纯 hooks，没有引入路由库（用 URL 参数 + `localStorage` 自己做）
- 仅 `react` / `react-dom` 是 runtime 依赖；`@vitejs/plugin-react`、`tailwindcss`、`autoprefixer`、`postcss`、`typescript` 是 devDeps
- 没有任何状态管理库（Redux / Zustand / Jotai 全不用）；所有状态在 panel 组件内部或 `AuthContext` 单例里
- 没有 React Router；面板切换靠 `App.tsx` 的 `activePanel` state + `panelConfig`
- `npm run build` 等于 `tsc --noEmit && vite build`——**TS 错误会卡 build**（2026-05-21 起，§9.2 #17）
- `npm run typecheck` 独立跑 `tsc --noEmit`，CI 与本地随时验证；当前基线零错误，引入任何新 TS 错误必须先修再合

## 1. 项目结构（必须保留）

```
src/
├── api/client.ts           # 唯一的 fetch 封装；所有请求经此
├── context/AuthContext.tsx # 鉴权状态 + 用户角色
├── hooks/use*.ts           # 数据获取 + 客户端分页 + partner 解析
├── utils/                  # 纯函数工具（orderUtils / partnerUtils）
├── types.ts                # panelConfig + 跨面板共享类型
├── components/
│   ├── common/             # 跨面板复用：FilterBar / NavbarButton / Pagination / Modal / OrderDetailsView / OrderItemsEditor / PartnerSelect / PriceTag / StatusBadge
│   └── panels/             # 9 个面板的入口，每个面板一个 .tsx
│       ├── partners/       # PartnerManagementPanel 拆出的 4 个子组件
│       ├── shipping/       # ShippingPanel 拆出的 3 个子组件
│       └── warehouse/      # WarehouseReceivingPanel 拆出的 2 个子组件
├── App.tsx                 # 入口：鉴权门 + 顶部导航 + 面板路由
└── main.tsx                # React root + AuthProvider
```

- 新增面板：在 `panels/` 下建一个文件 + 在 `types.ts` 的 `panelConfig` 登记 + 在 `App.tsx` 的 main 区加分支
- 新增共用组件：放 `components/common/`，禁止把通用逻辑藏在某个面板私有目录里

## 2. 与后端契约的硬约束（违反就会出 bug）

这些是后端代码里写死的，必须严格遵守。每条都有锚点指向后端文件以便对照。

1. **金额字段对非 manager 是 `null`**（`business/api/serializers.py: MonetaryMaskMixin`）
   - 影响字段：`PurchaseOrder.total_amount`、`PurchaseOrderItem.price`、`SalesOrder.total_amount`、`SalesOrderItem.price`
   - **正确处理（已落地）**：`PriceTag` 与 `OrderDetailsView` 内置 `formatMoney(value, fallback = '-')` —— `null` / `undefined` / `''` / `NaN` 一律渲染 `-`。新组件继续用 `PriceTag` 或拷贝同款 helper（2026-05-21 §9.2 #16 修复）
   - 派生计算的金额（如"小计 = 单价 × 数量"）：单价为 null 时**小计也必须是 `-`**，禁止当 0 ×；参考 `OrderDetailsView` 实现
   - **禁止**：直接 `Number(value).toFixed(2)`、`(value as number).toLocaleString(...)`、`Number(value) * quantity` 等会把 null 静默转 0 的写法
2. **销售单状态 PATCH 仅前进一档**（`business/api/views.py: SalesOrderViewSet.status._is_valid_transition`）
   - 前端推进状态的唯一入口是 `api.updateSalesOrderStatus(id, status)`
   - **禁止**：通过 `api.updateSalesOrder(id, { status })` 走通用 PATCH 来改状态——后端通用 PATCH 不校验状态机
3. **订单明细数量不可改小**（serializer `update` 内置校验）
   - 销售：`quantity` ≥ `shipped_quantity`
   - 采购：`quantity` ≥ 已收数量
   - 前端编辑时必须先读出已发/已收，禁用输入到小于该值
4. **发货/收货数量上限是"剩余量"**
   - 发货：`sales_item.quantity - shipped_quantity`
   - 收货：`purchase_item.quantity - received_quantity`
   - 前端必须在下拉选项里显示剩余量（已实现：`ShippingEntryForm`、`ReceivingModal`），并在 input 上设 `max` 避免 422
5. **合作方类型枚举有 4 种**（`core/models.py: Partner.PARTNER_TYPES`）
   - `CUSTOMER` / `SUPPLIER` / `BOTH` / `SELF`
   - **客户类筛选必须包含 `CUSTOMER` 与 `BOTH`**
   - **供应商类筛选必须包含 `SUPPLIER` 与 `BOTH`**
   - **`SELF` 不应出现在销售/采购的合作方下拉中**
6. **`paid_amount` 已废弃**（migration 0013）
   - 销售单/采购单的接口响应不再有 `paid_amount`
   - 单据级"已结清"概念不存在；"未结金额"只能是 `partner.balance`（合作方层级）
7. **`FinancialTransaction` 的 amount 在后端会被取负**（`finance_serializers.py: _normalize_amount`）
   - `RECEIPT` / `PAYMENT`：前端传 `Math.abs(amount)`，后端存 `-abs(amount)`
   - `ADJUST`：保留原符号
   - 显示时根据 `transaction_type` 决定是否 `Math.abs(amount)`——参考 `FinanceDetailPanel` 已有实现
8. **`/api/core/partners/` 只允许 manager**
   - 非 manager 不应调用 `usePartners()`；目前 `App.tsx:52` 把 warehouse/shipper 也带进去，会静默 403。新代码请按角色 gating
9. **DRF 分页响应是 `{count, next, previous, results}`**
   - hooks 当前只读 `results` 数组——超过 20 条数据会丢失
   - 任何新 hook 必须保留分页元数据并暴露给消费方，或服务端筛选/排序

## 3. 数据获取与状态

- **所有请求必须经 `src/api/client.ts: apiFetch`**——不允许组件内 `fetch()`
- **金额、库存、订单号都要走类型**，不要原地 Number 转换——用 hook 的归一化器一次解析，下游消费就是稳定类型

### 3.1 列表型 hook 标准范式（server-side filter + pagination）

参考实现：`hooks/useSalesOrders.ts`（2026-05-11 起作为模板）。所有需要分页或筛选的 hook（`usePurchaseOrders` / `useShippingLogs` / `useFinanceTransactions` / `usePartners` 等）都应按这个范式迁移。

**API client 层**（`api/client.ts`）

```typescript
// 1) 公共类型：所有列表接口共享的基础查询参数
export interface ListQueryParams {
  page?: number;
  page_size?: number;
  ordering?: string;
}

// 2) 每个端点声明自己的查询参数 interface，与后端 FilterSet 字段对齐
export interface SalesOrdersQueryParams extends ListQueryParams {
  status?: string;
  partner?: number;
  order_no?: string;
  // ...
}

// 3) DRF 分页响应类型
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// 4) get 方法接受 typed params 或 raw string（向后兼容）
getSalesOrders(params: SalesOrdersQueryParams | string = '') {
  const qs = typeof params === 'string' ? params : toQueryString(params);
  return apiFetch(`/api/business/sales-orders/${qs}`);
}
```

**Hook 层**（`hooks/useXxx.ts`）

- 入参是一个 options 对象 `{ enabled, page, pageSize, filters }`——**不要**用裸 boolean
- 返回值是 `{ data, loading, error, reload, pagination }`，其中 `pagination` 包含 `page` / `pageSize` / `totalCount` / `totalPages` / `hasNext` / `hasPrev`
- filters 变化要稳定化（用 `JSON.stringify` 作为 `useMemo` 依赖），避免新对象引用造成无限重 fetch
- 兼容旧的扁平数组响应作为防御：`Array.isArray(response.results) ? results : response`

**Panel 层**

- Panel **自己持有** filter state 和 page state
- 切换 filter 时 `useEffect` 把 page 重置到 1
- 把 panel 的"显示态"（如 `customerInput`、`customerId`）翻译成后端 query params（如 `partner` / `partner_name`）
- 用 `components/common/Pagination` 渲染分页 UI，传 `total={pagination.totalCount}` 和 `pageSize`
- 不再用 `usePaginatedFilter`（它是客户端分页，仅当数据集 < 100 且已经全量加载到内存时才适用）

### 3.2 LSP 约定（hook 的最小契约）

- **每个列表 hook 必须返回** `{ data, loading, error, reload, pagination }`
- **每个单实例 hook 必须返回** `{ data, loading, error, reload }`（无 pagination）
- 改 hook 签名要先 grep 所有调用点，确保都更新

## 4. 类型与代码质量

- **禁止 `any`**：当前面板里有大量 `props: any`、`order: any`、`partners.filter((p: any))`——视为债务，新增/改动必须显式类型
- **禁止 `__all__` / 字段省略**：与 backend serializer 对齐字段名，写在 hook 的 interface 里
- **每次改 API client 同时更新 hook 类型**：例如改 `api.createPurchaseOrder` 的入参，就要同步改 `useCreatePurchaseOrder`（若有）或调用处的 payload
- **不要在 panel 内手写正则 / partner 解析**：用 `utils/partnerUtils.ts: resolvePartnerId` / `formatPartner`
- **CI/本地必须能跑 `tsc --noEmit`**：建议把 `package.json` 的 build 改成 `tsc -b && vite build`，否则类型错误永远不报

## 5. UI 与交互一致性

- **筛选区**：用 `FilterBar` + `FilterBar.Field`；重置按钮放 `actions`，用 `NavbarButton variant="outline"`
- **合作方输入**：用 `PartnerSelect`（销售/采购/发货/收货）；自由文本筛选才考虑 datalist
- **状态徽标**：用 `StatusBadge kind="sales|purchase"`；不要自己写 `bg-blue-100` 之类的样式块
- **订单展开详情**：用 `OrderDetailsView mode="sales|purchase"`；不要自己实现明细列表
- **明细编辑**：用 `OrderItemsEditor mode="sales|purchase"`
- **金额格式化**：用 `PriceTag`（**待修复**：当前未处理 null）；新组件不要直接 `Number(v).toFixed(2)`
- **弹窗**：用 `components/common/Modal`，标准三段（header / body / footer）；保存按钮在右下，提交时 `disabled={isSaving}` + 文案切换
- **分页**：用 `components/common/Pagination`
- **错误提示**：写状态文案，禁止用 `alert()` 表达校验错误（当前部分面板还在用——视为债务）

## 6. 权限与路由

- `panelConfig` 是单一可信源——每个面板的 `roles` 决定它在哪些角色的导航里出现
- `App.tsx` 计算 `allowedPanels` 用 `panelConfig[key].roles.some(role => user.roles.includes(role))`
- **`panelConfig.roles` 必须与后端实际能访问该面板涉及的资源的角色对齐**——前端比后端紧的部分要列入 PRD §9
- 当前 `panelConfig` 限制（与后端关系）：
  - `inventory`：前后端一致（manager / warehouse 可写产品&分类）
  - `sales`：前端 manager-only，后端 manager+shipper 可读——shipper 通过 `ShippingPanel` 间接看
  - `purchase`：前端 manager-only，后端 manager+warehouse 可读——warehouse 通过 `WarehouseReceivingPanel` 间接看
  - `shipping`：前后端一致（manager / shipper）
  - `receiving`：前后端一致（manager / warehouse）
  - `partners`：前后端一致（manager only）
  - `selfMadeGallery`：前后端一致（manager / warehouse）
  - `financeDetail`：前后端一致（manager only）

## 7. 鉴权与 token

- `AuthContext` 维护 `accessToken` / `refreshToken`（双 localStorage 持久化）
- **当前缺陷**：8h access 过期后没有自动 refresh——下次请求 401，`loadUser` catch 后整体登出。**新功能不要假设 token 永远有效**，写请求时考虑 401 重试或主动续期
- 登录用 `useAuth().login(username, password)`；登出 `logout()`；用户信息 `user`（带 `roles`）

## 8. 提交前 checklist

- [ ] `npm run build` 通过
- [ ] 本地 `npx tsc --noEmit` 通过（构建未跑，必须人工跑）
- [ ] 用三个角色（manager / warehouse / shipper）各登录一次，验证：
  - 自己应有的面板都能进入
  - 金额字段对 warehouse/shipper 显示 `-`（不是 `¥0.00`）
  - 销售单状态推进按钮只能"前进一档"
  - 改订单明细时不能把数量改小于已发/已收
- [ ] 任何金额相关组件验证过 `null` 路径
- [ ] PR 描述中列出本次改动涉及的后端字段或接口（用于反向回查 PRD）

## 9. 当前已知技术债（PR 改动若涉及，应顺手清理）

引用至 `docs/PRD.md` §9.2 / §9.3 的前端相关项：

- 面板里大量 `any` 类型
- `panel.tsx` 直接调 `Number(total_amount).toFixed(2)`，未处理 null
- `useSalesOrders` 仍声明 `paid_amount: number`（已废弃，需删）
- `OrderTable.tsx` / `SummaryCards.tsx` 是死代码（含 `paidAmount` 引用，可一并删）
- `App.tsx` 给 warehouse/shipper 调用 `usePartners()` 静默 403
- `AuthContext` 无 token refresh
- hooks 不读 DRF 分页元数据
- 客户/供应商筛选漏掉 `BOTH` / 误纳 `SELF`
