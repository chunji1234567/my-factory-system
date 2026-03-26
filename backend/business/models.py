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
        ('PENDING', '待处理(异常)'),
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
    paid_amount = models.DecimalField("已付金额", max_digits=15, decimal_places=2, default=0)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    operator = models.CharField("录单员", max_length=50)

    class Meta:
        verbose_name = "销售订单"
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.order_no

class SalesOrderItem(models.Model):
    order = models.ForeignKey(SalesOrder, related_name='items', on_delete=models.CASCADE)
    custom_product_name = models.CharField("客户侧产品名", max_length=200, help_text="给客户看的名称")
    detail_description = models.TextField("细节描述", blank=True, help_text="记录线长、定标等细节")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="内部关联物料")
    price = models.DecimalField("单价", max_digits=12, decimal_places=2)
    quantity = models.DecimalField("订单总量", max_digits=12, decimal_places=2)

    @property
    def shipped_quantity(self):
        # 实时计算已发货总数
        return self.shippings.aggregate(total=Sum('quantity_shipped'))['total'] or 0

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
    paid_amount = models.DecimalField("已付金额", max_digits=15, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    operator = models.CharField("操作员", max_length=50)

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
        # 1. 自动增加库存
        prod = self.purchase_item.product
        prod.stock_quantity += self.quantity_received
        prod.save()

        # 2. 自动记一笔库存流水
        StockLog.objects.create(
            product=prod,
            change_quantity=self.quantity_received,
            log_type='PURCHASE',
            reason=f"采购入库: {self.purchase_item.order.order_no}",
            operator=self.operator
        )
        super().save(*args, **kwargs)


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
    LOG_TYPES = (
        ('PURCHASE', '采购入库'),
        ('SALE', '销售出库'),
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
        if self.adjustment_type == 'MANUAL_OUT':
            return -self.quantity
        return self.quantity

    def _log_type(self):
        return 'PRODUCE' if self.adjustment_type == 'PRODUCE_IN' else 'ADJUST'

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
    sales_order = models.ForeignKey('SalesOrder', null=True, blank=True, on_delete=models.CASCADE)
    purchase_order = models.ForeignKey('PurchaseOrder', null=True, blank=True, on_delete=models.CASCADE)
    transaction = models.OneToOneField(FinancialTransaction, null=True, blank=True, related_name='ledger_entry', on_delete=models.CASCADE)
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.partner.name} {self.entry_type} {self.amount}"
