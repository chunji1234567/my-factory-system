# My Factory System PRD（后端事实版）

> 本版 PRD 基于 `backend/` 当前代码（Django 6.0 + DRF + simplejwt）逐文件精读后重写。所有"业务规则"小节直接对应 models / signals / serializers / permissions 中可执行的代码；任何与代码不符的描述都视为缺陷，应优先修代码或修文档。前端面板描述仅作为后端能力的消费视角，等下一轮按 frontend 实际代码再核对。

---

## 1. 产品愿景与范围

为多品类工厂提供一体化运营平台，以浏览器为主入口，覆盖以下五条主线：

1. 主数据：合作方、产品分类、物料档案
2. 采购：采购单 → 分批收货 → 自动入库与状态推进
3. 销售：销售单 → 分批发货 → 自动状态推进（注意：发货不扣库存）
4. 库存：采购入库、生产入库、手动盘盈/盘亏，统一进 StockLog
5. 财务：合作方台账、应收应付汇总、流水录入、CSV 导出

后端是事实来源；前端、企业微信通知等渠道都是它的视图或附属功能。

---

## 2. 角色与权限模型

### 2.1 角色定义

角色由 Django `auth.Group` 承载，名称必须严格等于：`manager` / `warehouse` / `shipper`（见 `business/api/utils.py`）。`User.is_superuser=True` 在 `_is_in_group` 中始终返回 True，等同于 manager。

| 角色 | 含义 | 主要职责 |
|---|---|---|
| manager | 经理 / 财务 | 全部读写，唯一可访问财务接口 |
| warehouse | 仓管 / 产线 | 维护分类与产品、录入收货与库存调整、查看采购单（金额脱敏） |
| shipper | 发货员 | 录发货、推销售单状态、查看销售单（金额脱敏）、维护客户偏好型号（仅查不改） |

`scripts/setup_roles.py` 负责创建三个 Group 并预置 demo 用户；manager 直接被授予 `core` + `business` 全部权限，其余两个 Group 持有 `PermissionSpec` 列出的细粒度 `view/add/change` 权限。

### 2.2 权限矩阵（API 层）

权限类来自 `business/api/permissions.py`，业务覆盖如下：

| 资源 / 端点 | manager | warehouse | shipper | 权限类 |
|---|---|---|---|---|
| `core/products/` GET | ✓ | ✓ | ✗ | `IsManagerOrWarehouse` |
| `core/products/` POST | ✓ | ✓ | ✗ | `IsManagerOrWarehouse` |
| `core/categories/` GET | ✓ | ✓ | ✗ | `IsManagerOrWarehouse` |
| `core/categories/` POST | ✓ | ✓ | ✗ | `IsManagerOrWarehouse` |
| `core/partners/` GET | ✓ | ✗ | ✗ | `IsManager` |
| `core/partners/` POST | ✓ | ✗ | ✗ | `IsManager` |
| `core/pcb-plans/` 全部 | ✓ | ✗ | ✗ | `IsManager` |
| `core/me/` GET | ✓ | ✓ | ✓ | `IsAuthenticated` |
| `purchase-orders/` GET | ✓ | ✓ | ✗ | `ManagerOrWarehouseReadOnly` |
| `purchase-orders/` 写 | ✓ | ✗ | ✗ | 同上 |
| `purchase-orders/{id}/events/` GET/POST | ✓ | ✓ | ✗ | `IsManagerOrWarehouse` |
| `sales-orders/` GET | ✓ | ✗ | ✓ | `ManagerOrShipperReadOnly` |
| `sales-orders/` 写 | ✓ | ✗ | ✗ | 同上 |
| `sales-orders/{id}/events/` GET/POST | ✓ | ✗ | ✓ | `IsManagerOrShipper` |
| `sales-orders/{id}/status/` PATCH | ✓ | ✗ | ✓ | `IsManagerOrShipper` |
| `customer-preferred-products/` GET | ✓ | ✗ | ✓ | `ManagerOrShipperReadOnly` |
| `customer-preferred-products/` POST/DELETE | ✓ | ✗ | ✗ | 同上 |
| `receiving-logs/` GET/POST | ✓ | ✓ | ✗ | `IsManagerOrWarehouse` |
| `shipping-logs/` GET/POST | ✓ | ✗ | ✓ | `IsManagerOrShipper` |
| `stock-adjustments/` GET/POST | ✓ | ✓ | ✗ | `IsManagerOrWarehouse` |
| `stock-adjustments/{id}/` GET | ✓ | ✓ | ✗ | `IsManagerOrWarehouse`（无 PATCH/PUT/DELETE，append-only） |
| `production-orders/` GET/POST/PATCH | ✓ | ✓ | ✓ | `IsAuthenticated`（三角色都可排产） |
| `production-orders/{id}/execute/` POST | ✓ | ✓ | ✓ | 同上；触发扣料，不可逆 |
| `production-orders/{id}/cancel/` POST | ✓ | ✓ | ✓ | 同上；仅 PLANNED 可取消 |
| `finance/transactions/` 全部 | ✓ | ✗ | ✗ | `IsManager` |
| `finance/partners/` 全部 | ✓ | ✗ | ✗ | `IsManager` |
| `finance/partners/{id}/` 全部 | ✓ | ✗ | ✗ | `IsManager` |
| `finance/partners/{id}/ledger-export/` | ✓ | ✗ | ✗ | `IsManager` |

### 2.3 金额脱敏

`MonetaryMaskMixin.to_representation` 在序列化阶段将 `monetary_fields` 列出的字段置为 `null`（仅当请求用户不是 manager）。当前覆盖：

- `PurchaseOrderItemSerializer.price`
- `PurchaseOrderSerializer.total_amount`
- `SalesOrderItemSerializer.price`
- `SalesOrderSerializer.total_amount`

非 manager 看到的是 `null`，不是 `0`，前端必须支持显式空值显示（如 `-`）。

---

## 3. 数据模型

### 3.1 core 应用

#### Partner（`core.Partner`）
- `name`：唯一字符串
- `partner_type`：`SUPPLIER` / `CUSTOMER` / `BOTH` / `SELF`
- `balance`：**只读 `@property`**（不是字段），实时求和 `ledger_entries.amount`。原冗余字段已在 migration `core.0003_remove_partner_balance` 中删除。列表场景应使用 `annotate(balance=Sum('ledger_entries__amount'))` 避免 N+1 查询。详见 §4.4 与 §9.4 changelog 2026-05-11。

业务约束：
- `SalesOrder.partner` 仅允许 `CUSTOMER` / `BOTH`
- `PurchaseOrder.partner` 仅允许 `SUPPLIER` / `BOTH`
- `CustomerPreferredProduct.partner` 仅允许 `CUSTOMER` / `BOTH`
- `SELF` 类型预留给"工厂自用"，目前仅 admin 可建

#### Category（`core.Category`）
- `category_type`：`RAW_MATERIAL` / `SELF_MADE` / `BOARD`（已弃用）/ `CABLE` / `FINISHED`
  - **`BOARD` 自 BOM-2.0（2026-05-21）起弃用**——板材不再作为"半成品"独立跟踪，改为通过 PCB 方案展开到原材料层。choice 不删（避免冲击 migration 0004/0015），但 PRD 与 model 注释都标注：新建产品不应再用 BOARD 类型。详见 §3.2 PcbPlan 与 §9.4 changelog 2026-05-21。
  - `CABLE` 是 BOM 引入的半成品分类（外壳与线材都是自家工坊每天生产送入库的成品）
  - 线材的细分（铜包钢 / 铜线 / 不同插头长度）放在 CABLE 下，通过 `Product.model_name` 区分
- `parent`：自引用 FK，支持无限级分类
- `Product.category` 是 `on_delete=PROTECT`，所以分类下有产品就不能删除（`test_category_protection` 验证）

#### Product（`core.Product`）
- `internal_code`：全局唯一，自产件命名规范 `年份-类别-系列-颜色`（例：`2026-SH-SD-BK`）
- `model_name`：客户/规格名
- `image`：上传到 `products/%Y/%m/`
- `unit`：默认 `"个"`
- `stock_quantity` / `min_stock`：Decimal(12,2)。**只能由 ReceivingLog / StockAdjustment 修改**

#### PcbPlan（`core.PcbPlan`，BOM-2.0 起）
- `name`：唯一字符串，例 `"M1 控制板 v1"`
- `code`：可选方案编号，对内使用
- `description`：方案备注
- `is_active`：软删除标志——下架后不可被新销售/排产明细选中（`limit_choices_to` + serializer 校验），但**保留历史订单引用**；要彻底物理删除需先确认无引用（`ProductionOrderLine.pcb_plan` 是 PROTECT FK）
- `created_at` / `updated_at`：审计时间戳
- 业务定位：**主数据**层（与 Partner / Category / Product 并列），manager 维护

#### PcbPlanMaterial（`core.PcbPlanMaterial`，BOM-2.0 起）
- 一条 = 该方案用到一种原材料及其单板用量
- `plan`：FK `PcbPlan`，`CASCADE`（方案删除时明细级联）
- `material`：FK `Product`，**`PROTECT` + `limit_choices_to={'category__category_type': 'RAW_MATERIAL'}`**——材料必须是 RAW_MATERIAL 分类（serializer 显式校验，model 层 limit_choices_to 仅作用于 admin/forms）
- `quantity_per_unit`：Decimal(12,2)，单板用量；扣料计算 `line.quantity × material.quantity_per_unit`
- `unique_together = (plan, material)`：同一方案下同一原材料不重复
- `note`：可选备注

