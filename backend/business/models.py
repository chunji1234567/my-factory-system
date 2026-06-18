from decimal import Decimal

from django.db import models, transaction
from django.db.models import Q, Sum
from core.models import Partner, Product

# --- 1. 销售系统 (Sales) ---

class SalesOrder(models.Model):
    STATUS_CHOICES = (
        ('ORDERED', '已下单'),
        ('PRODUCING', '生产中'),
        ('SHIPPED', '已发货'), # 部分或全部发货
        ('COMPLETED', '已完成'),
    )
    order_no = models.CharField("销售单号", max_length=50, unique=True)
    partner = models.ForeignKey(
        'core.Partner',
        on_delete=models.CASCADE,
        verbose_name="客户",
        limit_choices_to=Q(partner_type='CUSTOMER') | Q(partner_type='BOTH')
    )
    status = models.CharField("状态", choices=STATUS_CHOICES, default='ORDERED', max_length=20)
    total_amount = models.DecimalField("总金额", max_digits=15, decimal_places=2, default=0)
    # 注意：旧字段 paid_amount 已废弃。应收金额改为通过 PartnerLedgerEntry / Partner.balance
    # 计算（合作方层级，不再追到单一订单）。详见 docs/PRD.md §4.4。
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    operator = models.CharField("录单员", max_length=50)
    # 答应客户在哪天前送到。可空：急单或老数据可能未填。
    # 用途：排产/发货卡片右上角 DueDatePill，列表交期列，按交期排序与筛选。
    # 注意是订单级——客户基本是"一张单一个交期"；分批发货由 ShippingLog 承载。
    expected_delivery_date = models.DateField("预计交付日期", null=True, blank=True)

    class Meta:
        verbose_name = "销售订单"
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.order_no

class SalesOrderItem(models.Model):
    """销售订单明细。

    BOM-2.0 改造后（2026-05-21，详见 docs/PRD.md §3.2 与 §4.5 排产流程）：
    一条明细 = 客户买的"一套成品"，由三件组成：
      - ``product``（外壳，沿用历史字段名）—— 半成品，自家工坊产，FK→Product[SELF_MADE]
      - ``pcb_plan`` —— **PCB 方案**（非半成品产品），FK→PcbPlan；排产时按方案
        展开为原材料清单扣减，加工商按方案领料贴片送回
      - ``cable``（线材）—— 半成品，自家工坊产，FK→Product[CABLE]

    扣料模型（详见 ``business/signals.execute_production_consumption``）：
      每条排产明细 → (2 + N) 条 StockAdjustment(PRODUCE_CONSUME)：
        1 条扣 shell（quantity 个）
        1 条扣 cable（quantity 个）
        N 条扣 pcb_plan.materials 展开的原材料
            （每条 = line.quantity × material.quantity_per_unit）

    历史：旧 ``board`` 字段在 BOM-2.0 中删除（详见 migration 0017）。
    历史兼容：``product`` 字段名沿用，但语义自 BOM-1.0 起特指"外壳"。
    """
    order = models.ForeignKey(SalesOrder, related_name='items', on_delete=models.CASCADE)
    custom_product_name = models.CharField("客户侧产品名", max_length=200, help_text="给客户看的名称")
    detail_description = models.TextField("细节描述", blank=True, help_text="记录线长、定标等细节")
    # 三件成品组合：外壳（半成品）+ PCB 方案（配方）+ 线材（半成品）
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'category__category_type': 'SELF_MADE'},
        verbose_name="外壳（SELF_MADE）",
        help_text='历史字段名，BOM 改造后语义为"外壳"槽位',
    )
    pcb_plan = models.ForeignKey(
        'core.PcbPlan',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        limit_choices_to={'is_active': True},
        verbose_name="PCB 方案",
        help_text="选择一个已启用的 PCB 方案；排产时按方案展开扣减原材料",
    )
    cable = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        limit_choices_to={'category__category_type': 'CABLE'},
        verbose_name="线材",
    )
    price = models.DecimalField("单价", max_digits=12, decimal_places=2)
    quantity = models.DecimalField("订单总量", max_digits=12, decimal_places=2)

    @property
    def shipped_quantity(self):
        # 实时计算已发货总数
        return self.shippings.aggregate(total=Sum('quantity_shipped'))['total'] or 0

    @property
    def produced_quantity(self):
        """本明细已生产总量——所有 ProductionRecord.quantity 之和。

        BOM-2.1（2026-05-27）起，排产改为 ProductionRecord：每条记录创建即扣料（除非
        skip_consumption=True），生效后计入本属性。详见 docs/PRD.md §4.5。

        典型用途：
        - 排产中心：本明细"待排" = quantity - produced_quantity（业务上 ≥ 0）
        - 发货中心：本明细"可发" = min(quantity, produced_quantity) - shipped_quantity
        """
        from django.db.models import Sum as _Sum
        return self.production_records.aggregate(total=_Sum('quantity'))['total'] or 0

    @property
    def available_to_ship_quantity(self):
        """本明细当前可发数量。

        = min(quantity, produced_quantity) - shipped_quantity

        被订单数量截断：即使 produced 因边缘场景（减单 + 历史已排产留存）大于 quantity，
        本订单也只能发 quantity 套——多余的成品物理存在，但不在本订单账上。
        业务上的"跨订单挪用"暂不支持自动调拨，靠 admin 手动 skip_consumption 实现，
        详见 docs/PRD.md §9.3。
        """
        return max(0, min(self.quantity, self.produced_quantity) - self.shipped_quantity)

