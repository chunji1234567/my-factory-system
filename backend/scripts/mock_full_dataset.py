"""Mock 完整业务数据集种子脚本（2026-06-19）。

按用户需求落地——为流程演示/截图/培训准备一份"足够真实"的数据集：

  ① 20 个外壳（SELF_MADE 分类下）+ 20 个线材（CABLE 分类下）
  ② 100 客户 + 100 供应商（程序化生成，名字唯一）
  ③ 100 销售订单 + 100 采购订单，明细数量分布、备注有无、交期有无随机化

设计约定：
  * 分类查找：先按 (category_type, name='外壳'/'线材') 找用户已建的分类，
    找不到再自动新建。这样既兼容用户已经手建分类的情况，又能裸跑。
  * 物料命名走"用途 + 颜色 + 接口"约定，符合小充电器工厂的实际产线习惯。
  * internal_code 自动编号：SHE-001~SHE-020（外壳）/ CAB-001~CAB-020（线材）。
  * 客户/供应商名字程序化生成（城市 + 业务关键词 + 编号 + 后缀），保证唯一。
  * 订单明细数量分布：
        30% 单条（1 件）
        40% 中等（2-3 件）
        20% 多件（4-6 件）
        10% 巨型（7-10 件）
    备注：60% 留空、40% 写一段细节；交期 70% 填、30% 留空。
  * 订单号按过去 60 天日期分散——避免全部 SO-20260619-001~100 这种假数据
    味很重的连号；这样后续按"最近 7 天 / 30 天"筛选都有数据可看。
  * 销售明细必须挂三件套（外壳 + PCB 方案 + 线材），符合 BOM-2.0；
    采购明细 90% 用原材料、10% 用外壳/线材（模拟外采半成品场景）。

幂等：
  * 分类 / 物料 / 合作方走 get_or_create，重复跑不会重复造。
  * 订单 **不**幂等——每次跑都会创建 100+100 张新单。这是有意为之：
    一份完整的"100 SO + 100 PO"数据集是一次性的种子；要重新铺数据请先
    `scripts/clean_db.py run()`。

依赖：
  * 推荐先跑 scripts/mock_inventory.py（创建 20 个原材料分类 + 100 件
    RAW_MATERIAL + 5 个 PCB 方案）。采购订单需要原材料 SKU，销售订单
    需要 PCB 方案 FK。本脚本里有兜底：找不到原材料/方案会自动跳过相应
    部分并打印警告。

用法（在 backend 目录下，激活 venv 后）：

    python manage.py shell -c "from scripts.mock_full_dataset import run; run()"
"""
from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.utils import timezone

from core.models import Category, PcbPlan, Partner, Product
from business.models import (
    PurchaseOrder,
    PurchaseOrderEvent,
    PurchaseOrderItem,
    SalesOrder,
    SalesOrderItem,
)


# 固定 seed，保证每次跑出来同一批数据（方便对比 / 截图复刻）。
random.seed(42)


# ---------------------------------------------------------------------------
# 20 种外壳（SELF_MADE 半成品） —— 真实小充电器外壳产线常见型号
# ---------------------------------------------------------------------------
_SHELL_SPECS = [
    '5W 直插 PC 壳 白',
    '5W 直插 PC 壳 黑',
    '5W 折叠插脚 白',
    '5W 折叠插脚 黑',
    '10W 双 USB-A 白',
    '10W 双 USB-A 黑',
    '10W 单口磨砂 金',
    '10W 单口磨砂 银',
    '20W PD USB-C 白',
    '20W PD USB-C 黑',
    '20W PD 三角形 白',
    '20W PD 三角形 黑',
    '30W 多口 白',
    '30W 多口 黑',
    '30W 桌面充 黑',
    '30W 桌面充 星空灰',
    '5V/1A 简易 白',
    '5V/1A 简易 黑',
    '5V/1A 简易 透明',
    '5V/1A 简易 玫瑰金',
]

