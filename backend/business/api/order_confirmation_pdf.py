"""订单确认书 PDF 生成（2026-06-19）。

业务场景：
  - 销售订单 → "销售订单确认书"：给**客户**签字确认订单内容
  - 采购订单 → "采购订单确认书"：给**供应商**签字确认订单内容

布局：单张订单 = 单页 A4。包含公司抬头、合作方信息、明细表、合计、签字栏。

业务约定（2026-06-19，详见 docs/PRD.md §9.4）：
  - 订单号显示规则：**只显示 partner_order_no**（客户/供应商自己的单号）。
    若 partner_order_no 为空，则**不显示**订单号——这是用户明确要求的
    "除非有客户的订单号不然都不需要导出订单号"。
  - 我们的内部单号 ``order_no`` 在 PDF 里**完全不出现**。

字体处理与 shipping_note_pdf 同口径：复用同一个 _register_chinese_font 逻辑，
但模块独立以减少耦合。详见 shipping_note_pdf 模块顶 docstring。
"""
from __future__ import annotations

import io
import os
from datetime import date
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from business.models import SalesOrder, PurchaseOrder


# ---------------------------------------------------------------------------
# 字体（同 shipping_note_pdf 口径）
# ---------------------------------------------------------------------------
_FONT_CANDIDATES: list[tuple[str, int | None]] = [
    ('/System/Library/Fonts/PingFang.ttc', 2),
    ('/System/Library/Fonts/STHeiti Light.ttc', 0),
    ('/System/Library/Fonts/STHeiti Medium.ttc', 0),
    ('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 0),
    ('/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf', None),
    ('/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', 0),
    ('C:/Windows/Fonts/msyh.ttc', 0),
    ('C:/Windows/Fonts/simhei.ttf', None),
    ('C:/Windows/Fonts/simsun.ttc', 0),
]

_BUNDLED_FONT = Path(settings.BASE_DIR) / 'business' / 'static' / 'fonts' / 'NotoSansSC-Regular.otf'
if _BUNDLED_FONT.exists():
    _FONT_CANDIDATES.append((str(_BUNDLED_FONT), None))

_REGISTERED_FONT_NAME = 'OrderConfirmCN'


def _register_chinese_font() -> str:
    for path, subfont_index in _FONT_CANDIDATES:
        if not os.path.exists(path):
            continue
        try:
            if subfont_index is not None:
                pdfmetrics.registerFont(TTFont(_REGISTERED_FONT_NAME, path, subfontIndex=subfont_index))
            else:
                pdfmetrics.registerFont(TTFont(_REGISTERED_FONT_NAME, path))
            return _REGISTERED_FONT_NAME
        except Exception:
            continue
    try:
        pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    except Exception:
        pass
    return 'STSong-Light'


_CN_FONT = _register_chinese_font()


# ---------------------------------------------------------------------------
# 样式
# ---------------------------------------------------------------------------
_COMPANY_STYLE = ParagraphStyle(
    name='Company', fontName=_CN_FONT, fontSize=16, alignment=1,
    leading=22, spaceAfter=4,
)
_TITLE_STYLE = ParagraphStyle(
    name='Title', fontName=_CN_FONT, fontSize=14, alignment=1,
    textColor=colors.HexColor('#1e293b'), leading=18, spaceAfter=8,
)
_META_STYLE = ParagraphStyle(
    name='Meta', fontName=_CN_FONT, fontSize=10, leading=14,
)
_META_BOLD_STYLE = ParagraphStyle(
    name='MetaBold', parent=_META_STYLE,
)
_CELL_STYLE = ParagraphStyle(
    name='Cell', fontName=_CN_FONT, fontSize=9, leading=12,
)
_CELL_CENTER_STYLE = ParagraphStyle(
    name='CellCenter', parent=_CELL_STYLE, alignment=1,
)
_CELL_RIGHT_STYLE = ParagraphStyle(
    name='CellRight', parent=_CELL_STYLE, alignment=2,
)
_TOTAL_STYLE = ParagraphStyle(
    name='Total', fontName=_CN_FONT, fontSize=11, alignment=2,
    leading=14, spaceBefore=6,
)
_NOTE_STYLE = ParagraphStyle(
    name='Note', fontName=_CN_FONT, fontSize=9,
    textColor=colors.HexColor('#475569'), leading=13,
)
_FOOTER_STYLE = ParagraphStyle(
    name='Footer', fontName=_CN_FONT, fontSize=8,
    textColor=colors.HexColor('#64748b'), leading=11, alignment=1,
)


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def generate_sales_order_confirmation_pdf(order: SalesOrder) -> bytes:
    """生成单张销售订单确认书 PDF（A4 单页）。"""
    return _render_order_pdf(order=order, mode='sales')


def generate_purchase_order_confirmation_pdf(order: PurchaseOrder) -> bytes:
    """生成单张采购订单确认书 PDF（A4 单页）。"""
    return _render_order_pdf(order=order, mode='purchase')


# ---------------------------------------------------------------------------
# 通用渲染（销售 vs 采购仅文案差异）
# ---------------------------------------------------------------------------
def _render_order_pdf(*, order, mode: str) -> bytes:
    is_sales = mode == 'sales'
    title_text = '销售订单确认书' if is_sales else '采购订单确认书'
    partner_label = '客户' if is_sales else '供应商'
    sign_label = '客户签字 / 盖章' if is_sales else '供应商签字 / 盖章'
    footer_text = (
        '此单经客户签字盖章后生效。请客户核对明细数量与价格无误。'
        if is_sales else
        '此单经供应商签字盖章后生效。请供应商核对明细数量与价格无误。'
    )
    expected_date_label = '预计交付日期' if is_sales else '预计到货日期'
    expected_date_value = (
        getattr(order, 'expected_delivery_date', None) if is_sales
        else getattr(order, 'expected_arrival_date', None)
    )

    buffer = io.BytesIO()

    page_width, page_height = A4
    h_margin = 18 * mm
    v_margin = 15 * mm
    frame_width = page_width - 2 * h_margin
    frame_height = page_height - 2 * v_margin

    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=h_margin,
        rightMargin=h_margin,
        topMargin=v_margin,
        bottomMargin=v_margin,
        title=title_text,
    )
    frame = Frame(
        h_margin, v_margin, frame_width, frame_height,
        id='main', showBoundary=0,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    doc.addPageTemplates([PageTemplate(id='single', frames=[frame])])

    company_name = getattr(settings, 'SHIPPING_NOTE_COMPANY_NAME', '我的工厂')

    story = []

    # ① 公司抬头 + 标题
    story.append(Paragraph(_escape(company_name), _COMPANY_STYLE))
    story.append(Paragraph(title_text, _TITLE_STYLE))

    # ② Meta：合作方 + 客户/供应商单号（仅 partner_order_no 存在时显示）+ 日期 + 交期
    partner = getattr(order, 'partner', None)
    partner_name = getattr(partner, 'name', '—') if partner else '—'
    today_str = date.today().strftime('%Y-%m-%d')
    expected_str = (
        expected_date_value.strftime('%Y-%m-%d') if expected_date_value else '—'
    )
    partner_order_no = (getattr(order, 'partner_order_no', '') or '').strip()

    # 第一行：partner + 日期
    meta_rows = [[
        Paragraph(f'<b>{partner_label}：</b>{_escape(partner_name)}', _META_STYLE),
        Paragraph(f'<b>日期：</b>{today_str}', _META_STYLE),
    ]]
    # 第二行：仅当有 partner_order_no 时显示客户/供应商订单号
    if partner_order_no:
        order_no_label = '客户订单号' if is_sales else '供应商订单号'
        meta_rows.append([
            Paragraph(
                f'<b>{order_no_label}：</b>{_escape(partner_order_no)}',
                _META_STYLE,
            ),
            Paragraph(f'<b>{expected_date_label}：</b>{expected_str}', _META_STYLE),
        ])
    else:
        # 没有客户单号 → 第二行只放交期，订单号字段省掉
        meta_rows.append([
            Paragraph('', _META_STYLE),
            Paragraph(f'<b>{expected_date_label}：</b>{expected_str}', _META_STYLE),
        ])

    meta_table = Table(meta_rows, colWidths=[frame_width * 0.60, frame_width * 0.40])
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        # 上下两条横线
        ('LINEABOVE', (0, 0), (-1, 0), 0.6, colors.HexColor('#94a3b8')),
        ('LINEBELOW', (0, -1), (-1, -1), 0.6, colors.HexColor('#94a3b8')),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 6 * mm))

    # ③ 明细表
    story.append(_build_items_table(order=order, is_sales=is_sales, frame_width=frame_width))

    # ④ 合计金额
    total_amount = getattr(order, 'total_amount', None) or Decimal('0')
    story.append(Spacer(1, 1 * mm))
    story.append(Paragraph(
        f'<b>订单总金额：</b>¥ {_fmt_money(total_amount)}',
        _TOTAL_STYLE,
    ))
    story.append(Spacer(1, 8 * mm))


    # ⑥ 签字栏
    # sign_table = Table([[
    #     Paragraph(f'<b>{sign_label}：</b>______________________', _META_STYLE),
    #     Paragraph('<b>签字日期：</b>________________', _META_STYLE),
    # ]], colWidths=[frame_width * 0.60, frame_width * 0.40])
    # sign_table.setStyle(TableStyle([
    #     ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    #     ('LEFTPADDING', (0, 0), (-1, -1), 2),
    #     ('TOPPADDING', (0, 0), (-1, -1), 4),
    #     ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    # ]))
    # story.append(sign_table)
    # story.append(Spacer(1, 8 * mm))

    # ⑦ 页脚
    story.append(Paragraph(footer_text, _FOOTER_STYLE))

    doc.build(story)
    return buffer.getvalue()


