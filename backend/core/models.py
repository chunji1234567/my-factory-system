from django.db import models

class Partner(models.Model):
    PARTNER_TYPES = (
        ('SUPPLIER', '供应商'),
        ('CUSTOMER', '客户'),
        ('BOTH', '双重身份'),
        ('SELF', '工厂自用'),
    )
    name = models.CharField("单位名称", max_length=200, unique=True)
    partner_type = models.CharField("单位类型", choices=PARTNER_TYPES, max_length=20)
    balance = models.DecimalField("往来余额", max_digits=15, decimal_places=2, default=0)

    def __str__(self):
        return self.name

class Category(models.Model):
    TYPE_CHOICES = (
        ('RAW_MATERIAL', '原材料'),
        ('SELF_MADE', '自产件'),
        ('FINISHED', '成品'),
    )
    name = models.CharField("分类名称", max_length=50)
    category_type = models.CharField("分类属性", choices=TYPE_CHOICES, max_length=20)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')

    def __str__(self):
        return f"{self.name} ({self.get_category_type_display()})"

class Product(models.Model):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, verbose_name="所属分类")
    # 你的核心逻辑：2026-SH-SD-BK
    internal_code = models.CharField("内部管理编号", max_length=100, unique=True, help_text="自产件必填，如：2026-SH-SD-BK")
    model_name = models.CharField("规格型号", max_length=100)
    image = models.ImageField("产品图片", upload_to='products/%Y/%m/', blank=True, null=True)
    unit = models.CharField("单位", max_length=10, default="个")
    stock_quantity = models.DecimalField("当前库存量", max_digits=12, decimal_places=2, default=0)
    min_stock = models.DecimalField("安全库存预警", max_digits=12, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.internal_code} | {self.model_name}"