# ---------------------------------------------------------------------------
# 20 种线材（CABLE 半成品） —— 不同接口 / 长度 / 颜色 / 工艺
# ---------------------------------------------------------------------------
_CABLE_SPECS = [
    'USB-A → USB-C 1m 白',
    'USB-A → USB-C 1m 黑',
    'USB-A → USB-C 2m 白',
    'USB-A → USB-C 2m 黑',
    'USB-A → Lightning 1m 白',
    'USB-A → Lightning 1m 黑',
    'USB-A → Lightning 2m 白',
    'USB-A → Micro-B 1m 白',
    'USB-A → Micro-B 1m 黑',
    'USB-C → USB-C 1m 白 PD',
    'USB-C → USB-C 1m 黑 PD',
    'USB-C → USB-C 2m 编织 灰',
    'USB-C → Lightning 1m 白 PD',
    'USB-C → Lightning 1m 黑 PD',
    'USB-C → Lightning 2m 白 PD',
    'Type-C 母 → USB-A 公 转接头',
    '一拖三 USB-A 1.2m 黑',
    '一拖三 USB-C 1.2m 黑',
    '弯头 USB-C 0.5m 短线 白',
    '磁吸 USB-C 1m 黑',
]


# ---------------------------------------------------------------------------
# 名字生成池——城市 + 业务关键词 + 后缀，组合保证 100 个唯一
# ---------------------------------------------------------------------------
_CITIES = [
    '上海', '深圳', '广州', '北京', '杭州', '苏州', '南京', '义乌',
    '温州', '宁波', '福州', '泉州', '佛山', '东莞', '中山', '珠海',
    '武汉', '长沙', '成都', '西安',
]

_CUSTOMER_BIZ = [
    '数码', '电子', '科技', '商贸', '智能', '通讯', '电器', '进出口',
    '贸易', '创新',
]
_CUSTOMER_DISTINCT = [
    '宏图', '腾飞', '盛达', '佳缘', '万方', '环球', '汇丰', '兴隆',
    '锦绣', '美佳',
]

_SUPPLIER_BIZ = [
    '电子元件', '电源', '塑胶', '化工', '包装', '半导体', '电容', '元器件',
    '材料', '五金',
]
_SUPPLIER_DISTINCT = [
    '鸿泰', '昌盛', '永固', '海川', '振华', '德邦', '泰丰', '广源',
    '隆兴', '富强',
]

_SUFFIXES = ['有限公司', '股份有限公司']

# 操作员名（录单员 / 采购员）池
_OPERATORS = ['周静', '李伟', '王芳', '陈军', '刘洋']


def _gen_names(cities, biz, distinct, suffixes, count: int) -> list[str]:
    """组合生成 count 个唯一名字。

    组合空间 = 20 城市 × 10 业务 × 10 名字 × 2 后缀 = 4000 种，远大于 100。
    用 random.sample 保证不重复。
    """
    combos = [
        f'{city}{name}{b}{suffix}'
        for city in cities
        for b in biz
        for name in distinct
        for suffix in suffixes
    ]
    return random.sample(combos, count)


# ---------------------------------------------------------------------------
# 销售明细的"客户侧产品名"和"细节描述"模板
# ---------------------------------------------------------------------------
_SALES_NAME_TEMPLATES = [
    '充电器 {power}W 套装',
    '充电头 + 数据线 套装 {power}W',
    '{power}W 快充套装',
    '便携充电器 {power}W',
    '智能快充 {power}W 配线套装',
    '苹果适配 {power}W 充电套装',
]

_SALES_DETAIL_TEMPLATES = [
    '线长按客户要求做 {length}m，不带包装。',
    '外箱按 50 套 / 箱打包，分两批送。',
    '客户要求出厂前贴自家品牌标签。',
    'PCB 焊点要做 100% 通电测试。',
    '颜色严格按色卡 PMS {pms} 对样。',
    '加急单，要求 7 天交付。',
]


def _ensure_category(name: str, category_type: str) -> Category:
    """优先按 (category_type, name) 找已存在的分类；找不到再建。"""
    cat = Category.objects.filter(category_type=category_type, name=name).first()
    if cat:
        return cat
    return Category.objects.create(name=name, category_type=category_type)