class ShippingLog(models.Model):
    """分批发货记录：核心自动化点"""
    sales_item = models.ForeignKey(SalesOrderItem, related_name='shippings', on_delete=models.CASCADE)
    quantity_shipped = models.DecimalField("本次实发数量", max_digits=12, decimal_places=2)
    tracking_no = models.CharField("物流单号/装车号", max_length=100, blank=True)
    shipped_at = models.DateTimeField("发货时间", auto_now_add=True)
    operator = models.CharField("发货员", max_length=50)

    def save(self, *args, **kwargs):
        # 发货只同步事件，不再联动库存
        OrderEvent.objects.create(
            order=self.sales_item.order,
            event_type='SHIPPING',
            content=f"已发货 [{self.sales_item.custom_product_name}] {self.quantity_shipped} 个。单号：{self.tracking_no}",
            operator=self.operator
        )
        super().save(*args, **kwargs)

# --- 2. 采购系统 (Purchase) ---

class PurchaseOrder(models.Model):
    STATUS_CHOICES = (
        ('ORDERED', '已下单'),
        ('PARTIAL', '部分入库'),
        ('RECEIVED', '全部入库'),
    )
    order_no = models.CharField("采购单号", max_length=50, unique=True)
    partner = models.ForeignKey(
        Partner, 
        on_delete=models.CASCADE, 
        verbose_name="供应商",
        limit_choices_to=Q(partner_type='SUPPLIER') | Q(partner_type='BOTH')
    )
    status = models.CharField("状态", choices=STATUS_CHOICES, default='ORDERED', max_length=20)
    total_amount = models.DecimalField("总金额", max_digits=15, decimal_places=2, default=0)
    # 注意：旧字段 paid_amount 已废弃。应付金额改为通过 PartnerLedgerEntry / Partner.balance
    # 计算（合作方层级，不再追到单一订单）。详见 docs/PRD.md §4.4。
    created_at = models.DateTimeField(auto_now_add=True)
    operator = models.CharField("操作员", max_length=50)
    # 供应商承诺哪天前到我仓。可空：现货采购或老数据可能未填。
    # 用途：收货中心订单卡右上角 DueDatePill，列表到货列，按到货排序。
    # 注意命名差异：销售用 delivery（送达客户），采购用 arrival（到达本仓）。
    expected_arrival_date = models.DateField("预计到货日期", null=True, blank=True)

    class Meta:
        verbose_name = "采购订单"
        verbose_name_plural = verbose_name

class PurchaseOrderItem(models.Model):
    order = models.ForeignKey(PurchaseOrder, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, verbose_name="采购物料")
    price = models.DecimalField("单价", max_digits=12, decimal_places=2)
    quantity = models.DecimalField("订单总量", max_digits=12, decimal_places=2)