### 3.2 business 应用

#### SalesOrder（销售单）
- `status`：`ORDERED` → `PRODUCING` → `SHIPPED` → `COMPLETED`（前端建模为单向阶段流）
- `order_no`：缺省时由 `SalesOrderSerializer._generate_order_no` 生成，格式 `SO{year}-{NNNN}`；与采购单共享 helper `_generate_sequential_order_no`，在 `transaction.atomic()` + `select_for_update` 下取最大尾号 +1，规避并发碰撞与"删除中间单后撞号"的问题
- `partner`：`on_delete=CASCADE`，删除合作方会级联清掉订单
- `total_amount`：由 `sync_sales_order_ledger` 信号在 `SalesOrderItem` 写入时自动重算（同时维护该订单的唯一 SALES 台账条目）
- ~~`paid_amount`~~：**已废弃并从模型中删除**（见 migration 0013）。应收金额改由 `Partner.balance`（property）= 该合作方所有 `PartnerLedgerEntry.amount` 之和，单据级别的"已结清"概念不再保留
- `operator`：缺省时取 `request.user.get_full_name() or username`

#### SalesOrderItem
- BOM-2.0 改造后（2026-05-21），一条明细 = 一套"成品 SKU"，由三件组成：
  - `product`：外壳半成品槽位（沿用历史字段名），FK `Product` 限定 `category_type=SELF_MADE`
  - `pcb_plan`：PCB 方案槽位（**BOM-2.0 起替换 board 字段**），FK `PcbPlan` 限定 `is_active=True`
  - `cable`：线材半成品槽位，FK `Product` 限定 `category_type=CABLE`
  - 三个 FK 都 `SET_NULL`；新创建明细时 serializer 强制三件齐备
- 排产扣料：每条 line 写 **(2 + N) 条** `StockAdjustment(PRODUCE_CONSUME)`——1 条扣 shell + 1 条扣 cable + N 条扣 plan 展开的原材料（详见 §4.5）
- `quantity` 表示套数（1 套 = 1 外壳 + 1 板（按方案展开为 N 个原材料）+ 1 线材）
- `shipped_quantity`（property）：`ShippingLog.quantity_shipped` 的实时聚合
- 编辑数量：序列化器 update 时若 `quantity < shipped_quantity` 抛 ValidationError

#### ShippingLog（分批发货）
- `quantity_shipped` 必须 > 0 且 ≤ 剩余可发量（`SalesOrderItem.quantity - 已发货`）
- `save()`：写一条 `OrderEvent('SHIPPING')`；**不动库存**
- `post_save` 信号 `auto_complete_sales_order`：聚合所有 item 的 `shipped_quantity`，全部满足→`COMPLETED`，否则→`SHIPPED`

#### OrderEvent
- 销售订单的事件流；类型 `SHIPPING` / `RETURN` / `REMARK`
- `SHIPPING` 事件由 `ShippingLog.save` 自动写入
- `RETURN` / `REMARK` 由 `/sales-orders/{id}/events/` 接口手动写

#### PurchaseOrder（采购单）
- `status`：`ORDERED` → `PARTIAL` → `RECEIVED`
- `order_no` 缺省格式 `PO{year}-{NNNN}`，与销售单共用 helper `_generate_sequential_order_no`，`select_for_update` + 取最大尾号 +1
- `partner`：`on_delete=CASCADE`
- `total_amount`：信号 `sync_purchase_order_ledger` 自动重算（同时维护该订单的唯一 PURCHASE 台账条目）
- ~~`paid_amount`~~：**已废弃并从模型中删除**（见 migration 0013），应付金额改由 `Partner.balance`（property）= 合作方台账之和

#### PurchaseOrderItem
- `product`：`on_delete=PROTECT`
- 编辑数量：若 `quantity < 已收货数量` 抛 ValidationError

#### PurchaseOrderEvent
- 类型 `RECEIVING` / `RETURN` / `REMARK`
- `RECEIVING` 由 `ReceivingLog.save` 自动写

#### ReceivingLog（分批入库）
- `quantity_received` > 0 且 ≤ 剩余可收量
- `save()` 在 `transaction.atomic` 内：
  1. `Product.objects.select_for_update().get(...)` 锁定
  2. `product.stock_quantity += quantity_received` 并 `update_fields=['stock_quantity']`
  3. 写一条 `StockLog(log_type='PURCHASE')`
  4. 写一条 `PurchaseOrderEvent('RECEIVING')`
- `post_save` 信号 `auto_update_purchase_status`：根据全订单的总收量推 `PARTIAL` / `RECEIVED`

#### CustomerPreferredProduct
- `unique_together = ('partner', 'name')`
- 用于销售单创建时提示"该客户常用型号"

#### StockLog（库存流水）
- 类型 `PURCHASE` / `PRODUCE` / `ADJUST`
- 仅作只读审计，目前无对应 API（仅 admin 可查）
- **业务约定**：成品不入库存。销售明细 = 三件半成品（外壳/板材/线材）的 BOM 配置，发货时既无成品库存可扣、也不写库存 log。库存只跟踪半成品与原材料。
  - 历史上有 `SALE` 类型，2026-05-21 与 §9.2 #10 一同移除（migration 0016）；详见 §9.4 changelog。
  - 如未来业务方向改变，需要发货扣库存，应通过新加 model 字段 / signal + 显式 PRD §3 / §4 章节同步来实现，不要悄悄 revert。

#### StockAdjustment（库存调整）
- 类型 `MANUAL_IN` / `MANUAL_OUT` / `PRODUCE_IN` / `PRODUCE_CONSUME`
  - `PRODUCE_CONSUME`（2026-05-11 BOM 改造加入）：排产单 EXECUTED 时由
    `execute_production_consumption` signal 自动写入——每条排产明细各扣
    3 条（外壳/板材/线材），允许库存变负
- `quantity` 必须 > 0；`MANUAL_OUT` / `PRODUCE_CONSUME` 在 `_delta()` 中自动取负
- `save()` 在 `transaction.atomic` + `select_for_update` 中调整库存并写 `StockLog`：
  - `MANUAL_IN` / `MANUAL_OUT` → `log_type='ADJUST'`
  - `PRODUCE_IN` / `PRODUCE_CONSUME` → `log_type='PRODUCE'`
- 仅在新建（`is_new`）时触发库存联动；编辑/删除不会回滚——**append-only 事件**，
  PATCH/PUT/DELETE 都返回 405（详见 `rules/backend-rules.md §1.5`）

#### FinancialTransaction（财务流水）
- 类型 `RECEIPT`（收款）/ `PAYMENT`（付款）/ `ADJUST`（调整）
- **关键规则**：`FinanceTransactionSerializer._normalize_amount` 在写入前对 `RECEIPT` 与 `PAYMENT` 都取 `-abs(amount)`；`ADJUST` 保持原符号。前端如果传正数 100 去做 RECEIPT，存到库的是 -100。
- `post_save` 信号 `sync_transaction_ledger`：`update_or_create` 对应 `PartnerLedgerEntry(entry_type='FINANCE')`（与 transaction 是 OneToOne）。流水删除走 OneToOne CASCADE，不需要单独信号。

#### PartnerLedgerEntry（合作方台账） — Snapshot 模式
- 类型 `SALES` / `PURCHASE` / `FINANCE` / `ADJUST` / `OPENING`
- 字段 `amount`（带符号）+ `debit_amount`（正数部分）+ `credit_amount`（负数的绝对值）
- **三个外键全部 OneToOne**：`sales_order` / `purchase_order` / `transaction` —— "一个事实，最多一行台账"。明细变化时 `update_or_create` 覆写现有条目，没有 delta 流水
- **删除即归位**：所有 OneToOne FK 都是 `on_delete=CASCADE`。删订单 → 自动删该订单的台账条目 → `Partner.balance`（property 求和）自动反映新现实
- 余额含义：正数表示"对方欠我们"。客户：`销售总额 + (RECEIPT 后变负的流水)` → 净应收；供应商：`采购总额 + (PAYMENT 后变负的流水)` → 净应付
- 详见 §9.4 changelog 2026-05-11 的台账重设计

#### ProductionOrder（排产单 / BOM 自动扣料）
- 状态机：`PLANNED`（已排产，未扣料）→ `EXECUTED`（已扣料，不可逆）/ `CANCELLED`（仅 PLANNED 可取消）
- `order_no` 自动生成 `PRD{year}-{NNNN}`，与 SO/PO 共用 `_generate_sequential_order_no` helper（`select_for_update` + 最大尾号 +1）
- `plan_date`：计划生产日期（一天可有多张排产单）
- `executed_at`：扣料完成时间，由 `execute_production_consumption` signal 自动写入
- **append-only**：EXECUTED 之后 admin 整单只读，DRF ViewSet **不挂 DestroyMixin**，错了请录反向 `StockAdjustment(MANUAL_IN)`
- 三角色均可操作（manager / warehouse / shipper），与业务侧确认

#### ProductionOrderLine（排产明细，BOM-2.0）
- 一条 = 做多少套（1 套 = 1 外壳 + 1 PCB 方案展开的原材料 + 1 线材）
- `sales_item`（可空 FK，`SET_NULL`）：可关联到某条 `SalesOrderItem`，也可空（备货性生产）
- `shell`：FK `Product` 限定 `category_type=SELF_MADE`，**PROTECT**
- `pcb_plan`：FK `PcbPlan`，**PROTECT**（防止删除被排产引用过的方案）
- `cable`：FK `Product` 限定 `category_type=CABLE`，**PROTECT**
- 创建时若 `sales_item` 非空，三件 FK 会按 sales_item 上同名字段自动回填（销售侧 `product → shell`、`pcb_plan → pcb_plan`、`cable → cable`，serializer 层处理）
- `quantity`：套数；扣料时 shell + cable 各扣 quantity 个，方案展开的每个原材料扣 `quantity × material.quantity_per_unit` 个

