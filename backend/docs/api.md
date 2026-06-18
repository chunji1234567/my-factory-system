# Backend API 速查（2026-05-21 修订）

> 本文是供 API 调用方（前端 / 第三方集成）快速查询的精简版。**完整规格、字段定义、不变量、状态机**请看 `docs/PRD.md`。本文与 PRD §5 同步，发生冲突以 PRD 为准。

## 0. 健康检查

```
GET /health/   →   200  {"status": "ok"}
```

- 顶层路径（**不**在 `/api/` 下），供反代/编排层探活
- **无需鉴权**（`AllowAny` + `authentication_classes=[]`），带 token 也不报错
- 不做 DB 探活——DB 探活走 `python manage.py check --database default`（见 `rules/deployment-rules.md §6`）

## 1. 鉴权

JWT（djangorestframework-simplejwt），access token 寿命 8 小时。

```
POST /api/token/           {"username": "...", "password": "..."} → {"access": "...", "refresh": "..."}
POST /api/token/refresh/   {"refresh": "..."}                      → {"access": "..."}
```

所有业务端点请求头：`Authorization: Bearer <access>`。

**前端实现细节**：`api/client.ts` 中 `apiFetch` 检测到 401 时会自动调 `/api/token/refresh/` 并重试一次原请求，对调用方透明。

## 2. 角色

Django Groups：`manager` / `warehouse` / `shipper`。`superuser` 视同 manager。完整权限矩阵见 PRD §2.2。

## 3. 主数据接口（`/api/core/`）

| 路径 | 方法 | 权限 | 备注 |
|---|---|---|---|
| `products/` | GET | manager / warehouse | DRF 分页，返回 `category_detail` 嵌套 |
| `products/` | POST | manager / warehouse | 创建产品 |
| `categories/` | GET / POST | manager / warehouse | 同上口径 |
| `partners/` | GET / POST | **manager only** | 创建合作方；非 manager 不要调（403） |
| `pcb-plans/` | LIST / CREATE / RETRIEVE / UPDATE / DESTROY | **manager only** | PCB 方案 CRUD。nested `materials` 写入；UPDATE 时**全量替换 materials**。过滤：`is_active` / `name` / `code`（icontains）。详见 PRD §3.2 §4.5 |
| `me/` | GET | 任意已认证 | 返回 `{id, username, full_name, roles[]}` |

## 4. 业务接口（`/api/business/`）

### 4.1 销售订单

| 路径 | 方法 | 权限 |
|---|---|---|
| `sales-orders/` | GET | manager / shipper |
| `sales-orders/` | POST / PATCH / DELETE | manager only |
| `sales-orders/{id}/events/` | GET / POST | manager / shipper |
| `sales-orders/{id}/status/` | PATCH | manager / shipper（仅前进一档） |

**查询参数**：`status`、`partner`、`order_no`（icontains）、`partner_name`（icontains）、`created_from`、`created_to`、`ordering`、`page`、`page_size`

**关键约束**：
- 编辑明细数量时 `quantity < shipped_quantity` 抛 ValidationError
- 状态机：`ORDERED` → `PRODUCING` → `SHIPPED` → `COMPLETED`，PATCH `/status/` **仅前进一档**
- `order_no` 未传时后端自动生成 `SO{year}-{NNNN}`（`select_for_update + 取最大尾号 +1`）

### 4.2 采购订单

| 路径 | 方法 | 权限 |
|---|---|---|
| `purchase-orders/` | GET | manager / warehouse（金额对 warehouse null） |
| `purchase-orders/` | POST / PATCH / DELETE | manager only |
| `purchase-orders/{id}/events/` | GET / POST | manager / warehouse |

**查询参数**：`status`、`partner`、`order_no`、`created_from`、`created_to`、`ordering`、`page`、`page_size`

**关键约束**：编辑明细时 `quantity < 已收量` 抛 ValidationError；`order_no` 与 SO 同口径自动生成。

### 4.3 收发货 / 库存调整（事件型，append-only）

| 路径 | 方法 | 权限 | 备注 |
|---|---|---|---|
| `receiving-logs/` | GET / POST | manager / warehouse | 入库；写入即调库存 |
| `shipping-logs/` | GET / POST | manager / shipper | 发货；**不动库存** |
| `stock-adjustments/` | GET / POST | manager / warehouse | 库存调整（MANUAL_IN/MANUAL_OUT/PRODUCE_IN） |

**重要**：上述三个端点 **没有 PATCH/PUT/DELETE**——这些是 append-only 事件，错了请录反向类型冲销（详见 PRD §3.2 + `rules/backend-rules.md §1.5`）。

**收货**`receiving-logs/` 查询参数：`purchase_order`、`operator`、`received_from`、`received_to`、`ordering`、`page`、`page_size`

**发货**`shipping-logs/` 查询参数：`sales_order`、`partner`、`partner_name`、`operator`、`shipped_from`、`shipped_to`、`ordering`、`page`、`page_size`

