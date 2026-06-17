from decimal import Decimal

from django.db import models
from django.db.models import Sum


class Partner(models.Model):
    PARTNER_TYPES = (
        ('SUPPLIER', '供应商'),
        ('CUSTOMER', '客户'),
        ('BOTH', '双重身份'),
        ('SELF', '工厂自用'),
    )
    name = models.CharField("单位名称", max_length=200, unique=True)
    partner_type = models.CharField("单位类型", choices=PARTNER_TYPES, max_length=20)
    # 注意：原 balance 字段（DecimalField）已废弃，改为按 ledger_entries 求和
    # 的只读 property。详见 docs/PRD.md §3.2 与 §9.4 changelog 2026-05-11。
    # 列表场景请使用 annotate(balance=Sum('ledger_entries__amount')) 一次拿到，
    # 避免 N+1 查询。

    class Meta:
        verbose_name = "合作伙伴"
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.name

    @property
    def balance(self):
        """合作方往来余额——所有 PartnerLedgerEntry.amount 之和。

        正值 = 客户欠我们 / 我们欠供应商；负值反之。
        """
        return self.ledger_entries.aggregate(total=Sum('amount'))['total'] or Decimal('0')

class Category(models.Model):
    # 注：板材（BOARD）与线材（CABLE）是 BOM 系统引入的两类半成品分类
    # （详见 docs/PRD.md §3.2 与 §4 排产流程）。它们在库存/调整/事件机制
    # 上与其他 Product 完全一致，仅用 category_type 做语义区分。
    TYPE_CHOICES = (
        ('RAW_MATERIAL', '原材料'),
        ('SELF_MADE', '自产件'),
        ('BOARD', '板材'),
        ('CABLE', '线材'),
        ('FINISHED', '成品'),
    )
    name = models.CharField("分类名称", max_length=50)
    category_type = models.CharField("分类属性", choices=TYPE_CHOICES, max_length=20)
    # 支持无限级分类
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children', verbose_name="上级分类")

    class Meta:
        verbose_name = "产品分类"
        verbose_name_plural = verbose_name

    def __str__(self):
        return f"{self.name} ({self.get_category_type_display()})"

class Product(models.Model):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, verbose_name="所属分类")
    # 核心逻辑字段
    internal_code = models.CharField(
        "内部管理编号",
        max_length=100,
        unique=True,
        help_text="自产件编号规则：年份-类别-系列-颜色 (例: 2026-SH-SD-BK)"
    )
    model_name = models.CharField("规格型号", max_length=100)
    image = models.ImageField("产品展示图", upload_to='products/%Y/%m/', blank=True, null=True)
    unit = models.CharField("单位", max_length=10, default="个")
    stock_quantity = models.DecimalField("当前库存", max_digits=12, decimal_places=2, default=0)
    min_stock = models.DecimalField("安全库存预警值", max_digits=12, decimal_places=2, default=0)

    class Meta:
        verbose_name = "产品物料"
        verbose_name_plural = verbose_name

    def __str__(self):
        return f"[{self.category.name}] {self.internal_code} | {self.model_name}"


class PcbPlan(models.Model):
    """PCB 方案（配方）。

    一个方案 = 一种 PCB 板的物料配方，被 SMT 加工商按方案领料贴片后送回。
    工厂物理流程（详见 docs/PRD.md §4.5）：
      1. 销售明细挂方案；
      2. 排产 EXECUTED 时一次性扣减：1 外壳 + 1 线材 + 方案展开的所有原材料；
      3. SMT 加工商按方案的材料清单领料带走、贴片、送回板子；
      4. 装配线把板子 + 外壳 + 线材组合发货——本系统不跟踪"中间板材"库存。

    `is_active` 控制下架：下架后不可被新销售明细选中（serializer 校验），
    但保留历史订单引用；要彻底删需先确认无 SalesOrderItem / ProductionOrderLine 引用。
    """

    name = models.CharField("方案名称", max_length=200, unique=True, help_text="如 'M1 控制板 v1'")
    code = models.CharField("方案编号", max_length=100, blank=True, default='', help_text="可选，用于对内编号")
    description = models.TextField("方案说明", blank=True, default='')
    is_active = models.BooleanField("启用中", default=True, help_text="下架后不可被新订单选中，历史订单仍保留引用")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "PCB 方案"
        verbose_name_plural = verbose_name
        ordering = ['-is_active', 'name']

    def __str__(self):
        return f"{self.name}{'' if self.is_active else ' [已下架]'}"


class PcbPlanMaterial(models.Model):
    """PCB 方案明细——一条 = 该方案用到一种原材料及其单板用量。

    业务约束（serializer 校验）：
      - `material.category.category_type` 必须 == 'RAW_MATERIAL'
      - 同一 plan 下同一 material 不重复（unique_together）
      - `quantity_per_unit` > 0

    扣料计算：line.quantity × material.quantity_per_unit
    （详见 business/signals.execute_production_consumption）
    """

    plan = models.ForeignKey(PcbPlan, on_delete=models.CASCADE, related_name='materials', verbose_name="所属方案")
    material = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='used_in_pcb_plans',
        limit_choices_to={'category__category_type': 'RAW_MATERIAL'},
        verbose_name="原材料",
        help_text="必须是 category_type=RAW_MATERIAL 的产品",
    )
    quantity_per_unit = models.DecimalField(
        "单板用量", max_digits=12, decimal_places=2,
        help_text="每块 PCB 板用多少这个料；扣减时 line.quantity × 此值",
    )
    note = models.CharField("备注", max_length=200, blank=True, default='')

    class Meta:
        verbose_name = "PCB 方案明细"
        verbose_name_plural = verbose_name
        unique_together = [('plan', 'material')]
        ordering = ['id']

    def __str__(self):
        return f"{self.plan.name} - {self.material.model_name} × {self.quantity_per_unit}"