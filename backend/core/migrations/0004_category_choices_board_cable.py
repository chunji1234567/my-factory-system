"""``Category.TYPE_CHOICES`` 加 ``BOARD`` / ``CABLE``（2026-05-11 BOM 改造）。

choices 是 Django CharField 的 model-state 元数据，**不会改变 DB schema**——
本迁移仅同步 ``MigrationGraph`` 的 state，让 admin / ModelForm /
``django.core.checks`` 都能识别新增的两种分类类型。详见
docs/PRD.md §3.2 与 §9.4 changelog。
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_remove_partner_balance'),
    ]

    operations = [
        migrations.AlterField(
            model_name='category',
            name='category_type',
            field=models.CharField(
                choices=[
                    ('RAW_MATERIAL', '原材料'),
                    ('SELF_MADE', '自产件'),
                    ('BOARD', '板材'),
                    ('CABLE', '线材'),
                    ('FINISHED', '成品'),
                ],
                max_length=20,
                verbose_name='分类属性',
            ),
        ),
    ]
