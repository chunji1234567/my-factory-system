"""Remove the deprecated ``paid_amount`` columns from SalesOrder & PurchaseOrder.

应付/应收概念改由 ``Partner.balance`` + ``PartnerLedgerEntry`` 承载，单据级别的
"已结清"语义不再保留。详见 docs/PRD.md §4.4。

部署回滚提示：本迁移会丢列。生产部署前请确认前端已停止读写
``paid_amount``；如需保留历史值，应在执行前导出 (id, total_amount, paid_amount)
的快照，迁移完成后写入 PartnerLedgerEntry 中的 OPENING / ADJUST 条目以保持余额一致。
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('business', '0012_alter_salesorder_status'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='salesorder',
            name='paid_amount',
        ),
        migrations.RemoveField(
            model_name='purchaseorder',
            name='paid_amount',
        ),
    ]