class PurchaseOrderEvent(models.Model):
    EVENT_TYPES = (
        ('RECEIVING', '收货记录'),
        ('RETURN', '退货/异常'),
        ('REMARK', '普通备注'),
    )
    order = models.ForeignKey(PurchaseOrder, related_name='events', on_delete=models.CASCADE)
    event_type = models.CharField("事件类型", choices=EVENT_TYPES, max_length=20)
    content = models.TextField("详细描述")
    image = models.ImageField("拍照留底", upload_to='purchase-events/%Y/%m/', blank=True, null=True)
    operator = models.CharField("操作人", max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

class ReceivingLog(models.Model):
    """分批入库记录：核心自动化点"""
    purchase_item = models.ForeignKey(PurchaseOrderItem, related_name='receipts', on_delete=models.CASCADE)
    quantity_received = models.DecimalField("本次实收数量", max_digits=12, decimal_places=2)
    received_at = models.DateTimeField("收货时间", auto_now_add=True)
    remark = models.CharField("批次备注", max_length=200, blank=True)
    operator = models.CharField("仓管员", max_length=50)

    def save(self, *args, **kwargs):
        with transaction.atomic():
            super().save(*args, **kwargs)

            # 锁定产品库存，防止并发修改
            prod = Product.objects.select_for_update().get(pk=self.purchase_item.product_id)
            prod.stock_quantity += self.quantity_received
            prod.save(update_fields=['stock_quantity'])

            StockLog.objects.create(
                product=prod,
                change_quantity=self.quantity_received,
                log_type='PURCHASE',
                reason=f"采购入库: {self.purchase_item.order.order_no}",
                operator=self.operator
            )

            product_name = prod.model_name if prod else f"物料#{self.purchase_item.product_id}"
            note_suffix = f"，备注：{self.remark}" if self.remark else ''
            PurchaseOrderEvent.objects.create(
                order=self.purchase_item.order,
                event_type='RECEIVING',
                content=f"已收货 [{product_name}] {self.quantity_received}{note_suffix}",
                operator=self.operator,
            )


class CustomerPreferredProduct(models.Model):
    partner = models.ForeignKey(
        Partner,
        on_delete=models.CASCADE,
        related_name='preferred_products',
        verbose_name="客户",
        limit_choices_to=Q(partner_type='CUSTOMER') | Q(partner_type='BOTH')
    )
    name = models.CharField("常用型号", max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "客户常用型号"
        verbose_name_plural = verbose_name
        unique_together = ('partner', 'name')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.partner.name} - {self.name}"

# --- 3. 动态记录与财务 (Audit & Finance) ---

class OrderEvent(models.Model):
    EVENT_TYPES = (
        ('SHIPPING', '发货记录'),
        ('RETURN', '退货/异常'),
        ('REMARK', '普通备注'),
    )
    order = models.ForeignKey(SalesOrder, related_name='events', on_delete=models.CASCADE)
    event_type = models.CharField("事件类型", choices=EVENT_TYPES, max_length=20)
    content = models.TextField("详细描述")
    image = models.ImageField("拍照留底", upload_to='events/%Y/%m/', blank=True, null=True)
    operator = models.CharField("操作人", max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

class StockLog(models.Model):
    # 业务约定：**成品不入库存**——销售明细 = 三件半成品组合（外壳/板材/线材）的
    # BOM 配置，发货时既无成品库存可扣、也不写 SALE 类型 log。库存只跟踪半成品与
    # 原材料，发货侧由 `ShippingLog` 记录数量但不动库存。SALE 类型在 2026-05-21
    # 与 §9.2 #10 一同移除（详见 docs/PRD.md §9.4 changelog）。
    LOG_TYPES = (
        ('PURCHASE', '采购入库'),
        ('PRODUCE', '生产入库'),
        ('ADJUST', '手动调整'),
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    change_quantity = models.DecimalField("变动数量", max_digits=12, decimal_places=2)
    log_type = models.CharField("变动类型", choices=LOG_TYPES, max_length=20)
    reason = models.CharField("关联说明", max_length=200, blank=True)
    operator = models.CharField("操作员", max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)


class StockAdjustment(models.Model):
    ADJUSTMENT_TYPES = (
        ('MANUAL_IN', '手动入库/盘盈'),
        ('MANUAL_OUT', '手动出库/盘亏'),
        ('PRODUCE_IN', '生产入库'),
        # PRODUCE_CONSUME：排产扣料触发的出库——由 sync_production_order_execute
        # 信号自动写入。允许库存变负（详见 docs/PRD.md §4 排产流程）。
        ('PRODUCE_CONSUME', '排产消耗'),
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE, verbose_name="调整物料")
    adjustment_type = models.CharField("调整类型", choices=ADJUSTMENT_TYPES, max_length=20)
    quantity = models.DecimalField("调整数量", max_digits=12, decimal_places=2)
    note = models.CharField("备注", max_length=200, blank=True)
    operator = models.CharField("操作员", max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "库存调整"
        verbose_name_plural = verbose_name

    def _delta(self):
        # 出库类型一律取负：手动出库 / 排产消耗
        if self.adjustment_type in ('MANUAL_OUT', 'PRODUCE_CONSUME'):
            return -self.quantity
        return self.quantity

    def _log_type(self):
        # 排产消耗在 StockLog 里也归类为 PRODUCE（与 PRODUCE_IN 配对），方便分析
        if self.adjustment_type in ('PRODUCE_IN', 'PRODUCE_CONSUME'):
            return 'PRODUCE'
        return 'ADJUST'

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        with transaction.atomic():
            super().save(*args, **kwargs)
            if is_new:
                product = Product.objects.select_for_update().get(pk=self.product_id)
                delta = self._delta()
                product.stock_quantity += delta
                product.save()

                StockLog.objects.create(
                    product=product,
                    change_quantity=delta,
                    log_type=self._log_type(),
                    reason=self.note or f"库存调整#{self.pk}",
                    operator=self.operator,
                )

class FinancialTransaction(models.Model):
    class TransactionType(models.TextChoices):
        RECEIPT = ('RECEIPT', '收款')
        PAYMENT = ('PAYMENT', '付款')
        ADJUST = ('ADJUST', '调整')

    partner = models.ForeignKey(Partner, on_delete=models.CASCADE)
    amount = models.DecimalField("变动金额", max_digits=15, decimal_places=2)
    transaction_type = models.CharField("流水类型", max_length=20, choices=TransactionType.choices, default=TransactionType.RECEIPT)
    note = models.TextField("流水备注", blank=True)
    operator = models.CharField("操作员", max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)


class PartnerLedgerEntry(models.Model):
    ENTRY_TYPES = (
        ('SALES', '销售订单'),
        ('PURCHASE', '采购订单'),
        ('FINANCE', '财务流水'),
        ('ADJUST', '余额调整'),
        ('OPENING', '期初余额'),
    )

    partner = models.ForeignKey(Partner, related_name='ledger_entries', on_delete=models.CASCADE)
    entry_type = models.CharField(max_length=20, choices=ENTRY_TYPES)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    debit_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    credit_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    # 三个外键统一 OneToOne 语义——"一个事实写一行"。台账采用快照模式：
    # 订单 / 流水改动时 update_or_create 现有条目，删除时通过 CASCADE 一并删。
    # 详见 docs/PRD.md §3.2 与 §9.4 changelog 2026-05-11。
    sales_order = models.OneToOneField(
        'SalesOrder', null=True, blank=True,
        related_name='ledger_entry', on_delete=models.CASCADE,
    )
    purchase_order = models.OneToOneField(
        'PurchaseOrder', null=True, blank=True,
        related_name='ledger_entry', on_delete=models.CASCADE,
    )
    transaction = models.OneToOneField(
        FinancialTransaction, null=True, blank=True,
        related_name='ledger_entry', on_delete=models.CASCADE,
    )
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.partner.name} {self.entry_type} {self.amount}"


# --- 4. 排产记录（BOM-2.1 起：append-only 事件，挂在销售明细下） ---

class ProductionRecord(models.Model):
    """排产记录——一条 = "为某条销售明细记一笔今日产量"。

    BOM-2.1（2026-05-27）重设计——以前是独立 ProductionOrder + N 条
    ProductionOrderLine 的两段式状态机（PLANNED → EXECUTED / CANCELLED），
    现在退化为单条事件流：**创建即扣料 + append-only**，与 ShippingLog 完全对称。

    业务约束：
      1. ``sales_item`` 必填，**不允许备货模式**——所有生产必须挂在销售明细下。
      2. 创建时扣 (2 + N) 条 StockAdjustment(PRODUCE_CONSUME)：1 条 shell +
         1 条 cable + N 条 pcb_plan 展开的原材料；shell / pcb_plan / cable
         全部从 ``sales_item`` 取，避免数据漂移（详见 signals 中的
         ``auto_consume_on_production_record_create``）。
      3. ``skip_consumption=True`` 时跳过扣料——仅 admin 后台为"已生产但跨订单
         挪用"等边缘场景使用（详见 docs/PRD.md §9.3）。
      4. **过排产禁止**：serializer 校验 ``produced_quantity + this.quantity
         <= sales_item.quantity``。
      5. 创建后**不能编辑/删除**——append-only 事件。要"撤销"必须录反向
         ``StockAdjustment(MANUAL_IN)``（与 backend-rules.md §1.5 一致）。
      6. 首条 ProductionRecord 创建时由信号自动推 ``SalesOrder.status``
         ORDERED → PRODUCING（详见 signals.auto_promote_to_producing）。

    详见 docs/PRD.md §3.2 / §4.5 / §9.4 changelog 2026-05-27（BOM-2.1）。
    """
    sales_item = models.ForeignKey(
        SalesOrderItem,
        on_delete=models.CASCADE,
        related_name='production_records',
        verbose_name="关联销售明细",
        help_text="必填——所有生产必须挂在销售明细下，不允许备货模式",
    )
    quantity = models.DecimalField("本次产量", max_digits=12, decimal_places=2)
    skip_consumption = models.BooleanField(
        "跳过扣料",
        default=False,
        help_text=(
            "仅 admin 内部使用。True 时本条记录不触发扣料信号——用于"
            '"跨订单挪用已生产成品"等边缘场景（详见 docs/PRD.md §9.3）。'
        ),
    )
    operator = models.CharField("操作员", max_length=50)
    note = models.CharField("备注", max_length=200, blank=True)
    executed_at = models.DateTimeField("生产时间", auto_now_add=True)

    class Meta:
        verbose_name = "排产记录"
        verbose_name_plural = verbose_name
        ordering = ['-executed_at']

    def __str__(self):
        return f"排产 #{self.id} sales_item={self.sales_item_id} 数量={self.quantity}"
