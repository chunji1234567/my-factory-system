"""创建 PcbPlan + PcbPlanMaterial 两张表（2026-05-21）。

BOM-2.0 改造的主数据基础：PCB 方案（PcbPlan）= 一种 PCB 板的物料配方，
明细（PcbPlanMaterial）= 该方案用到一种原材料及其单板用量。详见
docs/PRD.md §3.2 与 §9.4 changelog 2026-05-21（PCB 方案改造）。

后续依赖：business/0017_pcb_plan 会把 SalesOrderItem.board / ProductionOrderLine.board
替换为 pcb_plan FK，引用本迁移创建的 PcbPlan 表。
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_category_choices_board_cable'),
    ]

    operations = [
        migrations.CreateModel(
            name='PcbPlan',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(help_text="如 'M1 控制板 v1'", max_length=200, unique=True, verbose_name='方案名称')),
                ('code', models.CharField(blank=True, default='', help_text='可选，用于对内编号', max_length=100, verbose_name='方案编号')),
                ('description', models.TextField(blank=True, default='', verbose_name='方案说明')),
                ('is_active', models.BooleanField(default=True, help_text='下架后不可被新订单选中，历史订单仍保留引用', verbose_name='启用中')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'PCB 方案',
                'verbose_name_plural': 'PCB 方案',
                'ordering': ['-is_active', 'name'],
            },
        ),
        migrations.CreateModel(
            name='PcbPlanMaterial',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity_per_unit', models.DecimalField(decimal_places=2, help_text='每块 PCB 板用多少这个料；扣减时 line.quantity × 此值', max_digits=12, verbose_name='单板用量')),
                ('note', models.CharField(blank=True, default='', max_length=200, verbose_name='备注')),
                ('material', models.ForeignKey(
                    help_text='必须是 category_type=RAW_MATERIAL 的产品',
                    limit_choices_to={'category__category_type': 'RAW_MATERIAL'},
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='used_in_pcb_plans',
                    to='core.product',
                    verbose_name='原材料',
                )),
                ('plan', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='materials',
                    to='core.pcbplan',
                    verbose_name='所属方案',
                )),
            ],
            options={
                'verbose_name': 'PCB 方案明细',
                'verbose_name_plural': 'PCB 方案明细',
                'ordering': ['id'],
                'unique_together': {('plan', 'material')},
            },
        ),
    ]
