# Backend Rules（Django + DRF）

本文是写后端代码前的"必读清单"。所有规则都对应当前 `backend/` 真实代码——若发现规则与代码不一致，先查 `docs/PRD.md` 第 9 节确认是否已知问题，再决定改代码还是改规则。

## 0. 项目骨架（必须先理解再改）

```
backend/
├── config/          # Django 项目入口（settings, urls, wsgi/asgi）
├── core/            # 主数据：Partner, Category, Product
├── business/        # 业务：订单、日志、财务、台账
│   └── api/         # DRF 层：views, serializers, permissions, filters, urls
├── scripts/         # 一次性脚本：setup_roles, seed_mock_data
├── docs/            # API 速查（api.md）
├── manage.py
└── requirements.txt
```

- 主数据放 `core`；带状态/事件/财务联动的数据放 `business`
- DRF 层全部集中在 `business/api/`，不允许在 `business/views.py` / `business/models.py` 写 view
- 跨 app 引用允许 `business → core`，**禁止** `core → business`

## 1. Models 规则

1. **字段类型选定**
   - 金额：`DecimalField(max_digits=15, decimal_places=2)`（Partner.balance / 订单 total/paid）或 `(12, 2)`（item 级 price/quantity/stock）
   - 状态枚举：用 `STATUS_CHOICES` 元组或 `TextChoices`，名称必须与 PRD 第 3 章一致
   - 时间：`auto_now_add=True` 写入时间；不要混用 `default=timezone.now`
2. **关系约束**
   - `Product.category`：`PROTECT`（不能删带产品的分类）
   - `PurchaseOrderItem.product`：`PROTECT`
   - `SalesOrderItem.product`：`SET_NULL`（允许仅写 `custom_product_name`）
   - 订单 `partner`：`CASCADE`，删除 partner 会清掉关联订单（生产环境慎用）
3. **校验**
   - 字段唯一性必须打 `unique=True`（`Product.internal_code`、`Partner.name`、订单 `order_no`）
   - 业务级校验（如 `quantity > 0`）放在 serializer 的 `validate_*`，不放在 model 层
4. **`save()` 内的副作用**
   - 只允许在 `ReceivingLog` 与 `StockAdjustment` 中写"调库存 + 写 StockLog + 写事件"，且必须在 `transaction.atomic` + `select_for_update` 内
   - `ShippingLog.save` 只写 `OrderEvent`（不动库存），不要往里加副作用
   - 新增 model 想覆写 save 必须在 PR 中说明为什么不能用 signal
5. **append-only 事件 model**
   - `StockAdjustment` / `ReceivingLog` / `ShippingLog` / `OrderEvent` /
     `PurchaseOrderEvent` / `ProductionOrder`（EXECUTED 后）都是**不可逆事件**——
     它们的 `save()` 在 `is_new=True`（或状态转换时）产生副作用（调库存、推状态、
     写台账），但**修改或删除现有记录不会回滚副作用**
   - 这类 model 的 ViewSet **不要挂** `DestroyModelMixin`；纯只读事件再 **不挂**
     `UpdateModelMixin`；可以挂 `RetrieveModelMixin` 让 detail GET 返回 200（这样
     PATCH/PUT/DELETE 才真正返回 405 而不是路由级 404）。`ProductionOrder` 略特殊：
     允许 `UpdateModelMixin` 但 serializer 在 EXECUTED/CANCELLED 状态下抛 400 拒绝编辑
   - 对应 admin 必须重写 `has_delete_permission` 返回 False；纯只读事件还要 `has_change_permission`
     也返回 False + 所有字段加 `readonly_fields`；半可编辑事件（如 `ProductionOrder`）
     可在 `get_readonly_fields` 中按状态切换（参考 `ProductionOrderAdmin.get_readonly_fields`）
   - 测试必须有一条 405 回归断言（参考 `test_stock_adjustment_is_append_only`），
     防止未来有人不小心给 ViewSet 加 mixin 把 405 变 200
   - 状态机型的事件（`ProductionOrder`）的"扣料"signal 必须用 `pre_save` 钩子
     从 DB 快照旧状态做幂等保护，**不能依赖 Python 实例的字段**（实例缓存可能陈旧，
     会被回写覆盖）。参考 `_stash_production_order_previous_status` + `execute_production_consumption`
   - 如要"撤销"一笔事件，业务上要求**新加一笔反向类型的事件**冲销
     （会计红蓝字凭证逻辑），UI 上要显著提示这一点
