"""BOM 排产系统迁移（2026-05-11）。

包含的变更（详见 docs/PRD.md §3.2 §4 §9.4 changelog）：

1. ``business.StockAdjustment.ADJUSTMENT_TYPES`` 加 ``PRODUCE_CONSUME``
   （只影响 model state，DB 不动）。
2. ``business.SalesOrderItem.product`` 字段加 ``limit_choices_to`` 与
   ``verbose_name='外壳（SELF_MADE）'`` / ``help_text``——历史字段名沿用，
   语义重定位为"外壳槽位"。
3. ``business.SalesOrderItem`` 新增 ``board`` 与 ``cable`` 两个 FK
   （均 nullable + ``SET_NULL`` + ``limit_choices_to`` 各自分类）。
4. 新建 ``business.ProductionOrder`` + ``business.ProductionOrderLine`` 两张表。

注：``core.Category.TYPE_CHOICES`` 加 ``BOARD`` / ``CABLE`` 的 model state
登记拆到 ``core/migrations/0004_category_choices_board_cable.py``，本迁移依赖它。
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('business', '0014_redesign_ledger'),
        # 等 core 0004 把 Category 的 choices state 改完再跑本迁移
        ('core', '0004_category_choices_board_cable'),
    ]

    operations = [
        # 1. StockAdjustment 加 PRODUCE_CONSUME 类型
        migrations.AlterField(
            model_name='stockadjustment',
            name='adjustment_type',
            field=models.CharField(
                choices=[
                    ('MANUAL_IN', '手动入库/盘盈'),
                    ('MANUAL_OUT', '手动出库/盘亏'),
                    ('PRODUCE_IN', '生产入库'),
                    ('PRODUCE_CONSUME', '排产消耗'),
                ],
                max_length=20,
                verbose_name='调整类型',
            ),
        ),

        # 2. SalesOrderItem.product 加 limit_choices_to + verbose_name
        migrations.AlterField(
            model_name='salesorderitem',
            name='product',
            field=models.ForeignKey(
                blank=True,
                help_text='历史字段名，BOM 改造后语义为"外壳"槽位',
                limit_choices_to={'category__category_type': 'SELF_MADE'},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to='core.product',
                verbose_name='外壳（SELF_MADE）',
            ),
        ),

        # 3. SalesOrderItem 加 board + cable FK
        migrations.AddField(
            model_name='salesorderitem',
            name='board',
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={'category__category_type': 'BOARD'},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='core.product',
                verbose_name='板材',
            ),
        ),
        migrations.AddField(
            model_name='salesorderitem',
            name='cable',
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={'category__category_type': 'CABLE'},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='core.product',
                verbose_name='线材',
            ),
        ),

        # 4. 新建 ProductionOrder
        migrations.CreateModel(
            name='ProductionOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('order_no', models.CharField(max_length=50, unique=True, verbose_name='排产单号')),
                ('plan_date', models.DateField(verbose_name='排产日期')),
                ('status', models.CharField(
                    choices=[('PLANNED', '已排产'), ('EXECUTED', '已扣料'), ('CANCELLED', '已取消')],
                    default='PLANNED',
                    max_length=20,
                    verbose_name='状态',
                )),
                ('note', models.CharField(blank=True, max_length=200, verbose_name='备注')),
                ('operator', models.CharField(max_length=50, verbose_name='操作员')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('executed_at', models.DateTimeField(blank=True, null=True, verbose_name='扣料时间')),
            ],
            options={
                'verbose_name': '排产单',
                'verbose_name_plural': '排产单',
                'ordering': ['-plan_date', '-created_at'],
            },
        ),

        # 5. 新建 ProductionOrderLine
        migrations.CreateModel(
            name='ProductionOrderLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('quantity', models.DecimalField(decimal_places=2, max_digits=12, verbose_name='数量')),
                ('note', models.CharField(blank=True, max_length=200, verbose_name='备注')),
                ('production_order', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='lines',
                    to='business.productionorder',
                )),
                ('sales_item', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='production_lines',
                    to='business.salesorderitem',
                    verbose_name='关联销售明细',
                )),
                ('shell', models.ForeignKey(
                    limit_choices_to={'category__category_type': 'SELF_MADE'},
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='+',
                    to='core.product',
                    verbose_name='外壳',
                )),
                ('board', models.ForeignKey(
                    limit_choices_to={'category__category_type': 'BOARD'},
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='+',
                    to='core.product',
                    verbose_name='板材',
                )),
                ('cable', models.ForeignKey(
                    limit_choices_to={'category__category_type': 'CABLE'},
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='+',
                    to='core.product',
                    verbose_name='线材',
                )),
            ],
            options={
                'verbose_name': '排产明细',
                'verbose_name_plural': '排产明细',
            },
        ),
    ]