def _build_items_table(*, order, is_sales: bool, frame_width: float):
    """渲染明细表。销售/采购的明细字段不同：
       - 销售：custom_product_name + detail_description + price + quantity
       - 采购：product.model_name + product.internal_code + price + quantity
    """
    # 列宽：序号 / 型号 / 规格备注 / 数量 / 单位 / 单价 / 小计
    col_ratios = [0.06, 0.22, 0.22, 0.10, 0.06, 0.12, 0.22]
    col_widths = [frame_width * r for r in col_ratios]

    header = [
        Paragraph('序号', _CELL_CENTER_STYLE),
        Paragraph('型号', _CELL_CENTER_STYLE),
        Paragraph('规格备注', _CELL_CENTER_STYLE),
        Paragraph('数量', _CELL_CENTER_STYLE),
        Paragraph('单位', _CELL_CENTER_STYLE),
        Paragraph('单价', _CELL_CENTER_STYLE),
        Paragraph('小计', _CELL_CENTER_STYLE),
    ]

    body_rows = []
    items = list(order.items.all())
    total_qty = Decimal('0')
    for idx, item in enumerate(items, start=1):
        if is_sales:
            model_name = item.custom_product_name or ''
            spec = (item.detail_description or '').strip()
        else:
            product = getattr(item, 'product', None)
            model_name = getattr(product, 'model_name', '') or ''
            spec = getattr(product, 'internal_code', '') or ''

        qty = Decimal(str(item.quantity or 0))
        price = Decimal(str(item.price or 0))
        subtotal = qty * price
        total_qty += qty

        body_rows.append([
            Paragraph(str(idx), _CELL_CENTER_STYLE),
            Paragraph(_escape(model_name) or '—', _CELL_STYLE),
            Paragraph(_escape(spec) or '—', _CELL_STYLE),
            Paragraph(_fmt_qty(qty), _CELL_RIGHT_STYLE),
            Paragraph('只', _CELL_CENTER_STYLE),
            Paragraph(_fmt_money(price), _CELL_RIGHT_STYLE),
            Paragraph(_fmt_money(subtotal), _CELL_RIGHT_STYLE),
        ])

    # 合计行
    total_row = [
        Paragraph('', _CELL_STYLE),
        Paragraph('', _CELL_STYLE),
        Paragraph('<b>合计</b>', _CELL_RIGHT_STYLE),
        Paragraph(f'<b>{_fmt_qty(total_qty)}</b>', _CELL_RIGHT_STYLE),
        Paragraph('', _CELL_STYLE),
        Paragraph('', _CELL_STYLE),
        Paragraph(
            f'<b>¥ {_fmt_money(getattr(order, "total_amount", 0))}</b>',
            _CELL_RIGHT_STYLE,
        ),
    ]

    data = [header] + body_rows + [total_row]
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#94a3b8')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f1f5f9')),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return table


# ---------------------------------------------------------------------------
# 工具
# ---------------------------------------------------------------------------
def _fmt_qty(value) -> str:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return str(value)
    if v == int(v):
        return str(int(v))
    return f'{v:g}'


def _fmt_money(value) -> str:
    """金额按 1,234.56 千分位 + 两位小数。"""
    try:
        v = Decimal(str(value))
    except Exception:
        return str(value)
    return f'{v:,.2f}'


def _escape(text: str) -> str:
    if not text:
        return ''
    return (
        text.replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
    )