6. **migration**
   - 每次 model 变更必须生成对应 migration 文件，不允许手写 SQL 或合并 squash 已 release 的 migration
   - migration 名称应包含语义（如 `0007_salesorderitem_detail_description_and_more.py`）

## 2. Signals 规则

1. **位置**：`business/signals.py` / `core/signals.py`，由 app `ready()` 导入
2. **职责**：维护"派生数据"——订单总额、台账条目、Partner.balance、订单状态
3. **现存信号清单**（改之前先看）
   - `update_sales_order_total` / `update_purchase_order_total`：item 写入/删除时重算订单总额并写 `PartnerLedgerEntry`
   - `cleanup_sales_order` / `cleanup_purchase_order`：订单删除时写反向台账条目
   - `auto_complete_sales_order`：发货后推销售单状态
   - `auto_update_purchase_status`：收货后推采购单状态
   - `ensure_transaction_ledger`：财务流水写台账
   - `store_previous_ledger_state` + `apply_ledger_to_partner_balance` + `remove_ledger_from_balance`：维护 Partner.balance
4. **新增/修改信号必须**
   - 在 `transaction.atomic` 中操作热点行（用 `F()` 或 `select_for_update`）
   - 不在 receiver 里调用别的 receiver 会触发的副作用，避免循环
   - 写日志（`logging.getLogger(__name__).info(...)`）记录关键变化
5. **禁止**
   - 在信号里发外部 IO（HTTP、企业微信通知、邮件）——这类副作用应通过任务队列触发，目前还没有任务队列，所以暂时禁止
   - 在信号里抛异常打断主流程——如果检测到异常状态，写日志 + 创建一个 `OrderEvent('REMARK')` 提示

## 3. Serializers 规则

1. **`fields` 必须显式枚举**，禁止 `__all__`
2. **金额脱敏**
   - 凡是涉及金额字段的序列化器必须继承 `MonetaryMaskMixin` 并设置 `monetary_fields = [...]`
   - 新加金额字段时同步把字段名加进 `monetary_fields`，否则会泄露给 warehouse / shipper
   - 当前已脱敏：`PurchaseOrderItem.price`、`PurchaseOrder.total_amount`、`SalesOrderItem.price`、`SalesOrder.total_amount`、`SalesOrder.paid_amount`
3. **写入路径**
   - 创建/编辑订单的明细批量写：用 `items_payload`（write-only nested），保持与现有 PurchaseOrder/SalesOrder 一致
   - operator 字段在 create/update 时通过 `_resolve_operator(validated_data, request)` 注入，不要直接读 `request.user`
4. **校验顺序**
   - 单字段校验放 `validate_<field>`（例：`validate_quantity_received` 检查 > 0）
   - 跨字段校验放 `validate(self, attrs)`（例：发货剩余量、收货剩余量、订单明细数量不小于已发/已收）
5. **finance 专用**
   - `FinanceTransactionSerializer._normalize_amount` 强制 `RECEIPT` / `PAYMENT` 取负——新增交易类型必须显式决定是否归一
   - 不要在 serializer 里直接写 `Partner.balance`，让 signal 维护

## 4. Views / ViewSets 规则

1. **基类选择**
   - 仅读列表/详情：`generics.ListAPIView` / `RetrieveAPIView`
   - 标准 CRUD：用 `mixins` 组合 + `viewsets.GenericViewSet`，**不要** `ModelViewSet`，否则会暴露用不到的动作
2. **必须设置**
   - `permission_classes`：列表见 `business/api/permissions.py`，路径权限对照 `docs/PRD.md` §2.2
   - `filter_backends`：`[DjangoFilterBackend, filters.OrderingFilter]`
   - `filterset_class`：在 `business/api/filters.py` 中定义；新增过滤字段必须放进对应 FilterSet
   - `ordering_fields` / `ordering`：显式列出可排序字段 + 默认排序
3. **prefetch / select_related**
   - 列表 view 的 `get_queryset` 必须 `select_related` + `prefetch_related` 把后续序列化用到的关系全部加载
   - 反例：`SalesOrderViewSet.get_queryset` 已经做了 `prefetch_related('items__product', 'items__shippings')`，新加序列化字段时记得同步
4. **自定义 action**
   - 状态推进、事件创建用 `@action(detail=True)` 写在 ViewSet 内，权限独立设置（参考 `SalesOrderViewSet.events` / `.status`）
   - 状态机校验**必须**在 view 层（serializer 不持有 instance.status 上下文）
