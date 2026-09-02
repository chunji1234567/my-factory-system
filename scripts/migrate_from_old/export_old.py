"""从旧 ERP 项目导出合作方 + 物料名录，供人工审阅决定迁移哪些。

用法：
    # 1. 把本文件复制到旧项目根目录（和 manage.py 同级）
    # 2. 修改下面 OLD_APP_NAME 为旧项目里 Partner/Item 所在的 app 名
    # 3. 在旧项目激活 venv，然后运行：
    #        python manage.py shell < export_old.py
    #    或
    #        python manage.py runscript export_old   （如果装了 django-extensions）
    # 4. 会在 /tmp 下生成两个 CSV，用 Excel 打开审阅

输出文件（用 utf-8-sig BOM，Excel 直接打开中文不乱码）：
    /tmp/partners_review.csv
        推断类型（客户 / 供应商 / 两者 / 未知） + 名称 + 状态 +
        入库次数 + 出库次数 + 最后活跃日期
    /tmp/items_review.csv
        名称 + 分类 + 仓库 + 单位 + 当前库存 + 交易次数 + 最后活跃日期

推断规则：
    - 该 partner 有 INBOUND 流水 → 说明它给我们供过货 → 供应商
    - 该 partner 有 OUTBOUND 流水 → 说明我们卖货给它 → 客户
    - 都有 → BOTH
    - 都没有 → 未知（可能是历史遗留，你决定要不要留）
"""
import csv
from datetime import datetime

# ============================================================================
# 修改这里！改成旧项目里 Partner/Item 所在的 app 名
# ============================================================================
OLD_APP_NAME = 'inventory'   # ← 改成你旧项目实际的 app 名，比如 'stock'、'core' 等


# ---- 以下不用改 ----
from django.apps import apps
from django.db.models import Sum, Count, Max, Q

Partner = apps.get_model(OLD_APP_NAME, 'Partner')
Item = apps.get_model(OLD_APP_NAME, 'Item')
StockMove = apps.get_model(OLD_APP_NAME, 'StockMove')
StockBalance = apps.get_model(OLD_APP_NAME, 'StockBalance')


def _fmt_dt(dt):
    if not dt:
        return ''
    return dt.strftime('%Y-%m-%d')


# ---------------------------------------------------------------------------
# 1. 合作方名录 + 推断类型
# ---------------------------------------------------------------------------
print('导出合作方名录...')

# 一次查询拿所有 partner 的入库/出库次数 + 最后活跃日期
partner_stats = (
    Partner.objects
    .annotate(
        inbound_count=Count('stock_moves', filter=Q(stock_moves__move_type='INBOUND')),
        outbound_count=Count('stock_moves', filter=Q(stock_moves__move_type='OUTBOUND')),
        last_move=Max('stock_moves__created_at'),
    )
    .order_by('name')
)

def infer_type(inbound, outbound):
    if inbound > 0 and outbound > 0:
        return '两者'
    if inbound > 0:
        return '供应商'
    if outbound > 0:
        return '客户'
    return '未知'


partners_path = '/tmp/partners_review.csv'
with open(partners_path, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow([
        '推断类型', '名称', '是否启用',
        '入库次数', '出库次数', '最后活跃日期',
        '是否迁移(默认Y 你不要就填N)', '手动指定类型(留空则用推断)',
    ])
    for p in partner_stats:
        w.writerow([
            infer_type(p.inbound_count, p.outbound_count),
            p.name,
            'Y' if p.is_active else 'N',
            p.inbound_count,
            p.outbound_count,
            _fmt_dt(p.last_move),
            'Y',   # 默认迁移，你可以在 Excel 里改成 N 跳过
            '',    # 留空则按"推断类型"走；也可以手动填 客户/供应商/两者
        ])

print(f'  ✓ {partners_path}（共 {partner_stats.count()} 行）')


# ---------------------------------------------------------------------------
# 2. 物料名录 + 当前库存
# ---------------------------------------------------------------------------
print('导出物料名录...')

item_stats = (
    Item.objects
    .select_related('unit', 'warehouse')
    .annotate(
        move_count=Count('moves'),
        last_move=Max('moves__created_at'),
    )
    .order_by('warehouse__warehouse_type', 'category', 'name')
)

# 当前库存：从 StockBalance 汇总（跨仓合并）
balance_map = {}
for b in StockBalance.objects.values('item_id').annotate(total=Sum('on_hand')):
    balance_map[b['item_id']] = b['total'] or 0


# 旧 warehouse_type → 新 category_type 建议映射
TYPE_HINT = {
    'RAW': '原材料',
    'FINISHED': '成品',
    'BOTH': '原材料(默认)',
    '': '未知',
}

items_path = '/tmp/items_review.csv'
with open(items_path, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow([
        '名称', '旧分类(category)', '旧仓库', '仓库类型建议', '单位',
        '当前库存', '交易次数', '最后活跃日期', '是否启用',
        '是否迁移(默认Y 你不要就填N)',
        '新系统分类(你决定：原材料/自产件/板材/线材/成品)',
    ])
    for it in item_stats:
        wtype = it.warehouse.warehouse_type if it.warehouse_id else ''
        w.writerow([
            it.name,
            it.category or '',
            it.warehouse.name if it.warehouse_id else '',
            TYPE_HINT.get(wtype, wtype),
            it.unit.name if it.unit_id else '',
            balance_map.get(it.id, 0),
            it.move_count,
            _fmt_dt(it.last_move),
            'Y' if it.is_active else 'N',
            'Y',
            '',   # 你在 Excel 里为每个物料指定新系统的 5 选 1 分类
        ])

print(f'  ✓ {items_path}（共 {item_stats.count()} 行）')

print()
print('完成。用 Excel 打开这两个 CSV：')
print(f'  Partners: {partners_path}')
print(f'  Items:    {items_path}')
print()
print('审阅步骤建议：')
print('  1. 先看 partners_review.csv：')
print('     - "推断类型" 列过滤 = "未知" 的 → 决定是否保留')
print('     - "手动指定类型" 列可以覆盖推断（比如推断错的）')
print('     - 不想迁的 partner，把 "是否迁移" 改成 N')
print('  2. 再看 items_review.csv：')
print('     - "新系统分类" 列必填！按新系统的 5 类分（原材料/自产件/板材/线材/成品）')
print('     - "是否迁移" 改 N 可跳过')
print('     - 库存数字仅供参考，导入时不会带过来')
print('  3. 审完把这两个 CSV 发过来，我写导入脚本')