def _create_products(category: Category, code_prefix: str, specs: list[str]) -> list[Product]:
    """在指定分类下创建一批物料；幂等。"""
    products = []
    for idx, spec in enumerate(specs, start=1):
        code = f'{code_prefix}-{idx:03d}'
        product, _ = Product.objects.get_or_create(
            internal_code=code,
            defaults={
                'category': category,
                'model_name': spec,
                'unit': '个',
                'stock_quantity': Decimal('0'),
                'min_stock': Decimal('100'),
            },
        )
        products.append(product)
    return products


def _create_partners(names: list[str], partner_type: str) -> list[Partner]:
    """批量 get_or_create 合作方。"""
    partners = []
    for name in names:
        p, _ = Partner.objects.get_or_create(
            name=name,
            defaults={'partner_type': partner_type},
        )
        partners.append(p)
    return partners


# ---------------------------------------------------------------------------
# 订单明细数量随机分档
# ---------------------------------------------------------------------------
def _pick_item_count() -> int:
    """按 30/40/20/10 概率分布抽明细数量。"""
    r = random.random()
    if r < 0.30:
        return 1
    if r < 0.70:
        return random.randint(2, 3)
    if r < 0.90:
        return random.randint(4, 6)
    return random.randint(7, 10)


def _spread_date(days_back: int = 60) -> datetime:
    """过去 days_back 天内随机一个 datetime（带工厂上班时间感）。"""
    days = random.randint(0, days_back)
    d = date.today() - timedelta(days=days)
    # 工厂上班时间 8:00 - 18:00 内随机
    h = random.randint(8, 17)
    m = random.randint(0, 59)
    naive = datetime.combine(d, time(h, m))
    return timezone.make_aware(naive) if timezone.is_naive(naive) else naive


# ---------------------------------------------------------------------------
# 销售订单
# ---------------------------------------------------------------------------
def _create_sales_orders(
    *,
    customers: list[Partner],
    shells: list[Product],
    cables: list[Product],
    pcb_plans: list[PcbPlan],
    count: int = 100,
) -> int:
    """创建 count 个销售订单，明细随机组合三件套。

    返回实际创建数量（如 PCB 方案为空会跳过整个 SO）。

    订单号策略（2026-06-19 改）：年内全局 4 位连续序号，跨年重置。
    生成步骤：
      1. 先抽 count 个随机日期
      2. 按日期升序排——保证序号顺序 = 时间顺序，方便后续读单
      3. 维护 yearly_counter[year] 字典，每条 +1
      4. 拼成 SO-yyyymmdd-NNNN
    """
    if not pcb_plans:
        print('  ⚠ 没有任何 PCB 方案，跳过销售订单创建')
        return 0
    if not shells or not cables:
        print('  ⚠ 外壳或线材为空，跳过销售订单创建')
        return 0

    # 先生成全部日期再排序，序号才能按时间单调递增
    created_dts = sorted(_spread_date(60) for _ in range(count))
    yearly_counter: dict[int, int] = {}
    created = 0

    for created_dt in created_dts:
        year = created_dt.year
        yearly_counter[year] = yearly_counter.get(year, 0) + 1
        order_no = f'SO-{created_dt.strftime("%Y%m%d")}-{yearly_counter[year]:04d}'

        customer = random.choice(customers)
        operator = random.choice(_OPERATORS)
        # 70% 有交期，30% 无
        expected = (
            created_dt.date() + timedelta(days=random.randint(7, 45))
            if random.random() < 0.70 else None
        )

        so = SalesOrder.objects.create(
            order_no=order_no,
            partner=customer,
            operator=operator,
            expected_delivery_date=expected,
        )
        # created_at 是 auto_now_add，需要 update 一下把日期分散开
        SalesOrder.objects.filter(pk=so.pk).update(created_at=created_dt)

        n_items = _pick_item_count()
        total = Decimal('0')
        for _ in range(n_items):
            shell = random.choice(shells)
            cable = random.choice(cables)
            plan = random.choice(pcb_plans)
            qty = Decimal(random.randint(10, 500))
            # 价格按功率粗调：30W 套装 > 20W > 10W > 5W
            price = Decimal(str(round(random.uniform(15.0, 45.0), 2)))
            # 40% 有详细备注
            detail = ''
            if random.random() < 0.40:
                tpl = random.choice(_SALES_DETAIL_TEMPLATES)
                detail = tpl.format(
                    length=random.choice([1, 1.2, 1.5, 2]),
                    pms=random.choice(['11-0601', '419 C', '7460 C', '186 C']),
                )

            name_tpl = random.choice(_SALES_NAME_TEMPLATES)
            custom_name = name_tpl.format(
                power=random.choice([5, 10, 20, 30]),
            )

            SalesOrderItem.objects.create(
                order=so,
                custom_product_name=custom_name,
                detail_description=detail,
                product=shell,
                pcb_plan=plan,
                cable=cable,
                price=price,
                quantity=qty,
            )
            total += price * qty

        # 把 total_amount 落库（serializer 路径会自动算，ORM 直接 create 需要补）
        so.total_amount = total
        so.save(update_fields=['total_amount'])
        created += 1

    return created