5. **不要**
   - 不要在 view 里直接写 `request.user.groups.filter(...)`——用 `business/api/utils.is_manager` 等
   - 不要返回未脱敏的金额——必须经由序列化器
   - 不要绕过 ViewSet 自定义 paginator，除非有充分理由（如 finance summary 的特殊响应结构）

## 5. Permissions 规则

1. **角色定义**
   - 角色名常量：`business/api/utils.py` 中的 `MANAGER_GROUP` / `WAREHOUSE_GROUP` / `SHIPPER_GROUP`
   - `superuser` 视为 manager（已在 `_is_in_group` 内置）；生产环境 superuser 必须收敛
2. **权限类**
   - 新角色或新组合一律加新类，不改老类
   - 命名约定：`Is<Role>` 全权限；`<Role>ReadOnly` 半只读；`<RoleA>Or<RoleB>` 任一即可
3. **权限校验时机**
   - 用 `permission_classes` 做"能不能进这个端点"
   - 用 serializer 字段过滤做"能看到哪些字段"
   - 不要混用：不要在权限类里改 queryset 字段集合
4. **必须显式声明 `permission_classes`**
   - **禁止隐式继承全局默认**——未来读代码的人会无法分辨"故意开放"与"漏写权限"
   - 唯一允许的 `[IsAuthenticated]`：`/api/core/me/` 这类返回请求者自身信息的端点；其他业务端点都必须按角色收敛
   - 参考：`core/views.ProductListView` / `CategoryListView` 用 `[IsManagerOrWarehouse]`；`PartnerListCreateView` 用 `[IsManager]`

## 6. Filters 规则

1. 所有 list 端点必须有显式 `FilterSet`
2. 日期类过滤命名规范：`<field>_from` / `<field>_to`（用 `gte` / `lte` lookup）
3. 模糊匹配字段使用 `lookup_expr='icontains'`，命名直接复用字段名（`order_no`、`note`）
4. 新增字段必须在 `docs/PRD.md` §5.3 表格里同步登记

## 7. URL 规则

1. 业务 ViewSet 用 `DefaultRouter` 注册，URL 命名遵循"功能-资源"复数（如 `purchase-orders/`）
2. 单实例操作（财务详情、台账导出）用 `path('<resource>/<int:partner_id>/...')`，不挤进 router
3. 路径前缀已固定：`/api/core/` 和 `/api/business/`，不要混用

## 8. 测试规则

1. **必须覆盖**
   - 所有信号引发的状态变化（参考 `test_complete_purchase_and_sales_flow`）
   - 所有金额脱敏路径（参考 `test_purchase_order_amount_mask_for_warehouse`）
   - 所有权限组合（manager / warehouse / shipper 三种角色对每个端点）
   - 任何业务校验（剩余可发量、状态前进一档等）
2. **测试基类**
   - model + signal 行为：`django.test.TestCase`
   - API：`rest_framework.test.APITestCase`
3. **测试数据**
   - 在 setUp 创建 `Group.objects.get_or_create('manager'/'warehouse'/'shipper')` 而不是依赖外部 fixture
   - 使用 demo 用户名风格：`<role>_user`、密码 `pass123`
4. **运行**
   - `python manage.py test` 跑全量；CI 必须绿才能合并

## 9. 事务与并发

1. 涉及库存或财务的写入路径必须 `transaction.atomic` 包裹
2. 热点行（`Product.stock_quantity`、`PartnerLedgerEntry`）使用 `select_for_update`
3. 计数生成型字段（订单号）用 `select_for_update` 防并发碰撞——目前 `SalesOrderSerializer._generate_order_no` 没做，已列入 PRD 第 9.1 节风险，谁动那块谁修
4. 信号链是同事务的，不允许在 receiver 内 `transaction.on_commit` 之外再开新事务

## 10. 安全

1. **不允许**
   - 把 `SECRET_KEY` 写进代码或 commit；必须读 `os.environ`
   - 在 PR / commit message / 注释里贴真实账户密码或 token
   - 把 `DEBUG=True` 提交到主干
2. **必须**
   - 所有金额字段经 `MonetaryMaskMixin`
   - 涉及 partner 数据的端点都要权限校验
   - 上传图片的 `ImageField` 必须有 `upload_to` 指定子目录，避免直接落进根 media

## 11. 风格

- PEP 8；4 空格缩进；行宽 ≤ 120
- import 顺序：stdlib → 第三方 → 项目内（`core`/`business`）
- 类/函数 docstring 用中文，便于快速 review
- 不要写一次性脚本到 `business/models.py`；放 `scripts/` 下并明确入口（`if __name__ == '__main__'`）
