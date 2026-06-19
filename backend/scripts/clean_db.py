"""清空业务 + 主数据（保留 User / Group / Permission）。

使用场景：本地走通业务流程前需要一个干净的状态，但又不想每次都
`rm db.sqlite3 + migrate + setup_roles + 重建账号`。

清的：
  - 业务流水：SalesOrder / PurchaseOrder / Shipping / Receiving /
    Production / StockAdjustment / StockLog / FinancialTransaction /
    PartnerLedgerEntry / OrderEvent / PurchaseOrderEvent /
    CustomerPreferredProduct
  - 主数据：Partner / Category / Product / PcbPlan / PcbPlanMaterial

保留的：
  - User / Group / Permission（账号 + 角色，避免清完登不进去）
  - django 内部表 auth_*, django_migrations 等

顺带把 SQLite 的 autoincrement 计数器重置——下次创建 SalesOrder 又从
ID=1 开始，订单号 SO-yyyymmdd-001 也会跟着从 001 起步，方便核对。

用法（在 backend 目录下，激活 venv 后）：

    python manage.py shell -c "from scripts.clean_db import run; run()"

执行有交互确认；要跳过确认（如 CI 或脚本编排）：

    python manage.py shell -c "from scripts.clean_db import run; run(confirm=False)"
"""
from __future__ import annotations

import sys
from typing import Sequence

from django.db import connection, transaction

from core.models import Category, Partner, PcbPlan, PcbPlanMaterial, Product
from business.models import (
    CustomerPreferredProduct,
    FinancialTransaction,
    OrderEvent,
    PartnerLedgerEntry,
    ProductionRecord,
    PurchaseOrder,
    PurchaseOrderEvent,
    PurchaseOrderItem,
    ReceivingLog,
    SalesOrder,
    SalesOrderItem,
    ShippingLog,
    StockAdjustment,
    StockLog,
)


# 删除顺序：从叶向根，避开 PROTECT FK（如 Product 被 PurchaseOrderItem 引用）。
# 每一项 (label, queryset_provider)。
_DELETE_ORDER: Sequence[tuple[str, type]] = (
    # 1) 末梢事件 / 流水（依赖订单 + 明细 + 物料）
    ('ProductionRecord', ProductionRecord),
    ('ShippingLog', ShippingLog),
    ('ReceivingLog', ReceivingLog),
    ('StockLog', StockLog),
    ('StockAdjustment', StockAdjustment),
    ('OrderEvent', OrderEvent),
    ('PurchaseOrderEvent', PurchaseOrderEvent),
    ('CustomerPreferredProduct', CustomerPreferredProduct),
    # 2) 台账 + 金融流水（CASCADE 也会自动清，显式删一次保险）
    ('PartnerLedgerEntry', PartnerLedgerEntry),
    ('FinancialTransaction', FinancialTransaction),
    # 3) 订单明细 → 订单（明细 CASCADE 跟着订单，但先清明细让信号不再误触发）
    ('SalesOrderItem', SalesOrderItem),
    ('PurchaseOrderItem', PurchaseOrderItem),
    ('SalesOrder', SalesOrder),
    ('PurchaseOrder', PurchaseOrder),
    # 4) PCB 方案配方 → 方案
    ('PcbPlanMaterial', PcbPlanMaterial),
    ('PcbPlan', PcbPlan),
    # 5) 主数据
    ('Product', Product),
    ('Category', Category),
    ('Partner', Partner),
)


def _reset_sqlite_autoincrement(table_names: Sequence[str]) -> None:
    """把 SQLite 的 autoincrement 计数器置零——下次插入 ID 从 1 开始。

    仅对 SQLite 后端生效；PostgreSQL/MySQL 走另一套 sequence 重置语法，本
    脚本目前不处理（生产数据库没必要从 1 开始）。
    """
    if connection.vendor != 'sqlite':
        print(f'  ⏭  {connection.vendor} 后端，跳过 autoincrement 重置')
        return
    with connection.cursor() as cursor:
        # sqlite_sequence 表只对 INTEGER PRIMARY KEY AUTOINCREMENT 的表生效。
        # Django 默认的 BigAutoField 走 INTEGER PRIMARY KEY，会有 sequence 行。
        for name in table_names:
            cursor.execute(
                "DELETE FROM sqlite_sequence WHERE name = %s", [name]
            )


def _confirm() -> bool:
    """交互确认。CI 不走这里（调 run(confirm=False) 跳过）。"""
    print()
    print('⚠️  即将清空本地业务 + 主数据。')
    print('   - 删除：SalesOrder / PurchaseOrder / Production / Shipping /')
    print('           Receiving / StockAdjustment / Finance / Partner /')
    print('           Product / Category / PcbPlan 等全部业务表')
    print('   - 保留：User / Group / Permission（账号和角色）')
    print(f'   - 数据库：{connection.settings_dict.get("NAME")}')
    print()
    try:
        answer = input('确认清空？输入 "YES" 继续，其它任何输入取消：').strip()
    except EOFError:
        return False
    return answer == 'YES'


def run(confirm: bool = True) -> None:
    """执行清空。confirm=False 跳过交互（CI 用）。"""
    if confirm and not _confirm():
        print('已取消，未做任何改动')
        sys.exit(0)

    print()
    print('开始清空数据...')
    counts: dict[str, int] = {}
    table_names: list[str] = []

    with transaction.atomic():
        for label, model in _DELETE_ORDER:
            qs = model.objects.all()
            count = qs.count()
            qs.delete()
            counts[label] = count
            table_names.append(model._meta.db_table)
            print(f'  ✓ 删除 {label}: {count} 行')

        # 重置 autoincrement——必须在事务内，让和 DELETE 一起原子化。
        # 不重要：失败也不影响清空，但能让下次创建 ID 从 1 开始。
        try:
            _reset_sqlite_autoincrement(table_names)
            print('  ✓ 重置 SQLite autoincrement 计数器')
        except Exception as e:
            print(f'  ⚠️  重置 autoincrement 失败（不影响清空）：{e}')

    total = sum(counts.values())
    print()
    print(f'完成。共删除 {total} 行业务/主数据。User / Group / Permission 保留。')
    print()
    print('下一步：')
    print('  - 现在可以从 manager 账号登录，从头新建合作方 → 物料 → 订单')
    print('  - 或先跑 python manage.py shell -c "from scripts.seed_mock_data import main; main()" 灌一批演示数据')
