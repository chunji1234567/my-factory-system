"""删除 ``Partner.balance`` 冗余字段（2026-05-11 台账重设计）。

余额改为 ``Partner.balance`` 只读 ``@property``，求和 ``ledger_entries.amount``。
详见 docs/PRD.md §3.2 与 §9.4 changelog。

注意：本迁移依赖 business 0014 先清空 / 重建台账条目，避免 balance 字段
在 ``ledger_entries`` 数据状态不确定的情况下被删——business.0014 会确保
台账条目就是 snapshot 之后再让本迁移删字段。
"""
from decimal import Decimal

from django.db import migrations, models


def restore_balance_field_value(apps, schema_editor):
    """回滚时调用：当字段被重新加回来之后，从 ledger 求和回填 balance。"""
    from django.db.models import Sum
    Partner = apps.get_model('core', 'Partner')
    PartnerLedgerEntry = apps.get_model('business', 'PartnerLedgerEntry')
    for partner in Partner.objects.all():
        total = (
            PartnerLedgerEntry.objects.filter(partner=partner).aggregate(t=Sum('amount'))['t']
            or Decimal('0')
        )
        partner.balance = total
        partner.save(update_fields=['balance'])


def noop_forward(apps, schema_editor):
    """正向不做事——RemoveField 已经删了字段。"""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_alter_category_options_alter_partner_options_and_more'),
        # business 0014 必须先跑：它清空台账 → 改 FK 为 OneToOne → 重建条目。
        # 等台账稳定下来，本迁移才能放心删 Partner.balance。
        ('business', '0014_redesign_ledger'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='partner',
            name='balance',
        ),
        # 回滚时 RemoveField 反向 = AddField；上面是 schema 操作，下面这个
        # RunPython 仅在反向时（migrate backwards）回填字段值。
        migrations.RunPython(noop_forward, restore_balance_field_value),
    ]
