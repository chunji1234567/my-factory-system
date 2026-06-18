"""2026-06-18：给销售订单和采购订单各加一个交期字段。

- ``SalesOrder.expected_delivery_date``：答应客户在哪天前送达
- ``PurchaseOrder.expected_arrival_date``：供应商承诺哪天前到我仓

两字段都允许为空：旧数据没填、急单临时下都合理。

用途（详见 docs/ux-audit.md §2.3/§2.4 与 docs/design-system.md DueDatePill）：
  - 排产 / 发货 / 收货卡片右上角显示 `DueDatePill`，按剩余天数着色
  - 销售 / 采购列表新增交期列
  - 紧迫度阈值：<0 danger（逾期），≤3 warning，4~7 accent，>7 muted

命名差异：销售用 delivery（送达客户），采购用 arrival（到达本仓），
和实际业务语义对齐，不要图省事统一命名。
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('business', '0018_production_record'),
    ]

    operations = [
        migrations.AddField(
            model_name='salesorder',
            name='expected_delivery_date',
            field=models.DateField(
                null=True,
                blank=True,
                verbose_name='预计交付日期',
            ),
        ),
        migrations.AddField(
            model_name='purchaseorder',
            name='expected_arrival_date',
            field=models.DateField(
                null=True,
                blank=True,
                verbose_name='预计到货日期',
            ),
        ),
    ]