### 3.3 实体关系（重点）

```
Partner (1) ──── (N) SalesOrder ──── (N) SalesOrderItem ──── (N) ShippingLog
                                              │
                                              ├─ FK product (=shell):  Product[SELF_MADE] (SET_NULL)
                                              ├─ FK pcb_plan:          PcbPlan            (SET_NULL)
                                              └─ FK cable:             Product[CABLE]     (SET_NULL)

Partner (1) ──── (N) PurchaseOrder ──── (N) PurchaseOrderItem ──── (N) ReceivingLog
                                              │
                                              └─ FK: Product (PROTECT)

Partner (1) ──── (N) CustomerPreferredProduct
Partner (1) ──── (N) PartnerLedgerEntry ──── (1) FinancialTransaction (OneToOne)
                                          │
                                          ├─ (OneToOne, CASCADE) SalesOrder
                                          └─ (OneToOne, CASCADE) PurchaseOrder

Category (self-FK parent) ──── (N) Product (PROTECT) ──── (N) StockLog / StockAdjustment
  └─ category_type ∈ {RAW_MATERIAL, SELF_MADE, CABLE, FINISHED, ~BOARD~（弃用）}

PcbPlan (1) ──── (N) PcbPlanMaterial ── FK material: Product[RAW_MATERIAL] (PROTECT)

ProductionOrder (1) ──── (N) ProductionOrderLine
                                  │
                                  ├─ FK sales_item: SalesOrderItem (SET_NULL, 可空 = 备货)
                                  ├─ FK shell:    Product[SELF_MADE] (PROTECT)
                                  ├─ FK pcb_plan: PcbPlan            (PROTECT)
                                  └─ FK cable:    Product[CABLE]     (PROTECT)

SalesOrder (1) ──── (N) OrderEvent
PurchaseOrder (1) ──── (N) PurchaseOrderEvent
```

---

## 4. 业务流程与状态机

### 4.1 采购流程

1. manager 创建 `PurchaseOrder`（含 `items_payload`）
2. `sync_purchase_order_ledger` 信号写出 `total_amount` 并 `update_or_create` 该订单的唯一 `PartnerLedgerEntry(entry_type='PURCHASE', amount=current_total)` 快照
3. 仓管在 `/receiving-logs/` 提交分批入库
4. `ReceivingLog.save` 原子地：调库存、写 StockLog、写 PurchaseOrderEvent
5. `auto_update_purchase_status` 信号比较已收/应收：
   - 总收量 < 应收 → `PARTIAL`
   - 总收量 ≥ 应收 → `RECEIVED`
6. 任何角色（manager+warehouse）可在 `/purchase-orders/{id}/events/` 写 `RETURN` / `REMARK`

### 4.2 销售流程

1. manager 创建 `SalesOrder`（含 `items_payload`）
2. `sync_sales_order_ledger` 信号写出 `total_amount` 并 `update_or_create` 该订单的唯一 `PartnerLedgerEntry(entry_type='SALES', amount=current_total)` 快照
3. shipper（或 manager）在 `/shipping-logs/` 录入分批发货
4. `ShippingLog.save` 写 `OrderEvent('SHIPPING')`，**不动库存**
5. `auto_complete_sales_order` 信号：所有 item 都 `shipped_quantity ≥ quantity` → `COMPLETED`，否则 → `SHIPPED`
6. shipper 也可以通过 `PATCH /sales-orders/{id}/status/` 手动推进，规则：仅允许"前进一档"（`ORDERED→PRODUCING`、`PRODUCING→SHIPPED`、`SHIPPED→COMPLETED`），**不允许跳跃或回退**
7. 注意手动 PATCH 的"仅前进一档"规则与发货信号的"跳到 COMPLETED/SHIPPED"行为是两条独立路径，前端应优先依赖发货侧自动推进，避免与手动 PATCH 互相覆盖

### 4.3 库存调整流程

1. manager 或 warehouse 在 `/stock-adjustments/` POST
2. 序列化器校验 `quantity > 0`
3. `StockAdjustment.save` 原子地调库存并写 `StockLog`
4. 没有"删除调整"或"修改调整"的回滚逻辑——视作不可变事件

### 4.4 财务与对账

> 说明：自 migration 0013 起，订单上的 `paid_amount` 字段被废弃。"应付/应收"是**合作方层级**的概念，唯一可信来源是 `Partner.balance`（= 该合作方所有 `PartnerLedgerEntry.amount` 之和）。单据级别的"已结清/未结清"不再保留，因为财务流水本身就是合作方层级，无法关联到具体订单。

1. manager 在 `/finance/transactions/` POST 一笔流水：
   - `RECEIPT` / `PAYMENT`：序列化器把 amount 转为 `-abs(amount)`
   - `ADJUST`：保留原符号
2. `sync_transaction_ledger` 信号 `update_or_create` 一条 `FINANCE` 台账（与 transaction 是 OneToOne，最多一条）
3. `Partner.balance` 是 property，求和当前所有 ledger 条目即为最新余额（不需要 signal 维护冗余字段）
4. manager 用 `/finance/partners/?type=receivable|payable` 看汇总；用 `/finance/partners/{id}/?type=...` 看详情；用 `/finance/partners/{id}/ledger-export/` 拉 CSV
5. 销售单 / 采购单 / 流水 在台账中用统一的 (debit_amount, credit_amount, amount) 三元组呈现，导出 CSV 时也按同一格式
6. 汇总接口字段名 `balance`（2026-05-21 起；之前叫 `outstanding_amount`）直接来源于 `Partner.balance`。详情接口只返回 `balance`，旧兼容字段 `outstanding_amount` 已移除——见 §9.4 changelog 2026-05-21 §9.2 #14。

### 4.5 BOM 排产与自动扣料（BOM-2.0）

> BOM-2.0（2026-05-21）核心：销售明细 = 外壳半成品 + PCB 方案 + 线材半成品三件组合。
> **方案 = 一种 PCB 板的物料配方**，由外包加工商按方案领料贴片送回。
> 系统**不跟踪"中间板材"库存**——排产 EXECUTED 时一次性扣减：1 外壳 + 1 线材 + N 原材料。

物理流程：
- **外壳 / 线材**：自家工坊每天生产，仓管录 `StockAdjustment(MANUAL_IN)` 入库
- **PCB 板**：外包加工商领料贴片，板子回来直接装配——叫加工商领料 + 送回板子 + 上装配线 **三步合并到一个"排产 EXECUTED"动作**

完整流程：

1. **维护方案表**（manager）：在 PCB 方案面板创建/编辑 `PcbPlan`，包含 N 条 `PcbPlanMaterial`（每条 = 一种 RAW_MATERIAL 物料 + 单板用量）。下架旧方案用 `is_active=False`，历史订单引用仍保留。
2. **录入物料库存**（warehouse）：
   - 外壳 / 线材半成品：`StockAdjustment(MANUAL_IN)` 录入
   - 原材料（裸板 / 芯片 / 电容 / 电阻 ...）：同样 `MANUAL_IN` 录入
3. **创建销售单**（manager）：每条明细必须挂三件——外壳 + PCB 方案 + 线材（serializer 校验，方案必须 `is_active=True`）。此时**只记账，不扣料**。
4. **每天排产**（三角色任一）：在排产中心新建 `ProductionOrder(status=PLANNED)`，每条 `ProductionOrderLine`：
   - **关联销售单**：选某个 `SalesOrderItem`，三件（shell / pcb_plan / cable）自动回填
   - **备货**：`sales_item=null`，直接挑三件 + 数量
5. **触发扣料**（三角色任一）：点"扣料"按钮 → `POST /production-orders/{id}/execute/` → 状态 PLANNED → EXECUTED：
   - `execute_production_consumption` signal（pre_save 钩子辅助）对每条 line 写 **(2 + N) 条** `StockAdjustment(PRODUCE_CONSUME)`：
     - 1 条扣 shell（`line.quantity` 个）
     - 1 条扣 cable（`line.quantity` 个）
     - N 条扣 `pcb_plan.materials` 展开的原材料（每条数量 = `line.quantity × material.quantity_per_unit`）
   - `executed_at` 自动设置
   - **幂等保护**：再次 save 时 pre_save 钩子检测到 `_previous_status == 'EXECUTED'` 直接跳过，不重复扣料
   - **允许库存变负**：半成品 / 原材料补货节奏与排产解耦（"先排再补料"是常态）
6. **撤销已扣料**（不允许）：排产单一旦 EXECUTED 就不可逆。要"退料"必须由 warehouse 录入反向的 `StockAdjustment(MANUAL_IN)`——与 §3.2 StockAdjustment 的 append-only 原则一致
7. **取消**：仅 `PLANNED` 状态可调 `POST /production-orders/{id}/cancel/`，状态切到 `CANCELLED`，不触发任何库存动作

**业务侧约定**（外包加工商）：几乎不存在丢料/废料（拿 N 件料回 N 块板），所以系统不专门跟踪"加工商领料"与"板子回收"两个时间点；如有损耗通过事后 `StockAdjustment` 调整。

---

## 5. API 概览

### 5.1 鉴权

