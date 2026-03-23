from django.db import models
from core.models import Partner, Product

class SalesOrder(models.Model):
    STATUS_CHOICES = (
        ('ORDERED', '已下单'),
        ('PRODUCING', '生产中'),
        ('SHIPPED', '已发货'),
        ('RECEIVED', '已收货'),
        ('COMPLETED', '已完成'),
        ('PENDING', '待处理(异常)'),
    )
    order_no = models.CharField("销售单号", max_length=50, unique=True)
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, verbose_name="客户")
    status = models.CharField("状态", choices=STATUS_CHOICES, default='ORDERED', max_length=20)
    total_amount = models.DecimalField("总金额", max_digits=15, decimal_places=2, default=0)
    paid_amount = models.DecimalField("已付金额", max_digits=15, decimal_places=2, default=0)
    tracking_no = models.CharField("快递单号", max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    operator = models.CharField("最后操作员", max_length=50)

class SalesOrderItem(models.Model):
    order = models.ForeignKey(SalesOrder, related_name='items', on_delete=models.CASCADE)
    custom_product_name = models.CharField("客户侧产品名", max_length=200, help_text="销售单自定义名称")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="内部关联物料")
    price = models.DecimalField("单价", max_digits=12, decimal_places=2)
    quantity = models.DecimalField("数量", max_digits=12, decimal_places=2)

class OrderEvent(models.Model):
    """解决备注不够放的问题，像聊天记录一样排列"""
    EVENT_TYPES = (
        ('SHIPPING', '发货记录'),
        ('RETURN', '退货处理'),
        ('REPRODUCE', '重新生产'),
        ('REMARK', '普通备注'),
    )
    order = models.ForeignKey(SalesOrder, related_name='events', on_delete=models.CASCADE)
    event_type = models.CharField("事件类型", choices=EVENT_TYPES, max_length=20)
    content = models.TextField("详细描述")
    image = models.ImageField("现场拍照", upload_to='events/%Y/%m/', blank=True, null=True)
    operator = models.CharField("操作人", max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

class PurchaseOrder(models.Model):
    order_no = models.CharField("采购单号", max_length=50, unique=True)
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, verbose_name="供应商")
    # ... 其他字段参考SalesOrder，但OrderItem强制关联Product