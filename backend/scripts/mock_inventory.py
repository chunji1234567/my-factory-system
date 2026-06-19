"""Mock 库存 + PCB 方案种子脚本（小型充电器电源 BOM 风格）。

按用户需求（2026-06-18）落地：
  - 20 个原材料分类（RAW_MATERIAL），每分类 5 种型号，共 100 件
  - 库存初始数量都 0（系统模型实际就是 stock 字段，等收货后才 += ）
  - 5 个 PCB 方案，按真实小充电器 BOM 组合上述 100 件原材料
    - 5W USB-A（苹果原厂风格）
    - 10W USB-A 双口
    - 20W PD USB-C 快充
    - 30W 多口（USB-A + USB-C）
    - 5V/1A 简易壁挂

设计取舍：
  * 物料命名走"分类前缀 + 型号"约定：R-1K-0805 / IC-OB2335 / T-EE13-5W 等
  * internal_code 用"分类拼音首字母 + 序号"约定：RES-001 ~ RES-005，类似工厂
    台账常见做法
  * 单位都用"只"——小元件统一计数单位
  * 安全库存（min_stock）按业务直觉给：高频小元件（电阻电容）给 1000；
    芯片变压器等贵元件给 50；标签焊料类给 200
  * BOM quantity_per_unit 按一块板上用几个填——电阻可能 4 个、IC 1 个

幂等：所有创建都走 get_or_create，重复运行不会重复造、不会报 unique 冲突。

用法（在 backend 目录下，激活 venv 后）：

    python manage.py shell -c "from scripts.mock_inventory import run; run()"

运行前建议先 `scripts/clean_db.py run()` 清干净；不清也能跑（已有的会跳过）。
"""
from __future__ import annotations

from decimal import Decimal
from typing import NamedTuple

from core.models import Category, PcbPlan, PcbPlanMaterial, Product


# ---------------------------------------------------------------------------
# 20 个原材料分类
# ---------------------------------------------------------------------------
_CATEGORIES = (
    '电阻',
    '电容',
    '电感',
    '二极管',
    '三极管 / MOSFET',
    '集成电路',
    '变压器',
    '整流桥',
    '保险丝',
    '光耦',
    'TVS / 压敏电阻',
    '共模电感',
    '排针 / 排座',
    'USB 接口',
    '裸 PCB 板',
    '散热片',
    '端子',
    '导线',
    '焊料',
    '认证标签',
)


# ---------------------------------------------------------------------------
# 每个分类下 5 个物料
# 字段：内部编号前缀，[(model_name, internal_code_suffix, min_stock), ...]
# ---------------------------------------------------------------------------
class _Item(NamedTuple):
    model_name: str
    code_suffix: str
    min_stock: int