- 框架：`djangorestframework-simplejwt`（access token 8 小时）
- `POST /api/token/`：`{username, password}` → `{access, refresh}`
- `POST /api/token/refresh/`：`{refresh}` → `{access}`
- 全局默认 `IsAuthenticated`，分页类 `PageNumberPagination`，`PAGE_SIZE=20`，过滤后端 `DjangoFilterBackend + OrderingFilter`

### 5.1.1 健康检查

- `GET /health/`：返回 `{"status": "ok"}` 200；`AllowAny` + `authentication_classes=[]`，**无需鉴权**
- 路径放在顶层（**不**走 `/api/` 前缀），方便反代统一探活规则
- 不做数据库探活——DB 探活由 `python manage.py check --database default` 单独跑，避免 health 端点引入二级依赖（详见 `rules/deployment-rules.md §6`）

### 5.2 主数据（`/api/core/`）

| 路径 | 方法 | 说明 |
|---|---|---|
| `products/` | GET | manager / warehouse 可读；返回 `category_detail` 嵌套（shipper 不消费此接口，前端 `useProducts` 已按角色 gating） |
| `products/` | POST | manager / warehouse 创建 |
| `categories/` | GET | manager / warehouse 可读（同 products 口径） |
| `categories/` | POST | manager / warehouse 创建 |
| `partners/` | GET / POST | manager only |
| `pcb-plans/` | LIST / CREATE / RETRIEVE / UPDATE / DESTROY | manager only。`is_active` / `name` / `code` 过滤。nested `materials` 写入；update 时**全量替换 materials** |
| `me/` | GET | 当前用户 + 角色列表（`groups` 名称） |

### 5.3 业务（`/api/business/`）

| 路径 | 方法 | 主要查询参数 |
|---|---|---|
| `purchase-orders/` | CRUD | `status`、`partner`、`order_no`（icontains）、`created_from`、`created_to`、`ordering`、`page` |
| `purchase-orders/{id}/events/` | GET/POST | — |
| `sales-orders/` | CRUD | `status`、`partner`、`order_no`、`partner_name`、`created_from/to`、`ordering` |
| `sales-orders/{id}/events/` | GET/POST | — |
| `sales-orders/{id}/status/` | PATCH | `{status: ...}`，仅前进一档 |
| `customer-preferred-products/` | LIST/CREATE/DELETE | `partner=<id>`、`search=<name>` |
| `receiving-logs/` | LIST/CREATE | `purchase_order`、`operator`（icontains）、`received_from/to`、`ordering` |
| `shipping-logs/` | LIST/CREATE | `sales_order`、`partner`、`partner_name`、`operator`、`shipped_from/to`、`ordering` |
| `stock-adjustments/` | LIST/CREATE/RETRIEVE | `product`、`adjustment_type`、`operator`、`note`、`created_from/to`、`ordering`；**PATCH/PUT/DELETE = 405** |
| `production-orders/` | LIST/CREATE | `status`、`plan_date`、`plan_date_from/to`、`order_no`、`ordering`、`page` |
| `production-orders/{id}/` | GET/PATCH | PATCH 仅在 `PLANNED` 状态有效；EXECUTED/CANCELLED 后 400 拒绝 |
| `production-orders/{id}/execute/` | POST | 触发扣料：PLANNED → EXECUTED；signal 自动写 3N 条 PRODUCE_CONSUME |
| `production-orders/{id}/cancel/` | POST | 仅 PLANNED → CANCELLED |
| `finance/transactions/` | LIST/CREATE/UPDATE/DESTROY | `partner`、`transaction_type`、`note`、`created_from/to`、`ordering` |
| `finance/partners/` | GET | `type=receivable\|payable`（默认 receivable）、`search`、`created_from/to`、`ordering`（默认 `-balance`，接受 `outstanding/-outstanding` 兼容别名）；分页响应包含 `total_balance` |
| `finance/partners/{id}/` | GET | 同上 + `order_status`、`order_from/to`、`order_ordering`、`transaction_from/to`、`transaction_ordering`、`ledger_from/to`、`ledger_page`、`ledger_page_size` |
| `finance/partners/{id}/ledger-export/` | GET | 上述参数 + `summary=1\|true`、`year`，返回带 BOM 的 UTF-8 CSV |

### 5.4 响应约定

- 列表默认分页：`{count, next, previous, results}`；`finance/partners/` 把汇总放进 `results: {type, total_outstanding, partners: [...]}`，前端解构时需要注意一层嵌套
- 错误响应：`{detail: "..."}` 或 `{field: ["..."]}`；状态转换失败为 `{detail: '非法的状态转换'}` 400
- CSV 导出：`Content-Type: text/csv; charset=utf-8-sig`，含 BOM，便于 Excel 直接打开

---

## 6. 业务规则与不变量

代码层强制（违反就会抛错或被信号纠正）：

1. `Product.internal_code` 唯一
2. `Category.protect`：分类下有产品禁止删除
3. `Partner.balance` 是只读 property，自动等于 `Sum(partner.ledger_entries.amount)`，无法手动写
4. 采购单 `total_amount` = Σ(item.price × item.quantity)，由信号保证
5. 销售单同上
6. 入库不能超过 `PurchaseOrderItem.quantity - 已收`
7. 发货不能超过 `SalesOrderItem.quantity - 已发`
8. 编辑订单明细时，新数量不能小于已收/已发
9. 销售单状态在 PATCH 接口下只能前进一档
10. 收货操作必须是原子事务（库存+流水+事件三者不分割）
11. 库存调整数量必须 > 0；类型决定符号
12. 财务流水 `RECEIPT` / `PAYMENT` 入库前 amount 强制取负
13. 金额脱敏：非 manager 在 `MonetaryMaskMixin.monetary_fields` 上看到 `null`
14. 角色检查 `superuser` 始终通过
15. 销售明细新建时三件（shell + pcb_plan + cable）必须齐备（BOM-2.0 起 serializer 校验）；`pcb_plan` 必须 `is_active=True`
16. 排产单 EXECUTED 后**不可逆**：admin 只读、ViewSet 拒绝 DESTROY、再 save 由 pre_save 钩子识别状态未变化跳过扣料；要"退料"必须录反向 StockAdjustment
17. 排产扣料**允许库存变负**——半成品 / 原材料补货节奏与排产解耦，本系统只记账不阻止排产
18. PCB 方案明细的 `material` 必须是 `category_type=RAW_MATERIAL` 类型（serializer 校验 + model `limit_choices_to`）
19. 排产 EXECUTED 时每条 line 写 **(2 + N) 条** `StockAdjustment(PRODUCE_CONSUME)`：1 条 shell + 1 条 cable + N 条 plan 展开的原材料（N = plan.materials.count）

---

## 7. 前端（事实版）

> 基于 `frontend/src/` 实际代码（2026-05-11 精读）重写。

### 7.1 技术栈

React 18 + TypeScript 5 + Vite 5 + Tailwind 3。无路由库（用 URL `?panel=` + `localStorage` 自实现）；无状态管理库；只有 `AuthContext` 一个全局 context。`npm run build` 仅跑 `vite build`，**不跑 `tsc --noEmit`**。

### 7.2 入口与路由

- `main.tsx` → `<AuthProvider><App /></AuthProvider>`
- `App.tsx` 负责：登录门、用户加载态、角色过滤后的导航、面板分发
- 面板键：`inventory` / `sales` / `purchase` / `shipping` / `receiving` / `partners` / `selfMadeGallery` / `financeDetail`（共 8 个；总数 9 含 LoginForm）
- `panelConfig`（`types.ts`）声明每个面板的标题、描述与 `roles`，`App` 据此过滤生成 `allowedPanels`，并把当前面板写回 URL & localStorage（key `mfs-active-panel`）

### 7.3 鉴权（`context/AuthContext.tsx`）

- `accessToken` / `refreshToken` 都持久化在 `localStorage`（key `mfs_access_token` / `mfs_refresh_token`）
- 登录：`api.login(...)` → 存 token → `api.getCurrentUser()` → 解析 roles
- 用户加载失败任意原因都会触发完整登出
- **缺陷**：`api.refresh` 已实现但 AuthContext 从未调用——8h 后用户被 401 强制踢出（见 §9）

### 7.4 数据获取（`hooks/use*.ts`）

每个 hook 都遵循 `{ data, loading, error, reload }` 四件套：

| Hook | 后端端点 | 备注 |
|---|---|---|
| `useProducts` | `GET /api/core/products/` | 兼容分页/扁平响应（只取 `results` 数组） |
| `useCategories` | `GET /api/core/categories/` | 同上 |
| `usePartners` | `GET /api/core/partners/` | 同上；`balance` 强制 `Number()`；**所有角色都触发，warehouse/shipper 会 403** |
| `useSalesOrders` | `GET /api/business/sales-orders/` | 归一化金额与已发量；**仍有 `paid_amount` 残留**（见 §9） |
| `usePurchaseOrders` | `GET /api/business/purchase-orders/` | 归一化金额与已收量 |
| `useShippingLogs` | `GET /api/business/shipping-logs/` | 处理 partner_id/partner_name 回退 |
| `useFinanceTransactions` | `GET /api/business/finance/transactions/` | 类型缺省值 `'RECEIPT'` |
| `useCustomerPreferredProducts` | `GET /api/business/customer-preferred-products/?partner=<id>` | 按 partnerId gating |
| `usePartnerSearch` | （纯客户端）| 把 partner 列表过滤为 datalist 建议 + 解析 `#ID` |
| `usePaginatedFilter` | （纯客户端）| 通用本地分页+筛选，pageSize 默认 30 |

