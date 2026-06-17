"""台账重设计迁移（2026-05-11）。

变更要点（详见 docs/PRD.md §9.4 changelog）：
1. ``PartnerLedgerEntry.sales_order`` / ``purchase_order`` 从 ``ForeignKey``
   改为 ``OneToOneField``——一个订单只允许一条对应条目（snapshot 语义）。
2. 删除 ``core.Partner.balance`` 冗余字段——改为只读 ``@property`` 直接求和
   ledger_entries。

迁移过程：
- 先用 RunPython 清空 ``PartnerLedgerEntry``（旧表里是 delta 条目，与新的
  snapshot 语义不兼容；并且可能存在同一订单多条 SALES/PURCHASE 条目，
  转 OneToOne 时会撞 unique 约束）。
- 然后改字段类型（FK → OneToOneField）。
- 再用 RunPython 从 ``SalesOrder`` / ``PurchaseOrder`` / ``FinancialTransaction``
  当前总额反向**重建**台账条目（一行一行，正好满足 OneToOne 约束）。

``Partner.balance`` 字段的删除拆到 ``core.0003_remove_partner_balance``——
跨 app 的 RemoveField 不允许写在本迁移中。``core.0003`` 在依赖关系上排在
本迁移之后，保证台账状态稳定后再删字段。

回滚（reverse）：把 OneToOne 改回 ForeignKey，``core.0003`` 反向再把 balance
字段加回来。余额数值无法从 OneToOne 阶段精确还原——回滚会从 ledger 之和
回填。系统未上线，回滚通常意味着重置 dev 环境，不会有真实影响。
"""
from decimal import Decimal

from django.db import migrations, models


def _split(amount):
    return (
        amount if amount > 0 else Decimal('0'),
        -amount if amount < 0 else Decimal('0'),
    )


def wipe_ledger_forward(apps, schema_editor):
    PartnerLedgerEntry = apps.get_model('business', 'PartnerLedgerEntry')
    PartnerLedgerEntry.objects.all().delete()


def rebuild_ledger_forward(apps, schema_editor):
    """从订单 / 流水当前态重建 snapshot 台账。

    用历史 model 直接 create，绕过所有信号——这正是我们想要的，
    因为信号已经按新设计重写，但迁移阶段还没有完整运行时上下文。
    """
    SalesOrder = apps.get_model('business', 'SalesOrder')
    PurchaseOrder = apps.get_model('business', 'PurchaseOrder')
    FinancialTransaction = apps.get_model('business', 'FinancialTransaction')
    PartnerLedgerEntry = apps.get_model('business', 'PartnerLedgerEntry')

    for so in SalesOrder.objects.select_related('partner').all():
        amount = Decimal(so.total_amount or 0)
        if not amount:
            continue
        debit, credit = _split(amount)
        PartnerLedgerEntry.objects.create(
            partner=so.partner,
            entry_type='SALES',
            amount=amount,
            debit_amount=debit,
            credit_amount=credit,
            sales_order=so,
            note=f'销售订单 {so.order_no}',
        )

    for po in PurchaseOrder.objects.select_related('partner').all():
        amount = Decimal(po.total_amount or 0)
        if not amount:
            continue
        debit, credit = _split(amount)
        PartnerLedgerEntry.objects.create(
            partner=po.partner,
            entry_type='PURCHASE',
            amount=amount,
            debit_amount=debit,
            credit_amount=credit,
            purchase_order=po,
            note=f'采购订单 {po.order_no}',
        )

    for txn in FinancialTransaction.objects.select_related('partner').all():
        amount = Decimal(txn.amount or 0)
        if not amount:
            continue
        debit, credit = _split(amount)
        PartnerLedgerEntry.objects.create(
            partner=txn.partner,
            entry_type='FINANCE',
            amount=amount,
            debit_amount=debit,
            credit_amount=credit,
            transaction=txn,
            note=txn.note or '',
        )


def noop_reverse(apps, schema_editor):
    """空操作——回滚到 delta 模式时，原始 delta 条目已经无法重建（系统未上线，
    若真要回滚到 delta，应当重置 dev DB 而不是依赖反向迁移）。"""
    return


def wipe_ledger_for_rebuild_reverse(apps, schema_editor):
    """rebuild 步骤的反向：清空所有 snapshot 条目。"""
    PartnerLedgerEntry = apps.get_model('business', 'PartnerLedgerEntry')
    PartnerLedgerEntry.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('business', '0013_remove_paid_amount'),
        ('core', '0002_alter_category_options_alter_partner_options_and_more'),
    ]

    operations = [
        # 1. 清空旧 delta 条目（避免转 OneToOne 时触发 unique 约束冲突）
        migrations.RunPython(wipe_ledger_forward, noop_reverse),

        # 2. FK → OneToOneField
        migrations.AlterField(
            model_name='partnerledgerentry',
            name='sales_order',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name='ledger_entry',
                to='business.salesorder',
            ),
        ),
        migrations.AlterField(
            model_name='partnerledgerentry',
            name='purchase_order',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name='ledger_entry',
                to='business.purchaseorder',
            ),
        ),

        # 3. 从订单 / 流水重建 snapshot 条目
        #    （Partner.balance 字段的删除在 core.0003_remove_partner_balance，
        #    它在依赖图上排在本迁移之后）
        migrations.RunPython(rebuild_ledger_forward, wipe_ledger_for_rebuild_reverse),
    ]