_PRODUCTS_BY_CATEGORY: dict[str, tuple[str, tuple[_Item, ...]]] = {
    '电阻': ('RES', (
        _Item('电阻 100Ω 0805 1/8W',  '001', 2000),
        _Item('电阻 1KΩ 0805',          '002', 2000),
        _Item('电阻 10KΩ 0805',         '003', 2000),
        _Item('电阻 470KΩ 1206',        '004', 1500),
        _Item('电阻 2.2MΩ 1206',        '005', 1500),
    )),
    '电容': ('CAP', (
        _Item('电容 10nF 50V 0603',     '001', 2000),
        _Item('电容 100nF 50V 0805',    '002', 2000),
        _Item('电容 10uF 25V 1206',     '003', 1500),
        _Item('电容 100uF 25V 电解',    '004', 1000),
        _Item('电容 470uF 25V 电解',    '005', 800),
    )),
    '电感': ('IND', (
        _Item('电感 10uH CD43',         '001', 600),
        _Item('电感 22uH CD43',         '002', 600),
        _Item('电感 100uH DR8x10',      '003', 500),
        _Item('电感 470uH DR8x10',      '004', 500),
        _Item('电感 2.2mH SMD',         '005', 400),
    )),
    '二极管': ('DIO', (
        _Item('二极管 1N4007 整流',     '001', 1500),
        _Item('二极管 SS14 肖特基',     '002', 1200),
        _Item('二极管 1N4148 开关',     '003', 1500),
        _Item('稳压 5.1V 0.5W',         '004', 600),
        _Item('稳压 12V 0.5W',          '005', 500),
    )),
    '三极管 / MOSFET': ('TRA', (
        _Item('三极管 S8050 NPN',       '001', 1200),
        _Item('三极管 S8550 PNP',       '002', 1200),
        _Item('三极管 MJE13003 高压',   '003', 600),
        _Item('MOSFET AOD2530 30V',     '004', 400),
        _Item('MOSFET IRFR3710 100V',   '005', 300),
    )),
    '集成电路': ('ICC', (
        _Item('双运放 LM358',           '001', 300),
        _Item('PWM 控制 SY5800',        '002', 300),
        _Item('PWM 控制 LD7591',        '003', 300),
        _Item('开关电源 OB2335',        '004', 300),
        _Item('PWM 控制 FA5601',        '005', 250),
    )),
    '变压器': ('TRN', (
        _Item('变压器 EE13 5W',         '001', 200),
        _Item('变压器 EE16 10W',        '002', 200),
        _Item('变压器 EE19 15W',        '003', 150),
        _Item('变压器 EE25 20W',        '004', 150),
        _Item('变压器 EFD25 30W',       '005', 100),
    )),
    '整流桥': ('BRG', (
        _Item('整流桥 MB10S',           '001', 600),
        _Item('整流桥 DB207',           '002', 600),
        _Item('整流桥 DB157',           '003', 500),
        _Item('整流桥 KBP206',          '004', 400),
        _Item('整流桥 GBJ8',            '005', 300),
    )),
    '保险丝': ('FUS', (
        _Item('保险丝 2A 250V',         '001', 800),
        _Item('保险丝 3A 250V',         '002', 800),
        _Item('保险丝 5A 250V',         '003', 600),
        _Item('保险丝 T1A 慢断 250V',   '004', 500),
        _Item('PTC 自恢复保险丝 60V',   '005', 500),
    )),
    '光耦': ('OPC', (
        _Item('光耦 PC817',             '001', 1000),
        _Item('光耦 EL817',             '002', 1000),
        _Item('光耦 LTV817',            '003', 800),
        _Item('光耦 TLP521',            '004', 600),
        _Item('光耦 PC817C 高 CTR',     '005', 500),
    )),
    'TVS / 压敏电阻': ('TVS', (
        _Item('TVS SMBJ12CA',           '001', 800),
        _Item('压敏 MOV 10D561K',       '002', 800),
        _Item('压敏 MOV 14D561K',       '003', 600),
        _Item('TVS SMAJ15CA',           '004', 500),
        _Item('压敏 7D471K',            '005', 500),
    )),
    '共模电感': ('CMC', (
        _Item('共模电感 UU9.8 2mH',     '001', 500),
        _Item('共模电感 UU9.8 10mH',    '002', 500),
        _Item('共模电感 UU10.5 20mH',   '003', 400),
        _Item('共模电感 UU16 2mH',      '004', 300),
        _Item('共模电感 UU16 5mH',      '005', 300),
    )),
    '排针 / 排座': ('PHD', (
        _Item('排针 2.54mm 2P',         '001', 2000),
        _Item('排针 2.54mm 4P',         '002', 2000),
        _Item('排针 2.54mm 6P',         '003', 1500),
        _Item('排针 1.25mm 2P',         '004', 1500),
        _Item('排针 1.27mm 3P',         '005', 1200),
    )),
    'USB 接口': ('USB', (
        _Item('USB-A 母座 直插',        '001', 800),
        _Item('USB-C 母座 16P',         '002', 500),
        _Item('Micro-B 母座',           '003', 600),
        _Item('USB-A 公头',             '004', 600),
        _Item('Lightning 公头',         '005', 400),
    )),
    '裸 PCB 板': ('PCB', (
        _Item('裸板 5W 充电器 v1',      '001', 300),
        _Item('裸板 10W 充电器 v1',     '002', 300),
        _Item('裸板 20W 快充 v1',       '003', 250),
        _Item('裸板 30W 多口 v1',       '004', 200),
        _Item('裸板 5V 1A 简易 v1',     '005', 400),
    )),
    '散热片': ('HSK', (
        _Item('散热片 铝 15x15',        '001', 500),
        _Item('散热片 铝 20x20',        '002', 400),
        _Item('散热片 铝 25x25',        '003', 300),
        _Item('散热片 铜 15x15',        '004', 200),
        _Item('导热硅胶垫 20x20',       '005', 800),
    )),
    '端子': ('TRM', (
        _Item('AC 输入端子 3P',         '001', 800),
        _Item('DC 输出端子 2.54',       '002', 800),
        _Item('螺钉端子 2P',            '003', 600),
        _Item('螺钉端子 3P',            '004', 500),
        _Item('FASTON 6.3mm',           '005', 600),
    )),
    '导线': ('WIR', (
        _Item('AWG22 红色 1m',          '001', 1000),
        _Item('AWG22 黑色 1m',          '002', 1000),
        _Item('AWG18 红色 1m',          '003', 800),
        _Item('AWG18 黑色 1m',          '004', 800),
        _Item('排线 跳线套装',          '005', 200),
    )),
    '焊料': ('SOL', (
        _Item('焊锡 Sn99 1mm 100g',     '001', 400),
        _Item('焊锡 Sn63Pb37 0.8mm 100g', '002', 300),
        _Item('松香 助焊剂 50ml',       '003', 500),
        _Item('免清洗 助焊剂 100ml',    '004', 400),
        _Item('焊膏 Sn63 30g',          '005', 200),
    )),
    '认证标签': ('LBL', (
        _Item('CE 认证标签',            '001', 2000),
        _Item('FCC 认证标签',           '002', 2000),
        _Item('CCC 认证标签',           '003', 2000),
        _Item('品牌 LOGO 贴',           '004', 3000),
        _Item('序列号条码贴',           '005', 3000),
    )),
}


