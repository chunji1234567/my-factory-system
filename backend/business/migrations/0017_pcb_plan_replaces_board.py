"""BOM-2.0：把 SalesOrderItem.board / ProductionOrderLine.board 替换为
PCB 方案 FK（PcbPlan）。2026-05-21。

详见 docs/PRD.md §3.2 / §4.5 / §9.4 changelog 2026-05-21（PCB 方案改造）。

背景与决策：
  业务侧实际流程是 PCB 板由外部加工商按方案领料贴片后送回——板材不是"半成品"，
  而是"原材料 + SMT 加工"的结果。把"板材"从半成品 FK 改为 PCB 方案 FK 后，
  排产 EXECUTED 时一次性扣减 1 外壳 + 1 线材 + N 原材料（方案展开），
  系统不再跟踪"中间板材库存"这个会带来 ledger 复杂度的中间态。

数据影响：
  - SalesOrderItem.board 字段被删除（DB 列丢弃）；加 pcb_plan 字段（nullable）。
  - ProductionOrderLine 的 BOM-1.0 数据被清空——业务上 BOM-1.0 排产
    还没真正使用过（dev/test only），用户已明确同意废弃。truncate 后
    重建 board → pcb_plan 字段（PROTECT，required）。
  - 同步清掉 ProductionOrder 表与 SalesOrderItem.board 列（DB 上不留死数据）。
  - Category.BOARD 枚举不删（避免冲击 migration 0004 / 0015），但 PRD §3.1
    标注弃用。

回滚提示：本迁移不可无损回滚——board 字段丢失。如果上线后需要回滚，
应人工导出当前 SalesOrderItem.pcb_plan，再回退 schema，无法自动数据回填。
"""

from django.db import migrations, models
import django.db.models.deletion


def truncate_bom_1_production_data(apps, schema_editor):
    """清掉 BOM-1.0 的排产数据。

    BOM-2.0 schema 与 BOM-1.0 不兼容（board → pcb_plan，配方完全变了）。
    本项目业务上 BOM-1.0 排产从未真正使用过——用户在 2026-05-21 设计
    讨论时确认 BOM-1.0 排产数据可直接废弃。
    """
    ProductionOrderLine = apps.get_model('business', 'ProductionOrderLine')
    ProductionOrder = apps.get_model('business', 'ProductionOrder')
    ProductionOrderLine.objects.all().delete()
    ProductionOrder.objects.all().delete()


def noop_reverse(apps, schema_editor):
    """truncate 不可逆。"""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('business', '0016_remove_stocklog_sale_choice'),
        ('core', '0005_pcbplan_pcbplanmaterial'),
    ]

    operations = [
        # 1. 清掉 BOM-1.0 排产数据（必须在删 board 前做，否则 PROTECT 拦截）
        migrations.RunPython(truncate_bom_1_production_data, reverse_code=noop_reverse),

        # 2. SalesOrderItem: 删 board（业务上没真正用过，直接丢弃）
        migrations.RemoveField(
            model_name='salesorderitem',
            name='board',
        ),
        # 3. SalesOrderItem: 加 pcb_plan（nullable，便于既有 item 平滑过渡——
        #    新建 / 编辑时由 serializer 强制非空）
        migrations.AddField(
            model_name='salesorderitem',
            name='pcb_plan',
            field=models.ForeignKey(
                blank=True,
                help_text='选择一个已启用的 PCB 方案；排产时按方案展开扣减原材料',
                limit_choices_to={'is_active': True},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='core.pcbplan',
                verbose_name='PCB 方案',
            ),
        ),

        # 4. ProductionOrderLine: 删 board（PROTECT，需要先 truncate 完成）
        migrations.RemoveField(
            model_name='productionorderline',
            name='board',
        ),
        # 5. ProductionOrderLine: 加 pcb_plan（PROTECT，表已空所以可以直接 required）
        migrations.AddField(
            model_name='productionorderline',
            name='pcb_plan',
            field=models.ForeignKey(
                help_text='排产时按此方案展开为原材料清单扣减库存',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='+',
                to='core.pcbplan',
                verbose_name='PCB 方案',
            ),
        ),
    ]