**统一缺陷**：所有列表 hook 都不传 query string 给后端、也不读 `count / next / previous`——后端 FilterSet / 分页能力前端从未使用，超过 20 条的数据看不到。

### 7.5 共用组件（`components/common/`）

`FilterBar` + `FilterBar.Field`、`NavbarButton`（深色主操作 / 描边辅助）、`Modal`、`Pagination`、`PartnerSelect`、`StatusBadge`（带 `kind="sales|purchase"`）、`OrderDetailsView`、`OrderItemsEditor`、`PriceTag`、`BaseInput`。

`PartnerSelect` 是合作方输入的**唯一入口**，会用 `usePartnerSearch` 内部解析 `#ID` 与名称匹配。

### 7.6 面板与后端的能力对账

| 面板 | 前端 roles | 后端可访问角色 | 复用 hooks |
|---|---|---|---|
| `inventory` | manager / warehouse | 一致 | `useProducts` + `useCategories` + 内联调用 `api.createStockAdjustment` |
| `sales` | manager | manager + shipper（后端松） | `useSalesOrders` + `useCustomerPreferredProducts` |
| `purchase` | manager | manager + warehouse（后端松） | `usePurchaseOrders` + `usePartners` |
| `shipping` | manager / shipper | 一致 | `useSalesOrders` + `useShippingLogs` |
| `receiving` | manager / warehouse | 一致 | `usePurchaseOrders` + `usePartners` |
| `partners` | manager | 一致 | `usePartners` + `usePaginatedFilter` |
| `selfMadeGallery` | manager / warehouse | 一致 | `useProducts` + `useCategories` |
| `financeDetail` | manager | 一致 | `useFinanceTransactions` + `usePartners` |

> sales / purchase 前端比后端紧——shipper 通过 `ShippingPanel` 可以间接看到销售单数据；warehouse 通过 `WarehouseReceivingPanel` 可以间接看到采购单数据。是设计选择不是 bug，但**需要在 PRD 里明文说**以免误以为是权限漏洞。

### 7.7 与后端契约的硬约束（前端必须遵守）

逐条对应后端代码：

1. 非 manager 拿到的金额字段是 `null`（`MonetaryMaskMixin`）；前端必须把 `null` 渲染为 `-` 或隐藏，**禁止 `Number(null) = 0`**
2. 销售单状态推进只能前进一档（`SalesOrderViewSet.status._is_valid_transition`）；推状态用 `api.updateSalesOrderStatus`，**禁止用通用 PATCH 改 status**
3. 订单明细数量不可改小于已发/已收（serializer `update` 校验）
4. 发货/收货数量不能超过剩余量
5. 合作方 4 类：客户筛选含 `CUSTOMER`+`BOTH`，供应商筛选含 `SUPPLIER`+`BOTH`；`SELF` 不应出现在销售/采购下拉
6. `paid_amount` 已废弃；单据级"未结金额"不存在；唯一可信来源是 `Partner.balance`
7. `FinancialTransaction` 的 `RECEIPT`/`PAYMENT` 在后端被取负——前端传 `Math.abs(amount)`，显示时根据 `transaction_type` 决定是否再 `Math.abs`

---

## 8. 非功能需求

- **安全**
  - JWT access 8h；前端续期通过 `/api/token/refresh/`
  - 角色绑定 Django Group，`superuser` 默认 = manager，部署时务必收敛
  - 财务接口仅 manager；金额脱敏靠 `MonetaryMaskMixin`，新增金额字段时必须显式登记
- **数据完整性**
  - 涉及库存或财务的写入路径必须 `transaction.atomic`，并对热点行 `select_for_update`（参见 ReceivingLog / StockAdjustment）
  - 信号链不允许在非托管事务里写副作用——避免脏数据
- **可观测性**（当前缺位，见第 9 节）
  - 业务关键事件目前没有结构化日志；`logging` 默认配置
- **性能**
  - 列表页面默认分页 20，前端再叠加 `?page_size=`（但代码未显式声明 page_size 参数读取，靠 DRF 默认行为）
  - ViewSet 的 `get_queryset` 全部做了 `select_related` / `prefetch_related`

---

## 9. 已知风险与待办

按"必须修"→"建议修"→"未来"的顺序：

### 9.1 必须修（真实功能 bug 或破坏性不一致）

> ✅ 当前已全部清零。所有曾在此节登记的 9 条必修条目（#1 products/categories 权限、#2 StockAdjustment 不可逆、#3 客户筛选漏 BOTH、#4 供应商筛选纳 SELF、#5 paid_amount 残留、#6 hook 分页范式、#7 token 续期、#8 createPurchaseOrder 类型契约、#9 usePartners 静默 403）均在 2026-05-11 完成，详见 §9.4 changelog。

### 9.2 建议修

> 编号沿用历史值（已修条目保留序号 + ✅ 标注），方便追溯。

10. ✅ 已修（2026-05-21）——业务侧明确"成品不入库存"，`StockLog.SALE` 枚举从未被任何路径写入，属于历史包袱。`business/models.py` 去掉 SALE choice + migration `0016_remove_stocklog_sale_choice`。详见 §3.2 StockLog 章节与 §9.4 changelog。
11. ✅ 已修（2026-05-21）——前端 `FinanceDetailPanel` 已按 `transaction_type` 字段区分收款/付款（`isAdjust = txn.transaction_type === 'ADJUST'`、显示前 `Math.abs(amount)`、label 走 `TRANSACTION_TYPE_LABELS[type]`）。本条仅作为验证登记关闭。
12. 单号生成、时区、分页默认值都散落在多处，应集中到 `business/api/constants.py`。
13. ✅ 已修（2026-05-21）——加了 `GET /health/` 轻量端点，详见 §9.4 changelog。
14. ✅ 已修（2026-05-21）——前端零引用确认后，`FinancePartnerSummarySerializer` 字段 `outstanding_amount` 改名为 `balance`；`FinancePartnerDetailSerializer` 直接删除 `outstanding_amount` 字段（保留唯一来源 `balance`）；汇总响应顶层 `total_outstanding` → `total_balance`；ordering 默认 `-balance`，保留 `outstanding/-outstanding` 别名以防外部 API 调用方仍在用。回归测试同步。详见 §9.4 changelog。
15. ✅ 已修（2026-05-21）——`@types/react` + `@types/react-dom` 加入 devDeps；装上后原本 2188 个 TS 错误骤降到 10 个（其余 1991 个本质上都是 @types 缺失导致的连锁推断失败）。剩下 10 个全部修完（vite env 引用、PartnerSelect.label optional、items_payload BOM 三件齐备、handleCreate 可选事件、Pagination 去掉不存在的 prop）。`tsc --noEmit` 现在通过。详见 §9.4 changelog。
16. ✅ 已修（2026-05-21）——`PriceTag.tsx` 与 `OrderDetailsView.tsx` 重写为 `formatMoney(value)` 统一处理 `null/undefined/''/NaN`，全部渲染为 `-` 占位；不再用 `Number(value).toFixed(2)`。详见 §9.4 changelog 与 `rules/frontend-rules.md §2.1`。
17. ✅ 已修（2026-05-21）——`package.json` 的 `build` 改为 `tsc --noEmit && vite build`；同时新增 `npm run typecheck` 独立脚本，CI / 本地随时能跑。
18. ✅ 已确认（2026-05-21）——`panelConfig.sales` / `panelConfig.purchase` 前端比后端紧（manager-only）是**设计选择**：shipper 通过 `ShippingPanel` 间接消费销售数据，warehouse 通过 `WarehouseReceivingPanel` 间接消费采购数据。这不是权限漏洞。PRD §7.6 已经写明，本条无需代码改动，作为登记关闭。
19. ✅ 已修（2026-05-21）——`SalesOrdersPanel` 编辑路径的 PATCH payload 不再带 status，且 `form.status` 死代码一并清掉。详见 §9.4 changelog。
20. ✅ 已修（之前批次顺手修）——前端 `usePartners.ts` 的 `PartnerType` 字面量已经包含 `'SELF'`；2026-05-21 同步本节登记。

### 9.3 未来

21. 企业微信登录 / 通知接入：现在仅 `core/signals.py` 留了占位 `initialize_partner_logic`。
22. `PartnerLedgerEntry` 的 `OPENING`（期初余额）类型在代码中未被任何路径写入，是为人工导入预留的接口。
23. `media/` 当前由 Django 在 DEBUG 下直发，生产部署需走 nginx/CDN（见 `deployment-rules.md`）。
24. `scripts/seed_mock_data.py` 中 `FINANCE_TRANSACTIONS` spec 用 `.objects.create` 绕过序列化器，amount 不会被 `_normalize_amount` 规范化；部分条目（如"海外客户B PAYMENT -18000"）的符号与生产语义不一致——客户回款语义上是 RECEIPT，不是 PAYMENT。这是种子数据 spec 笔误，不是 schema bug。建议把 spec 改成符合 RECEIPT/PAYMENT 一律取负的约定，或者让 seed 也走序列化器。

### 9.4 Changelog（已修）