# ---------------------------------------------------------------------------
# 5 个 PCB 方案 BOM
# 每条 = (方案名, 方案 code, 描述, [(物料 model_name, 单板用量), ...])
# 物料 model_name 用上面 _PRODUCTS_BY_CATEGORY 里实际填的中文名做 key
# ---------------------------------------------------------------------------
_PCB_PLANS = (
    {
        'name': '5W USB-A 充电器（苹果原厂风格）',
        'code': 'PCB-CHG-5W-A',
        'description': '基础 5W、5V/1A、单 USB-A 输出。变压器 EE13、PWM OB2335、整流桥 DB207、电解电容输入 470uF 输出 100uF。',
        'materials': [
            ('裸板 5W 充电器 v1', 1),
            ('变压器 EE13 5W',    1),
            ('USB-A 母座 直插',   1),
            ('开关电源 OB2335',    1),
            ('整流桥 DB207',       1),
            ('三极管 MJE13003 高压', 1),
            ('电容 10uF 25V 1206', 2),
            ('电容 100uF 25V 电解', 1),
            ('电容 470uF 25V 电解', 1),
            ('电容 10nF 50V 0603', 1),
            ('电容 100nF 50V 0805', 2),
            ('电阻 10KΩ 0805',     4),
            ('电阻 100Ω 0805 1/8W', 2),
            ('电阻 470KΩ 1206',    2),
            ('电阻 2.2MΩ 1206',    1),
            ('二极管 1N4007 整流',  1),
            ('二极管 SS14 肖特基',  1),
            ('稳压 5.1V 0.5W',     1),
            ('光耦 PC817',         1),
            ('保险丝 2A 250V',     1),
            ('压敏 MOV 10D561K',   1),
            ('共模电感 UU9.8 2mH', 1),
            ('CCC 认证标签',       1),
            ('品牌 LOGO 贴',       1),
        ],
    },
    {
        'name': '10W USB-A 双口充电器',
        'code': 'PCB-CHG-10W-2A',
        'description': '双 USB-A 共享 5V/2A、约 10W。变压器 EE16、PWM LD7591、双输出整流。',
        'materials': [
            ('裸板 10W 充电器 v1',  1),
            ('变压器 EE16 10W',     1),
            ('USB-A 母座 直插',     2),
            ('PWM 控制 LD7591',     1),
            ('整流桥 DB207',        1),
            ('三极管 MJE13003 高压', 1),
            ('电容 10uF 25V 1206',  4),
            ('电容 100uF 25V 电解', 2),
            ('电容 470uF 25V 电解', 1),
            ('电容 10nF 50V 0603',  1),
            ('电容 100nF 50V 0805', 3),
            ('电阻 10KΩ 0805',      6),
            ('电阻 1KΩ 0805',       2),
            ('电阻 100Ω 0805 1/8W', 2),
            ('电阻 470KΩ 1206',     2),
            ('电阻 2.2MΩ 1206',     1),
            ('二极管 1N4007 整流',  1),
            ('二极管 SS14 肖特基',  2),
            ('稳压 5.1V 0.5W',      1),
            ('光耦 PC817',          1),
            ('保险丝 3A 250V',      1),
            ('压敏 MOV 10D561K',    1),
            ('共模电感 UU9.8 2mH',  1),
            ('散热片 铝 15x15',     1),
            ('CCC 认证标签',        1),
            ('品牌 LOGO 贴',        1),
        ],
    },
    {
        'name': '20W PD USB-C 快充',
        'code': 'PCB-CHG-20W-PD',
        'description': '20W PD 协议、单 USB-C 输出。支持 5V/3A、9V/2.22A、12V/1.67A。芯片 SY5800、MOSFET AOD2530。',
        'materials': [
            ('裸板 20W 快充 v1',     1),
            ('变压器 EE19 15W',      1),
            ('USB-C 母座 16P',       1),
            ('PWM 控制 SY5800',      1),
            ('双运放 LM358',         1),
            ('整流桥 DB157',         1),
            ('MOSFET AOD2530 30V',   1),
            ('三极管 S8050 NPN',     2),
            ('电容 10uF 25V 1206',   6),
            ('电容 100uF 25V 电解',  2),
            ('电容 470uF 25V 电解',  1),
            ('电容 10nF 50V 0603',   2),
            ('电容 100nF 50V 0805',  5),
            ('电感 22uH CD43',       1),
            ('电感 100uH DR8x10',    1),
            ('电阻 10KΩ 0805',       8),
            ('电阻 1KΩ 0805',        4),
            ('电阻 100Ω 0805 1/8W',  4),
            ('电阻 470KΩ 1206',      2),
            ('电阻 2.2MΩ 1206',      1),
            ('二极管 SS14 肖特基',    3),
            ('二极管 1N4148 开关',    2),
            ('稳压 12V 0.5W',         1),
            ('光耦 PC817C 高 CTR',    1),
            ('保险丝 3A 250V',        1),
            ('TVS SMAJ15CA',          1),
            ('压敏 MOV 14D561K',      1),
            ('共模电感 UU10.5 20mH',  1),
            ('散热片 铝 20x20',       1),
            ('FCC 认证标签',          1),
            ('CCC 认证标签',          1),
            ('品牌 LOGO 贴',          1),
        ],
    },
    {
        'name': '30W 多口充电器（USB-A + USB-C）',
        'code': 'PCB-CHG-30W-MULTI',
        'description': '一 USB-A + 一 USB-C，总功率 30W；可同时输出。变压器 EFD25、主控 FA5601、主开关 IRFR3710。',
        'materials': [
            ('裸板 30W 多口 v1',      1),
            ('变压器 EFD25 30W',      1),
            ('USB-A 母座 直插',       1),
            ('USB-C 母座 16P',        1),
            ('PWM 控制 FA5601',       1),
            ('双运放 LM358',          1),
            ('整流桥 MB10S',          1),
            ('MOSFET IRFR3710 100V',  1),
            ('MOSFET AOD2530 30V',    1),
            ('三极管 S8050 NPN',      3),
            ('三极管 S8550 PNP',      2),
            ('电容 10uF 25V 1206',    8),
            ('电容 100uF 25V 电解',   3),
            ('电容 470uF 25V 电解',   2),
            ('电容 10nF 50V 0603',    2),
            ('电容 100nF 50V 0805',   6),
            ('电感 22uH CD43',        1),
            ('电感 100uH DR8x10',     1),
            ('电感 470uH DR8x10',     1),
            ('电阻 10KΩ 0805',        12),
            ('电阻 1KΩ 0805',         6),
            ('电阻 100Ω 0805 1/8W',   4),
            ('电阻 470KΩ 1206',       3),
            ('电阻 2.2MΩ 1206',       1),
            ('二极管 SS14 肖特基',    4),
            ('二极管 1N4148 开关',    3),
            ('稳压 12V 0.5W',         1),
            ('光耦 PC817C 高 CTR',    1),
            ('保险丝 5A 250V',        1),
            ('TVS SMBJ12CA',          1),
            ('压敏 MOV 14D561K',      1),
            ('共模电感 UU16 5mH',     1),
            ('散热片 铝 25x25',       2),
            ('导热硅胶垫 20x20',      1),
            ('FCC 认证标签',          1),
            ('CCC 认证标签',          1),
            ('品牌 LOGO 贴',          1),
            ('序列号条码贴',          1),
        ],
    },
    {
        'name': '5V/1A 简易壁挂充电器',
        'code': 'PCB-CHG-5V1A-LITE',
        'description': '最简版 5V/1A 壁挂、5W。变压器 EE13、最少 BOM 件数，成本控。',
        'materials': [
            ('裸板 5V 1A 简易 v1',     1),
            ('变压器 EE13 5W',         1),
            ('USB-A 母座 直插',        1),
            ('开关电源 OB2335',         1),
            ('整流桥 DB207',            1),
            ('三极管 MJE13003 高压',    1),
            ('电容 10uF 25V 1206',     1),
            ('电容 100uF 25V 电解',    1),
            ('电容 470uF 25V 电解',    1),
            ('电容 100nF 50V 0805',    1),
            ('电阻 10KΩ 0805',         3),
            ('电阻 470KΩ 1206',        1),
            ('电阻 2.2MΩ 1206',        1),
            ('二极管 1N4007 整流',     1),
            ('二极管 SS14 肖特基',     1),
            ('光耦 PC817',             1),
            ('保险丝 2A 250V',         1),
            ('压敏 MOV 10D561K',       1),
            ('CCC 认证标签',           1),
        ],
    },
)