# ---------------------------------------------------------------------------
# 采购订单
# ---------------------------------------------------------------------------
def _create_purchase_orders(
    *,
    suppliers: list[Partner],
    raw_materials: list[Product],
    half_finished: list[Product],
    count: int = 100,
) -> int:
    """创建 count 个采购订单。

    90% 明细买原材料、10% 明细外采半成品（外壳/线材外协场景）。
    """
    if not raw_materials and not half_finished:
        print('  ⚠ 没有任何可采购物料，跳过采购订单创建')
        return 0

    # 同销售：先排序再分配年内连续 4 位序号（详见 _create_sales_orders 注释）
    created_dts = sorted(_spread_date(60) for _ in range(count))
    yearly_counter: dict[int, int] = {}
    created = 0

    for created_dt in created_dts:
        year = created_dt.year
        yearly_counter[year] = yearly_counter.get(year, 0) + 1
        order_no = f'PO-{created_dt.strftime("%Y%m%d")}-{yearly_counter[year]:04d}'

        supplier = random.choice(suppliers)
        operator = random.choice(_OPERATORS)
        expected = (
            created_dt.date() + timedelta(days=random.randint(3, 21))
            if random.random() < 0.70 else None
        )

        po = PurchaseOrder.objects.create(
            order_no=order_no,
            partner=supplier,
            operator=operator,
            expected_arrival_date=expected,
        )
        PurchaseOrder.objects.filter(pk=po.pk).update(created_at=created_dt)

        n_items = _pick_item_count()
        used_products: set[int] = set()
        total = Decimal('0')
        for _ in range(n_items):
            # 10% 概率采购半成品（如果有的话），否则采购原材料
            if half_finished and random.random() < 0.10:
                pool = half_finished
            else:
                pool = raw_materials or half_finished

            # 同一订单内尽量不重复采购同一 SKU
            candidates = [p for p in pool if p.id not in used_products]
            if not candidates:
                # 已经把池子用完了，允许重复
                candidates = pool
            product = random.choice(candidates)
            used_products.add(product.id)

            qty = Decimal(random.randint(100, 5000))
            # 原材料单价偏低（¥0.05 ~ ¥3），半成品偏高（¥5 ~ ¥25）
            if product in half_finished:
                price = Decimal(str(round(random.uniform(5.0, 25.0), 2)))
            else:
                price = Decimal(str(round(random.uniform(0.05, 3.0), 2)))

            PurchaseOrderItem.objects.create(
                order=po,
                product=product,
                price=price,
                quantity=qty,
            )
            total += price * qty

        po.total_amount = total
        po.save(update_fields=['total_amount'])

        # 40% 有 REMARK 事件（订单备注）
        if random.random() < 0.40:
            remark_pool = [
                '供应商承诺质量符合 RoHS。',
                '价格已锁定本季度。',
                '需供应商提供 COC 证书。',
                '到货后做抽检（按 5% 比例）。',
                '此供应商首次合作，注意验货。',
                '紧急补料单，请加急安排。',
            ]
            PurchaseOrderEvent.objects.create(
                order=po,
                event_type='REMARK',
                content=random.choice(remark_pool),
                operator=operator,
            )

        created += 1

    return created


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def run() -> None:
    print('=' * 60)
    print('mock_full_dataset：创建外壳/线材 + 200 合作方 + 200 订单')
    print('=' * 60)

    with transaction.atomic():
        # —— 物料 ————————————————————————————————————————————————————
        print('\n[1/4] 准备外壳 / 线材分类...')
        shell_cat = _ensure_category('外壳', 'SELF_MADE')
        cable_cat = _ensure_category('线材', 'CABLE')
        print(f'   外壳分类：{shell_cat.name} (id={shell_cat.id})')
        print(f'   线材分类：{cable_cat.name} (id={cable_cat.id})')

        print('\n[2/4] 创建 20 个外壳 + 20 个线材...')
        shells = _create_products(shell_cat, 'SHE', _SHELL_SPECS)
        cables = _create_products(cable_cat, 'CAB', _CABLE_SPECS)
        print(f'   ✓ 外壳：{len(shells)} 个')
        print(f'   ✓ 线材：{len(cables)} 个')

        # —— 合作方 ——————————————————————————————————————————————————
        print('\n[3/4] 创建 100 客户 + 100 供应商...')
        customer_names = _gen_names(
            _CITIES, _CUSTOMER_BIZ, _CUSTOMER_DISTINCT, _SUFFIXES, 100,
        )
        supplier_names = _gen_names(
            _CITIES, _SUPPLIER_BIZ, _SUPPLIER_DISTINCT, _SUFFIXES, 100,
        )
        customers = _create_partners(customer_names, 'CUSTOMER')
        suppliers = _create_partners(supplier_names, 'SUPPLIER')
        print(f'   ✓ 客户：{len(customers)} 家')
        print(f'   ✓ 供应商：{len(suppliers)} 家')

        # —— 订单 ————————————————————————————————————————————————————
        print('\n[4/4] 创建 100 销售订单 + 100 采购订单...')
        pcb_plans = list(PcbPlan.objects.filter(is_active=True))
        raw_materials = list(
            Product.objects.filter(category__category_type='RAW_MATERIAL')
        )
        half_finished = shells + cables

        if not pcb_plans:
            print('   ⚠ 没找到任何启用的 PCB 方案——销售订单会跳过')
            print('     请先跑 scripts/mock_inventory.py 创建 PCB 方案')
        if not raw_materials:
            print('   ⚠ 没找到任何原材料——采购订单只会采购半成品')

        n_so = _create_sales_orders(
            customers=customers,
            shells=shells,
            cables=cables,
            pcb_plans=pcb_plans,
            count=100,
        )
        n_po = _create_purchase_orders(
            suppliers=suppliers,
            raw_materials=raw_materials,
            half_finished=half_finished,
            count=100,
        )
        print(f'   ✓ 销售订单：{n_so} 张')
        print(f'   ✓ 采购订单：{n_po} 张')

    # —— 汇总 ————————————————————————————————————————————————————————
    print('\n' + '=' * 60)
    print('完成。当前数据库状态：')
    print(f'  Categories             {Category.objects.count()}')
    print(f'  Products               {Product.objects.count()}')
    print(f'  PcbPlans               {PcbPlan.objects.count()}')
    print(f'  Partners (CUSTOMER)    {Partner.objects.filter(partner_type="CUSTOMER").count()}')
    print(f'  Partners (SUPPLIER)    {Partner.objects.filter(partner_type="SUPPLIER").count()}')
    print(f'  SalesOrders            {SalesOrder.objects.count()}')
    print(f'  SalesOrderItems        {SalesOrderItem.objects.count()}')
    print(f'  PurchaseOrders         {PurchaseOrder.objects.count()}')
    print(f'  PurchaseOrderItems     {PurchaseOrderItem.objects.count()}')
    print('=' * 60)


if __name__ == '__main__':  # pragma: no cover
    import django
    import os
    import sys
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    django.setup()
    run()