- **2026-05-21**：**BOM-2.0 PCB 方案改造**。把板材从"半成品 FK"重构为"PCB 方案 = 原材料配方"，
  排产 EXECUTED 时一次性扣减 1 外壳 + 1 线材 + N 原材料（方案展开）。系统从此不再
  跟踪"中间板材"库存，与实际工厂流程对齐（外包加工商按方案领料贴片送回 + 装配 = 一个原子动作）。
  - **新增主数据**：`core.PcbPlan`（方案主表）+ `core.PcbPlanMaterial`（明细，N:1）。
    materials 限定 `material.category.category_type == 'RAW_MATERIAL'`（serializer + model 双层校验）。
    `is_active` 软删除——下架后不可被新销售/排产明细选中，但保留历史引用。
  - **schema 变更**：
    - `SalesOrderItem.board: FK Product[BOARD]` → `pcb_plan: FK PcbPlan (SET_NULL, is_active=True)`
    - `ProductionOrderLine.board: FK Product[BOARD]` → `pcb_plan: FK PcbPlan (PROTECT)`
    - `Category.BOARD` choice 保留但标弃用（不删 choice 避免冲击 migration 0004/0015）
    - 历史 `ProductionOrder` / `ProductionOrderLine` 数据：migration 0017 直接清空（开发期测试数据，业务上未真正使用 BOM-1.0 排产）
  - **信号改写**：`execute_production_consumption` 每条 line 写 **(2 + N) 条** PRODUCE_CONSUME：
    1 条扣 shell（line.quantity）+ 1 条扣 cable（line.quantity）+ N 条扣 plan.materials
    （每条 line.quantity × material.quantity_per_unit）。`prefetch_related('lines__pcb_plan__materials__material')`
    避免 N+1。幂等保护沿用 pre_save 钩子读 DB 真值。
  - **后端 API**：`POST/GET/PATCH/DELETE /api/core/pcb-plans/`（manager only），nested materials
    创建 / 全量替换。`SalesOrderItemSerializer` 改成接 pcb_plan + 校验
    `pcb_plan.is_active`。`ProductionOrderLineSerializer` 改成自动从 sales_item 回填
    `pcb_plan`。`SalesOrderViewSet` + `ProductionOrderViewSet` 都 prefetch 方案+materials 链路。
  - **后端测试**：`BOMProductionOrderTest` 改写——扣料 = (2 + 3) 条、原材料数量正确、
    幂等保护、允许库存负数；新增 `PcbPlanAPITest`——CRUD 权限 + RAW_MATERIAL 校验 +
    quantity > 0 + 全量替换 + 下架方案不可被新订单选中。
  - **前端**：
    - 新增 `usePcbPlans` hook（按 listHookHelpers 范式）
    - `OrderItemsEditor` 销售模式第二个下拉从"板材物料"换为"PCB 方案"，含展开预览（"扣料：芯片 ×1、电容 ×5、裸板 ×1"）
    - `SalesOrdersPanel` + `ProductionPanel` form state 与 payload key `board` 全部改 `pcb_plan`/`pcbPlan`
    - 新建 `PcbPlanPanel`（manager only）：CRUD + 启用/下架 + 物料配方逐行编辑
    - `types.ts` 加 `panelConfig.pcbPlans`
    - `api/client.ts`：`SalesOrderItemPayload.board` → `pcb_plan`，`ProductionOrder.createLine.board` → `pcb_plan`，新增 `PcbPlansQueryParams` + 5 个方案 CRUD 方法
  - **文档**：本节、§3.1 Category（BOARD 标弃用）、§3.2 SalesOrderItem / ProductionOrderLine
    + 新增 PcbPlan/PcbPlanMaterial、§3.3 ER 图、§4.5 BOM 流程、§5 API 表、§6 不变量
    新增 #18 #19、§2.2 权限矩阵加 pcb-plans 行。
  - **验证**：沙箱 `tsc --noEmit` 通过；Python AST 全部 OK；用户本机需跑
    `python manage.py migrate` + `python manage.py test` 全量回归。
- **2026-05-21**：**§9.2 #10 删 StockLog.SALE 枚举**。业务侧确认现行模型——
  成品不入库存（销售明细只是三件半成品 BOM 配置，发货既无成品库存可扣、
  也不需要 SALE log）。`SALE` 枚举从未被任何业务路径写入过（grep 确认零引用），
  纯历史包袱。改动：`business/models.py: StockLog.LOG_TYPES` 删 `('SALE', '销售出库')`
  + 新 migration `0016_remove_stocklog_sale_choice`（仅改 choices 元数据，DB 列
  本身是 CharField，原数据不受影响——本地 db.sqlite3 也确认无 SALE 行）。PRD §3.2
  StockLog 章节同步：明确"成品不入库存"约定，并标注如未来业务方向变更应通过新
  增 model + signal + PRD 同步来实现，不要 silent revert。
- **2026-05-21**：**§9.2 第三批清理：#11 / #14 / #18**。
  - **#11**：前端 `FinanceDetailPanel` 已经按 `transaction_type` 字段做 UI 区分
    （`isAdjust = txn.transaction_type === 'ADJUST'` / `Math.abs(amount)` 仅
    对 RECEIPT/PAYMENT 应用 / 显示 label 走 `TRANSACTION_TYPE_LABELS[type]`），
    无需代码改动，仅作验证登记关闭。
  - **#14 outstanding_amount 兼容字段移除**：grep 确认前端
    （`frontend/src/`）零引用 `outstanding_amount` / `total_outstanding`。
    清理：
    1. `FinancePartnerSummarySerializer`：字段 `outstanding_amount` 重命名为
       `balance`，类型不变。
    2. `FinancePartnerDetailSerializer`：删除 `outstanding_amount` 字段
       （`balance` 此前已并列存在，是唯一可信来源）。
    3. `FinancePartnerSummaryView`：响应顶层 `total_outstanding` → `total_balance`；
       summary_data 行键改为 `balance`；ordering 默认从 `-outstanding` → `-balance`，
       同时保留 `outstanding / -outstanding` 作为**向后兼容别名**（万一有外部
       API 调用方仍按旧名传 ordering，不至于 silently 500）。
    4. `FinancePartnerDetailView.detail_data`：去掉 `outstanding_amount` 键。
    5. `test_finance_summary_uses_partner_balance`：断言改为 `target['balance']`
       并新增 `assertNotIn('outstanding_amount', target)` 防回归。
    6. PRD §4.4 #6、§5.3 `finance/partners/` 行同步更新。
  - **#18 doc-only 关闭**：`panelConfig.sales` / `panelConfig.purchase`
    前端比后端紧是设计选择（PRD §7.6 已说明），不是权限漏洞。本条仅作
    登记关闭，无代码改动。
- **2026-05-21**：**§9.2 TypeScript 健康度全面修复（#15 / #16 / #17）**。
  - **根因**：`devDependencies` 缺 `@types/react` 与 `@types/react-dom` →
    `tsc --noEmit` 在 strict 模式下产生 2188 个错误，其中 ~91%（1991 个）
    都是同一根因的连锁失败：TS7026（JSX intrinsic any）+ TS7016
    （no declaration file）+ TS2503（cannot find namespace 'React'）。
    剩余 ~10% 的 implicit any / 类型不匹配也都依赖 React 类型才能稳定推断。
  - **#15 装包 + 残余真 bug 收尾**：`package.json` devDeps 加
    `@types/react ^18.3.3` / `@types/react-dom ^18.3.0`。装上后剩 10 个
    真错误，全部修完：
    1. `src/vite-env.d.ts` 新建，加 `/// <reference types="vite/client" />`
       让 `import.meta.env` 有正确类型（修 4 处 TS2339）；
    2. `PartnerSelect.tsx` 的 `label` 改 optional，并在内部条件渲染
       （FilterBar.Field 已在外层渲染过 label，避免双层 label，修 2 处 TS2741）；
    3. `api/client.ts` 抽出 `SalesOrderItemPayload` 类型并补齐 BOM 三件
       字段（shell `product` + `board` + `cable`），同时把
       `custom_product_name` / `detail_description` 改 optional 匹配表单 draft
       的实际形状（修 2 处 TS2322）；
    4. `PartnerManagementPanel.handleCreate` 的 `e` 参数改 optional，匹配
       `PartnerHeader.Props.onSubmit: () => void` 的零参签名（修 1 处 TS2322）；
    5. `SelfMadeGalleryPanel` 给 `Pagination` 传的 `pageSizeText` 是不存在
       的 prop，直接删掉（修 1 处 TS2322）。
  - **#16 金额 null 防护**：`PriceTag.tsx` 与 `OrderDetailsView.tsx` 全面
    重写。新加 `formatMoney(value: unknown, fallback = '-'): string` helper：
    `null` / `undefined` / `''` / `NaN` 一律渲染 `-` 占位，禁止
    `Number(null) = 0` 的静默失败。明细页"小计"也保护：单价为 null 时
    小计也展示 `-`，不算成 0 × quantity。锚定后端
    `MonetaryMaskMixin` 的脱敏契约（非 manager 看金额是 `null`，前端
    必须正确处理）。
  - **#17 build 接 tsc 把关**：`package.json` 加 `typecheck: tsc --noEmit`
    脚本（独立可跑）；默认 `build` 改为 `tsc --noEmit && vite build`，
    TS 错误立刻挡 build。
  - **验证**：沙箱 `npm run typecheck` exit 0（沙箱 vite build 因 rollup
    native binary 不兼容跑不通，与代码无关，本机正常）。
