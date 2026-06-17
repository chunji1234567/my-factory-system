"""StockLog 移除 ``SALE`` 枚举（2026-05-21）。

业务约定（详见 docs/PRD.md §3.2 与 §9.4 changelog 2026-05-21 §9.2 #10）：
**成品不入库存**——销售明细 = 三件半成品（外壳/板材/线材）的 BOM 配置，
发货时既无成品库存可扣、也不写 ``SALE`` 类型 log。``StockLog.SALE`` 从未被
任何业务路径写入过（grep `frontend/` `backend/` 均零引用），属于历史包袱，
在此次清理中一并移除以避免未来开发者误以为该枚举有现行语义。

DB 影响：仅修改 ``log_type`` 字段的 ``choices`` 元数据（Django 在校验层使用，
DB 列本身是 CharField，原有数据**不会被破坏**）。本地 `db.sqlite3` 中目前
也没有 ``SALE`` 类型行（确认手段：``StockLog.objects.filter(log_type='SALE')``
应为空）。

回滚：如未来业务方向变更，需要重新启用发货扣库存，需补回 ``SALE`` choice +
``ShippingLog.save`` 内增加 ``Product.stock_quantity -= ...`` + 写 ``StockLog``
的代码路径——这是个真正的业务决策，不要靠 migration revert 实现。
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('business', '0015_bom_production_order'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stocklog',
            name='log_type',
            field=models.CharField(
                choices=[
                    ('PURCHASE', '采购入库'),
                    ('PRODUCE', '生产入库'),
                    ('ADJUST', '手动调整'),
                ],
                max_length=20,
                verbose_name='变动类型',
            ),
        ),
    ]