**库存调整**`stock-adjustments/` 查询参数：`product`、`adjustment_type`（`MANUAL_IN` / `MANUAL_OUT` / `PRODUCE_IN` / `PRODUCE_CONSUME`）、`operator`、`note`、`created_from`、`created_to`、`ordering`、`page`、`page_size`。`PRODUCE_CONSUME` 由排产单 EXECUTED 自动写入，前端 / admin 不要手动写。

### 4.4 BOM 排产（BOM-2.1，每次创建即扣料）

| 路径 | 方法 | 权限 | 备注 |
|---|---|---|---|
| `production-records/` | GET / POST | manager / warehouse / shipper | POST: 必填 `sales_item` + `quantity`（创建即扣料，不可逆）|
| `production-records/{id}/` | GET | 同上 | 详情。**无 PATCH / DELETE**（append-only） |

**查询参数**：`sales_item`、`sales_order`、`partner`、`executed_from`、`executed_to`、`operator`、`ordering`、`page`、`page_size`

**关键约束**：
- ProductionRecord 创建即扣料：写 (2 + N) 条 `StockAdjustment(PRODUCE_CONSUME)`——1 条 shell + 1 条 cable + N 条 pcb_plan 展开的原材料。shell/cable/plan 全部从 `sales_item` 取
- **过排产禁止**：`produced + new.quantity > sales_item.quantity` → 400
- 首条 ProductionRecord 创建时信号自动推 `SalesOrder.status` ORDERED → PRODUCING
- API 写入路径强制 `skip_consumption=False`；要"成品挪用"等边缘场景需走 admin 后台
- 允许库存变负（补货节奏与排产解耦）
- 一条 line 必须挂三件半成品（外壳 / 板材 / 线材）；若挂 `sales_item`，三件 FK 自动从 sales_item 同名字段回填
- `order_no` 不传时后端自动生成 `PRD{year}-{NNNN}`

### 4.5 客户偏好型号

| 路径 | 方法 | 权限 |
|---|---|---|
| `customer-preferred-products/` | GET | manager / shipper |
| `customer-preferred-products/` | POST / DELETE | manager only |

查询参数：`?partner=<id>` 必传；`search`（按 name 模糊）。

### 4.5 财务（manager only，全部）

| 路径 | 方法 | 备注 |
|---|---|---|
| `finance/transactions/` | GET / POST / PATCH / DELETE | 流水 CRUD |
| `finance/partners/` | GET | 合作方汇总（应收/应付分页） |
| `finance/partners/{id}/` | GET | 单合作方详情 |
| `finance/partners/{id}/ledger-export/` | GET | CSV 台账导出（带 BOM） |

**流水**`finance/transactions/` 查询参数：`partner`、`transaction_type`、`note`、`created_from`、`created_to`、`ordering`、`page`、`page_size`

**类型与符号规则**（关键）：
- POST 时 `RECEIPT` / `PAYMENT` 传 `amount=正数`，后端 `_normalize_amount` 自动取 `-abs(amount)`
- `ADJUST` 类型保留原符号
- 显示时根据 `transaction_type` 决定是否取 `abs`（前端 `FinanceDetailPanel` 已实现）

**合作方汇总 / 详情**支持 `type=receivable|payable`、`search`、日期范围、ordering。详情接口还支持 `ledger_page` / `ledger_page_size` / `ledger_from` / `ledger_to`。

**台账导出**：`Content-Type: text/csv; charset=utf-8-sig`，附 BOM，Excel 直开。支持 `summary=1` 简化模式 + `year` 年度筛选。

## 5. 响应格式约定

- **DRF 分页**（所有 list 端点）：`{count: int, next: url|null, previous: url|null, results: [...]}`，PAGE_SIZE 默认 20
- **`finance/partners/`** 例外：`results` 是个 dict 而非数组 —— `{type, total_balance, partners: [...]}`，前端解构时多一层（2026-05-21 起 `total_outstanding` 改为 `total_balance`；详见 PRD §9.4 changelog）
- **错误响应**：单字段 `{detail: "..."}` 或多字段 `{field: ["..."]}`；状态非法时 `{detail: "非法的状态转换"}` 400
- **金额字段对非 manager 是 `null`**（`MonetaryMaskMixin`）—— 前端必须把 `null` 渲染为 `-` 或隐藏，**禁止当作 0 格式化**

## 6. 与本文配套的资源

- 完整 PRD：`docs/PRD.md`
- 后端代码约束：`rules/backend-rules.md`
- 前端列表 hook 标准范式（如何正确消费上述分页接口）：`rules/frontend-rules.md §3.1`
- 风险与待办：`docs/PRD.md §9`

## 7. 历史快照

`backend/docs/api.md` 早期版本（2026-04 前）描述了 `paid_amount` / `Partner.balance` 等已废弃字段，已被本文整体替换。详见 PRD §9.4 changelog。