- **2026-05-21**：**§9.2 quick-wins 一批清掉 #13 / #19 / #20**。
  - **#13 `/health/` 端点**：新增 `core.views.HealthCheckView`（`AllowAny` +
    `authentication_classes = []`，无需鉴权也不读 JWT），路由挂在顶层
    `path('health/', ...)`（**不**放 `/api/` 下，方便反代统一探活）。返回
    `{"status": "ok"}` 200；不做 DB 探活（DB 探活由
    `python manage.py check --database default` 单独跑，避免 health 端点
    把数据库摔挂的二次故障映射成 5xx）。新增 `HealthCheckTest` 两条回归：
    (a) 未鉴权也 200；(b) 带错误 token 也 200。`rules/deployment-rules.md §6`
    与 `backend/docs/api.md` 一并更新。
  - **#19 SalesOrdersPanel 编辑不传 status**：原 `handleSubmit` 把
    `status: form.status` 塞进通用 PATCH，会绕开 `/sales-orders/{id}/status/`
    的状态机校验（仅前进一档）。改造：(a) 创建分支只传 `partner +
    items_payload`，后端默认 `ORDERED`；(b) 编辑分支只传 `partner +
    items_payload`；(c) `form` state 中的 `status` 字段一并删除（此前在
    `openCreate` / `openEdit` 中赋值但读取路径已被切断，是死代码）。
    `rules/frontend-rules.md §2.2` 已经覆盖了"状态推进只能用
    `updateSalesOrderStatus`"这条硬约束，本次实现与其对齐。
  - **#20 PartnerType 'SELF'**：前置批次已经把 `usePartners.ts` 的
    `PartnerType` 字面量补全为 `'CUSTOMER' | 'SUPPLIER' | 'BOTH' | 'SELF'`，
    本次只是把 §9.2 这条登记关掉。