# ---------------------------------------------------------------------------
# 公共配置
# ---------------------------------------------------------------------------
_DEFAULT_UNIT = '只'  # 小元件统一计数单位


def run() -> None:
    """主入口——创建分类 + 物料 + PCB 方案。

    幂等：所有 create 都用 get_or_create，重复运行不会重复造。
    """
    print('=' * 60)
    print('Mock 库存 + PCB 方案种子（小型充电器电源 BOM 风格）')
    print('=' * 60)

    # 1) 分类
    print()
    print('Step 1/3 创建分类...')
    cat_objs: dict[str, Category] = {}
    cat_new = cat_existing = 0
    for name in _CATEGORIES:
        cat, created = Category.objects.get_or_create(
            name=name,
            defaults={'category_type': 'RAW_MATERIAL'},
        )
        cat_objs[name] = cat
        if created:
            cat_new += 1
        else:
            cat_existing += 1
    print(f'  ✓ 分类：{cat_new} 新建，{cat_existing} 已存在')

    # 2) 物料
    print()
    print('Step 2/3 创建物料（每分类 5 件，stock_quantity 都 = 0）...')
    prod_objs: dict[str, Product] = {}
    prod_new = prod_existing = 0
    for cat_name, (code_prefix, items) in _PRODUCTS_BY_CATEGORY.items():
        cat = cat_objs[cat_name]
        for item in items:
            code = f'{code_prefix}-{item.code_suffix}'
            product, created = Product.objects.get_or_create(
                internal_code=code,
                defaults={
                    'category': cat,
                    'model_name': item.model_name,
                    'unit': _DEFAULT_UNIT,
                    'stock_quantity': Decimal('0'),
                    'min_stock': Decimal(item.min_stock),
                },
            )
            prod_objs[item.model_name] = product
            if created:
                prod_new += 1
            else:
                prod_existing += 1
    print(f'  ✓ 物料：{prod_new} 新建，{prod_existing} 已存在（共 {len(prod_objs)} 件）')

    # 3) PCB 方案
    print()
    print('Step 3/3 创建 PCB 方案（5 个充电器 BOM）...')
    plan_new = plan_existing = 0
    material_new = material_existing = 0
    for plan_spec in _PCB_PLANS:
        plan, created = PcbPlan.objects.get_or_create(
            code=plan_spec['code'],
            defaults={
                'name': plan_spec['name'],
                'description': plan_spec['description'],
                'is_active': True,
            },
        )
        if created:
            plan_new += 1
        else:
            plan_existing += 1
        # 同一方案下 unique_together(plan, material)——重复跑也安全
        for material_name, qty in plan_spec['materials']:
            material_obj = prod_objs.get(material_name)
            if material_obj is None:
                print(f'  ⚠️  方案 {plan.code} 找不到物料 "{material_name}"，跳过')
                continue
            _, m_created = PcbPlanMaterial.objects.get_or_create(
                plan=plan,
                material=material_obj,
                defaults={'quantity_per_unit': Decimal(qty)},
            )
            if m_created:
                material_new += 1
            else:
                material_existing += 1
        print(f'  ✓ 方案 {plan.code}: {plan.name}')
    print(f'  ✓ 方案：{plan_new} 新建，{plan_existing} 已存在')
    print(f'  ✓ 方案明细：{material_new} 新建，{material_existing} 已存在')

    # 总结
    print()
    print('=' * 60)
    print('完成。')
    print(f'  分类总数：{Category.objects.count()}')
    print(f'  物料总数：{Product.objects.count()}')
    print(f'  PCB 方案：{PcbPlan.objects.count()}')
    print()
    print('提示：')
    print('  - 所有物料 stock_quantity = 0；需要通过收货或库存调整入库')
    print('  - 销售明细要挂"外壳 + PCB 方案 + 线材"——外壳和线材不属于本')
    print('    脚本范围（RAW_MATERIAL 之外），需另外创建 SELF_MADE/CABLE 分类与物料')
    print('=' * 60)
