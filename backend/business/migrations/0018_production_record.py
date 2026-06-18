"""BOM-2.1（2026-05-27）：把 ProductionOrder + ProductionOrderLine 替换为
单一的 ProductionRecord（append-only 事件，挂在 SalesOrderItem 下）。

详见 docs/PRD.md §3.2 / §4.5 / §9.4 changelog 2026-05-27（BOM-2.1）。

业务背景：
  "一天一张排产单"在用户实际业务里不是物理单据，只是脑子里的规划动作——
  每天看一眼所有未完成销售订单，决定"今天给某几个订单各做几套"。
  独立 ProductionOrder 主表毫无实际价值，徒增模型复杂度。

  BOM-2.1 重设计：排产 = 给某条 SalesOrderItem 挂一条 ProductionRecord 事件，
  创建即扣料 + append-only。与 ShippingLog 完全对称。

数据影响：
  - ProductionOrder + ProductionOrderLine 两张表删除（开发期测试数据，用户已确认可丢）
  - 新建 ProductionRecord 表
  - SalesOrderItem 不动（property produced_quantity / available_to_ship_quantity
    在 model 层新增，DB 无变化）
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('business', '0017_pcb_plan_replaces_board'),
    ]

    operations = [
        # 1. 删 ProductionOrderLine（先删，因为它 FK 指向 ProductionOrder）
        migrations.DeleteModel(name='ProductionOrderLine'),
        # 2. 删 ProductionOrder
        migrations.DeleteModel(name='ProductionOrder'),
        # 3. 新建 ProductionRecord
        migrations.CreateModel(
            name='ProductionRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('quantity', models.DecimalField(decimal_places=2, max_digits=12, verbose_name='本次产量')),
                ('skip_consumption', models.BooleanField(
                    default=False,
                    help_text=(
                        '仅 admin 内部使用。True 时本条记录不触发扣料信号——用于'
                        '"跨订单挪用已生产成品"等边缘场景（详见 docs/PRD.md §9.3）。'
                    ),
                    verbose_name='跳过扣料',
                )),
                ('operator', models.CharField(max_length=50, verbose_name='操作员')),
                ('note', models.CharField(blank=True, max_length=200, verbose_name='备注')),
                ('executed_at', models.DateTimeField(auto_now_add=True, verbose_name='生产时间')),
                ('sales_item', models.ForeignKey(
                    help_text='必填——所有生产必须挂在销售明细下，不允许备货模式',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='production_records',
                    to='business.salesorderitem',
                    verbose_name='关联销售明细',
                )),
            ],
            options={
                'verbose_name': '排产记录',
                'verbose_name_plural': '排产记录',
                'ordering': ['-executed_at'],
            },
        ),
    ]