- **2026-05-11**：订单号生成抽到共享 helper `_generate_sequential_order_no`，销售/采购走同一份 `select_for_update + 取最大尾号 +1` 算法；`SalesOrderSerializer.create` 包入 `transaction.atomic()`，让锁真正生效。修复了"并发创建撞 unique 约束"和"删中间单后再创建撞 unique 约束"两类故障。
- **2026-05-11**：废弃 `SalesOrder.paid_amount` 与 `PurchaseOrder.paid_amount`（migration 0013）。应付/应收唯一来源是 `Partner.balance` + `PartnerLedgerEntry`。`FinancePartnerSummaryView`、`FinancePartnerDetailView`、`FinanceOrderSerializer`、`FinancePurchaseOrderSerializer` 同步改造。前端会丢字段——下一轮一并对齐。
- **2026-05-11**：完成 frontend 全量精读。§7 改写为基于实际代码的事实描述（panel/hook/组件对账表）。§9.1 加入 7 条前端相关的"必须修"问题（客户筛选漏 BOTH、供应商筛选误纳 SELF、paid_amount 残留、分页能力未用、token 不续期、`createPurchaseOrder` 类型契约破裂、`usePartners` 对非 manager 静默 403）。`rules/frontend-rules.md` 从占位版升级到字段级对账版。
- **2026-05-11**：清理 `paid_amount` 在前端的全部残留。删除 `frontend/src/hooks/useSalesOrders.ts` 中 `SalesOrderResponse.paid_amount` 字段与归一化器中 `paid_amount: Number(order.paid_amount ?? 0)` 一行；删除 `frontend/src/types.ts` 中 `OrderSummary` 与 `PurchaseOrderSummary` 两个接口（均只被死代码引用）；物理删除 `frontend/src/components/OrderTable.tsx` 与 `frontend/src/components/SummaryCards.tsx` 两个死代码文件。剩余死代码（`FinanceList.tsx` + `FinanceTransactionListItem` + `ShippingLogSummary`）与 paid_amount 无关，留到下次清理（已记入 §9.2 #20）。`tsc --noEmit` 验证本次改动未引入残留错误（项目固有的 `@types/react` 缺失错误是已知问题 §9.2 #16）。
- **2026-05-11**：业务侧二次澄清——shipper **不**负责库存管理，仅处理销售订单发货；shipper 也不消费 `/api/core/products/` 与 `/api/core/categories/` 接口（前端 ShippingPanel 及其子组件均未引用 `productsQuery` / `categoriesQuery`）。据此走路径 B 收紧权限：`ProductListView` 与 `CategoryListView` 的 `permission_classes` 改为 `[IsManagerOrWarehouse]`（GET 和 POST 同口径，去掉了原先按方法分支的 `get_permissions` override，view 更直白）；前端 `App.tsx` 同步给 `useProducts` / `useCategories` 加 `(isManager || isWarehouse)` gating，避免 shipper 触发 403。`backend-rules.md` §5 中关于"主数据 GET 可对所有登录用户开放"的例外条款也一并移除——本项目目前没有真正符合该例外的端点。
- **2026-05-11**：删除 `cleanup_sales_order` 和 `cleanup_purchase_order` 两个 buggy 的 `post_delete` 信号。原实现有两层问题：①用刚被删除的 instance 作为 FK 写入新的 `PartnerLedgerEntry`，留下悬空外键引用（事务结束时 SQLite check_constraints 报 IntegrityError，被本轮新增的回归测试 `test_*_order_no_uses_max_not_count` 暴露出来）；②与 `PartnerLedgerEntry` FK 的 CASCADE 行为叠加，使 `Partner.balance` 在订单删除后被双重抵消（应回到 0 却变成 -X）。正确链路是 CASCADE 删除原始台账条目 → `remove_ledger_from_balance` 触发 → balance 自动归位，无需 cleanup 信号。同时修复 `core/tests.py` 中 `ProductAPITest.test_product_list_endpoint_returns_mock_payload`——它一直在未认证状态下期望 200，与 DRF 默认 `IsAuthenticated` 不兼容；现在用 `force_authenticate(manager)` 满足 PR-1 收紧后的 `IsManagerOrWarehouse` 权限。新增 `OrderDeletionLedgerTest` 两条正向回归：删销售单后客户 balance=0、删采购单后供应商 balance=0，防止未来有人"恢复"被移除的 cleanup 信号。
- **2026-05-11**：**台账架构重设计**（Snapshot 模式 + 计算式余额）。原架构把"事务性余额"和"审计轨迹"两个职责揉在一张 `PartnerLedgerEntry` 表 + 6 个信号上，导致 cleanup 信号 / item-cascade / 双重抵消等连锁问题。彻底重做：(1) `core.Partner.balance` 从 `DecimalField` 改为只读 `@property`——`Sum(partner.ledger_entries.amount)`，列表查询用 `annotate(...)` 避免 N+1。(2) `PartnerLedgerEntry.sales_order` / `purchase_order` 从 `ForeignKey` 改为 `OneToOneField`——同一订单最多一条快照条目。(3) 信号链从 6 个砍到 3 个：`sync_sales_order_ledger` / `sync_purchase_order_ledger` / `sync_transaction_ledger`，全部用 `update_or_create` 上插下覆；删了 `store_previous_ledger_state` / `apply_ledger_to_partner_balance` / `remove_ledger_from_balance` / `update_*_order_total` / `ensure_transaction_ledger`。(4) "删订单 = 从未发生"语义：CASCADE 删条目 → property 重新求和 → 余额自动归位，无需任何反向条目信号。配套迁移：`business.0014_redesign_ledger`（清旧条目 → FK→OneToOne → 重建 snapshot）+ `core.0003_remove_partner_balance`（删字段）。`FinancePartnerSummaryView` 改用 `Subquery + Coalesce` 实时算余额，`PartnerSerializer.balance` 显式声明为只读 DecimalField。详见 PRD §3.1 §3.2 §4.4。性能评估：在本项目体量下（5 年累积 ~17500 条目），Subquery 余额查询 < 50ms，反而比原冗余字段写入有更好的并发安全性（去掉 Partner 行级锁竞争）。
- **2026-05-11**：一次性修 §9.1 的 4 个前端小 bug。(#3) `SalesOrdersPanel.customerOptions` 客户筛选从 `=== 'CUSTOMER'` 改为 `'CUSTOMER' || 'BOTH'`，与后端 `limit_choices_to` 同口径；(#4) `PurchasePanel.supplierOptions` 供应商筛选从 `!== 'CUSTOMER'`（会纳入 SELF）改为显式 `'SUPPLIER' || 'BOTH'`；(#8) `api/client.ts: createPurchaseOrder` 的 `order_no` 类型签名改为可选（`order_no?: string`），对齐后端 `_generate_sequential_order_no` 自动生成机制；(#9) `App.tsx: usePartners` 的 enabled 条件从 `(isManager || isWarehouse || isShipper)` 收紧到 `isManager`，避免 warehouse/shipper 静默 403——这两个角色的面板从不消费 partners 列表（`WarehouseReceivingPanel` 仅作为 dead prop 接收，`ShippingPanel` 通过 `sales_item.order.partner_name` 嵌套字段拿名）。所有改动经 tsc --noEmit 验证未引入新错误。
- **2026-05-11**：**列表 hook 分页范式落地**——`useSalesOrders` 作为模板完成 server-side filter + pagination 改造。API client 加入公共类型 `ListQueryParams` / `PaginatedResponse<T>` / 端点专用的 `SalesOrdersQueryParams`，以及 `toQueryString` helper。`useSalesOrders` 重写为接收 options 对象 `{ enabled, page, pageSize, filters }`、返回 `{ data, loading, error, reload, pagination }`；filters 用 `JSON.stringify` 稳定化避免无限重 fetch。`SalesOrdersPanel` 自管 hook 调用，drop `usePaginatedFilter`，filters/page 全部走后端——客户筛选用精确 `partner` ID 或退化为 `partner_name` 模糊匹配，状态用 `status`，与后端 `SalesOrderFilter` 同口径。`App.tsx` 同步把 `useSalesOrders` 收紧到 `(isManager || isShipper)`（避免 warehouse 静默 403），并移除给 `SalesOrdersPanel` 的 `orders/loading/error/onRefresh` props（panel 自管）；`ShippingPanel` 暂时保留 App.tsx 的中央获取（首页 20 条，已记入 §9.1 #6 待迁移）。`OrderDetailsView.Props` 加 `onAddEvent?` 字段（之前是被 `any[]` 掩盖的隐式 prop）。修复 SalesOrdersPanel 中"已存在的偏好型号去重"逻辑——把 `.filter((name): name is string => ...)` 守卫拆成两步，避免 TS 守卫在 `&&` 第二个子表达式里失效。`rules/frontend-rules.md §3.1` 写下列表 hook 标准范式，供后续 hook 迁移参照。所有改动 tsc --noEmit 验证零新增错误。
- **2026-05-11**：**StockAdjustment append-only 约束落地（§9.1 #2 修复）**。业务侧确认选项 1（保留不可逆语义 + UI 引导反冲），与未来 BOM 自动扣料场景前置条件对齐。改动：(1) 后端 ViewSet 经核实只 mix `List + Create`，PATCH/PUT/DELETE 已天然返回 405——零代码改动，加 `test_stock_adjustment_is_append_only` 回归测试锁死这一行为，防未来有人误加 mixin。(2) `StockAdjustmentAdmin` 改写：`has_change_permission` / `has_delete_permission` 返回 False，所有字段加 `readonly_fields`，加 docstring 解释不可逆理由及"反向冲销"工作流。(3) 前端 `InventoryPanel` 批量调整面板与 `SelfMadeGalleryPanel` 单品调整 modal 都加显眼红色"⚠ 提交后无法修改/删除"提示框，引导用户录反向调整冲销。(4) 顺手删了死代码 `StockAdjustmentForm.tsx`。(5) `rules/backend-rules.md §1.5` 写下「append-only 事件 model」总则——ViewSet 只能 List+Create、admin 必须只读、必须有 405 回归测试、撤销靠反向事件——后续新增的事件型 model（ReceivingLog / ShippingLog / OrderEvent / 未来的 ProductionOrder 消耗记录等）都按此约束。
- **2026-05-11**：**Token 自动续期落地（§9.1 #7 修复）**。`apiFetch` 检测到 401 时自动调 `/api/token/refresh/` 获取新 access token 并重试一次原请求；并发 401 走 `refreshInFlight` 单飞 promise 去重，避免连发 N 次 refresh。`client.ts` 增加 `setRefreshToken` / `onAuthTokenRefreshed` 两个对外 API；`AuthContext` 通过 `useEffect` 把 refresh token 同步到 client.ts，并注册回调把续期后的新 access token 持久化到 localStorage + state。`api.getCurrentUser` 加显式返回类型避免 `profile is unknown` 的 TS 报错。续期失败则清空所有 token 让请求自然 401 → loadUser 失败 → 走原登出路径。结果：用户 8h 内不会被强制踢回登录，体验显著改善。
- **2026-05-11**：**列表 hook 批量迁移完成（§9.1 #6 修复）**。在 `hooks/listHookHelpers.ts` 抽出共享范式 `useListResource` + `buildListQueryParams`——封装 enabled / pagination / filters 稳定化 / 三态加载 / 分页元数据。`useSalesOrders` / `usePurchaseOrders` / `useShippingLogs` / `useFinanceTransactions` / `useProducts` / `usePartners` / `useCategories` 全部改写成调用 helper，每个 hook 仅剩 ~50 行（含类型定义 + normalize + thin wrapper）。所有 hook 兼容旧的裸 boolean 签名（`useProducts(true)`），新调用方传 options 对象（`useProducts({ enabled: true, page: 2, filters: {...} })`）。API client 加齐 `ProductsQueryParams` / `CategoriesQueryParams` / `PartnersQueryParams` / `PurchaseOrdersQueryParams` / `ShippingLogsQueryParams` / `FinanceTransactionsQueryParams` 六个 typed query 接口，与各自后端 FilterSet 一一对应。`ShippingPanel` 改造为自管 `useSalesOrders` + `useShippingLogs`——不再依赖 App.tsx 中央获取的首页数据；客户名 / 状态筛选都走后端，分页正常工作。`App.tsx` 移除 `useSalesOrders` 和 `useShippingLogs` 的中央调用，配合 `usePurchaseOrders` 收紧到 `(isManager || isWarehouse)` gating（与后端 `ManagerOrWarehouseReadOnly` 同口径）。改动经 tsc --noEmit 验证零新增错误。后续所有列表 hook（含未来新加）都应按 `rules/frontend-rules.md §3.1` 范式实现。
- **2026-05-11**：**收尾整理**。(1) 审计 `backend/scripts/seed_mock_data.py` 在新 schema 下的兼容性——**结论：兼容**。脚本不引用 `paid_amount` / `Partner.balance` / 旧 ledger 结构；只在 docstring 顶部加注释说明其性质（绕过序列化器写入，部分 finance spec 符号与生产语义不一致），并把这条记入 §9.2 #24。(2) 重写 `backend/docs/api.md` —— 删掉旧版含 `paid_amount` 等过期字段的描述，按当前后端事实重写：鉴权章节加 token 自动续期说明（呼应 §9.4 之前的 #7 修复）；append-only 端点章节明确说明三个事件型端点没有 PATCH/PUT/DELETE；分页约定章节强调金额脱敏；标注与 PRD §5 同步、冲突以 PRD 为准。
- **2026-05-11**：**BOM 排产系统上线**（销售明细 = 三件半成品组合 + 每日排产扣料）。
  - **数据模型**：`Category.TYPE_CHOICES` 加 `BOARD` / `CABLE` 两类半成品分类；`StockAdjustment.ADJUSTMENT_TYPES` 加 `PRODUCE_CONSUME`；`SalesOrderItem` 新增 `board` / `cable` 两个 FK（限定 category_type），`product` 字段沿用历史字段名指代外壳槽位；新建 `ProductionOrder` + `ProductionOrderLine` 两张表，line 可挂 `sales_item` 或独立（备货模式）。
  - **状态机**：`PLANNED` → `EXECUTED`（不可逆） / `CANCELLED`（仅 PLANNED 可取消）。
  - **信号**：新增 `_stash_production_order_previous_status`（pre_save）+ `execute_production_consumption`（post_save）——只有真正的 `PLANNED → EXECUTED` 状态转换才触发扣料；用 pre_save 拿 DB 真值做幂等保护，**不依赖 Python 实例的 `executed_at` 字段**（避免 Python 缓存陈旧覆盖 DB 新值）。每条 line 自动写 **3 条** `StockAdjustment(PRODUCE_CONSUME)` 各扣 quantity 个。允许库存变负。
  - **后端 API**：`ProductionOrderViewSet` 含 List/Retrieve/Create/Update + `@action execute` + `@action cancel`，**故意不挂 DestroyMixin**——排产单 append-only。`permission_classes = [IsAuthenticated]`，三角色都可操作。
  - **后端配套**：`SalesOrderItemSerializer` 创建时强制三件齐备；admin 给 `ProductionOrder` 加 `ProductionOrderLineInline`，EXECUTED/CANCELLED 后整单只读、禁删；`StockAdjustmentViewSet` 顺手加 `RetrieveModelMixin` 让 detail GET 200、PATCH/PUT/DELETE 正确 405（之前 detail 路由不存在导致 404 而非 405）。
  - **迁移**：`core/0004_category_choices_board_cable.py`（choices 注册）+ `business/0015_bom_production_order.py`（StockAdjustment choices + SalesOrderItem 加字段 + 创建两张新表）。
  - **测试**：新建 `BOMProductionOrderTest` 4 条用例（扣料 3 条 PRODUCE_CONSUME 正确写入、幂等保护、PLANNED 不触发扣料、允许库存变负）；修旧测试 setUp 加 BOARD/CABLE product，POST sales-orders 的 payload 都补三件。29 个测试全绿。
  - **前端**：`types.ts` 加 `production` 面板键（manager/warehouse/shipper 均可见）；`api/client.ts` 加 `ProductionOrdersQueryParams` + 6 个 ProductionOrder API；新建 `hooks/useProductionOrders.ts` 按 `listHookHelpers` 范式实现；`OrderItemsEditor` 销售模式从"分类→物料"两级改成**外壳/板材/线材三个独立下拉**（按 category_type 直接过滤）；`SalesOrdersPanel.openCreate/openEdit/handleSubmit` 同步改造 form state（drop category，加 board/cable）；新建 `ProductionPanel.tsx` ——含每日排产、关联销售明细 / 备货模式切换、一键扣料、取消、明细展开查看，配显眼红色"扣料不可逆"警示。所有改动经 tsc --noEmit 验证零新增错误（剩余 BaseInput / NavbarButtonProps / @types/react 缺失类错误是项目固有问题 §9.2 #16）。
  - **配套文档**：PRD §2.2 加 production-orders 权限矩阵；§3.1 Category 章节加 BOARD/CABLE 说明；§3.2 SalesOrderItem 字段重写为三件结构；§3.2 StockAdjustment 加 PRODUCE_CONSUME；§3.2 新增 ProductionOrder / ProductionOrderLine；§3.3 ER 图加排产分支；§4.5 新增"BOM 排产与自动扣料"流程；§5 API 表加 production-orders 五行；§6 不变量加 BOM 三条（#15-17）。

---

## 10. 文档维护约定

- 任何 model / serializer / signal / permission 的改动 PR，必须同步更新本 PRD 第 3、4、6 节
- 新增 API 必须更新第 5 节表格
- 新增/修改角色必须更新第 2 节并对应改动 `scripts/setup_roles.py`
- 第 9 节"风险与待办"项目修复后必须移除条目（或转为 changelog）
