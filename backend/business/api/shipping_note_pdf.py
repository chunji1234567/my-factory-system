"""发货单 PDF 生成（Stage C-11 v2，2026-06-18 重写）。

历史教训：
  - v1（2026-06-18 上午）：用 ReportLab 内置 CID 字体 STSong-Light。问题：
    * CID 字体不嵌入实际 glyph 数据，依赖 PDF reader 自带 CMap；
      Chrome PDF / 部分手机 reader 显示乱码或 tofu
    * Paragraph 在 Table cell 里包装时偶尔出现文字重叠
    * 一页只放一张发货单浪费纸
  - v2（本文件，2026-06-18 下午）：
    * 改用真实 TTF（系统 PingFang / Noto Sans CJK / 微软雅黑），
      字体数据嵌入 PDF，任何 reader 都能正确渲染
    * 2 客户/A4：上下半页各放一张发货单，中间虚线提示裁剪。
      每个客户用 KeepTogether 锁定，不跨页。

布局：
  ┌───── A4 ─────┐
  │  客户 A 发货单  │  上半
  │                │
  ├─ - - - - - - ─┤  虚线裁剪提示
  │  客户 B 发货单  │  下半
  │                │
  └────────────────┘

详见 docs/PRD.md §4.6（发货单输出）。
"""
from __future__ import annotations

import io
import os
from datetime import date
from pathlib import Path
from typing import Iterable

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
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from business.models import ShippingLog


# ---------------------------------------------------------------------------
# 字体自动发现（多 OS 系统字体 → bundled fallback → CID 最后兜底）
# ---------------------------------------------------------------------------
# 优先级从上到下：先用系统真 TTF，最后才退到 STSong-Light CID（v1 的方案）。
# 找到第一个存在的就停。subfont_index 用于 TTC（字体集合）的子字体编号。
_FONT_CANDIDATES: list[tuple[str, int | None]] = [
    # macOS
    ('/System/Library/Fonts/PingFang.ttc', 2),         # PingFang SC Regular (常用)
    ('/System/Library/Fonts/STHeiti Light.ttc', 0),    # 黑体细
    ('/System/Library/Fonts/STHeiti Medium.ttc', 0),
    # Linux（Debian/Ubuntu: apt install fonts-noto-cjk）
    ('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 0),
    ('/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf', None),
    ('/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', 0),
    # Windows
    ('C:/Windows/Fonts/msyh.ttc', 0),                  # 微软雅黑
    ('C:/Windows/Fonts/simhei.ttf', None),             # 黑体
    ('C:/Windows/Fonts/simsun.ttc', 0),                # 宋体
]

# 项目自带的 TTF 兜底（如果 repo 里放了字体文件）
_BUNDLED_FONT = Path(settings.BASE_DIR) / 'business' / 'static' / 'fonts' / 'NotoSansSC-Regular.otf'
if _BUNDLED_FONT.exists():
    _FONT_CANDIDATES.append((str(_BUNDLED_FONT), None))

_REGISTERED_FONT_NAME = 'ShippingCN'


def _register_chinese_font() -> str:
    """注册可用的中文字体，返回 ReportLab 内部使用的字体名。

    成功 = 返回真 TTF 字体名；失败 = 退到 STSong-Light CID（v1 老方案）。
    """
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
    # 全部失败 → 退到 CID
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
    name='Company',
    fontName=_CN_FONT,
    fontSize=14,
    alignment=1,          # center
    leading=18,
    spaceAfter=2,
)
_TITLE_STYLE = ParagraphStyle(
    name='Title',
    fontName=_CN_FONT,
    fontSize=11,
    alignment=1,
    textColor=colors.HexColor('#475569'),
    leading=14,
    spaceAfter=4,
)
_META_STYLE = ParagraphStyle(
    name='Meta',
    fontName=_CN_FONT,
    fontSize=9,
    leading=12,
)
_CELL_STYLE = ParagraphStyle(
    name='Cell',
    fontName=_CN_FONT,
    fontSize=8.5,
    leading=11,
)
_CELL_CENTER_STYLE = ParagraphStyle(
    name='CellCenter',
    parent=_CELL_STYLE,
    alignment=1,
)
_CELL_RIGHT_STYLE = ParagraphStyle(
    name='CellRight',
    parent=_CELL_STYLE,
    alignment=2,          # right
)
_FOOTER_STYLE = ParagraphStyle(
    name='Footer',
    fontName=_CN_FONT,
    fontSize=8,
    textColor=colors.HexColor('#64748b'),
    leading=11,
)


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def generate_shipping_note_pdf(logs: Iterable[ShippingLog]) -> bytes:
    """把一组 ShippingLog 渲染成发货单 PDF（2 客户/A4，详见模块顶 docstring）。

    分组规则：按 (partner_id, partner_name) 分组——同客户的多笔 ShippingLog
    合并成同一张发货单。
    """
    grouped = _group_by_partner(logs)
    if not grouped:
        return _empty_pdf()

    buffer = io.BytesIO()

    # 自定义 2-frame 布局：上半 A4 + 下半 A4，各放一张发货单
    page_width, page_height = A4
    h_margin = 12 * mm
    v_margin = 8 * mm
    half_height = (page_height - 2 * v_margin) / 2
    frame_width = page_width - 2 * h_margin

    top_frame = Frame(
        x1=h_margin,
        y1=page_height / 2 + 2 * mm,
        width=frame_width,
        height=half_height - 4 * mm,
        id='top',
        showBoundary=0,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )
    bottom_frame = Frame(
        x1=h_margin,
        y1=v_margin,
        width=frame_width,
        height=half_height - 4 * mm,
        id='bottom',
        showBoundary=0,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )

    def draw_cut_line(canvas, _doc):
        """中间画一条虚线 + "裁剪" 字样，方便用户对折/裁剪。"""
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor('#94a3b8'))
        canvas.setDash(2, 3)
        y = page_height / 2
        canvas.line(h_margin, y, page_width - h_margin, y)
        canvas.setFont(_CN_FONT, 7)
        canvas.setFillColor(colors.HexColor('#94a3b8'))
        canvas.drawCentredString(page_width / 2, y - 4, '— ✂ 沿虚线裁剪 —')
        canvas.restoreState()

    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=h_margin,
        rightMargin=h_margin,
        topMargin=v_margin,
        bottomMargin=v_margin,
        title='发货单',
    )
    doc.addPageTemplates([
        PageTemplate(id='two-up', frames=[top_frame, bottom_frame], onPage=draw_cut_line),
    ])

    company_name = getattr(settings, 'SHIPPING_NOTE_COMPANY_NAME', '我的工厂')
    today_str = date.today().strftime('%Y-%m-%d')

    story = []
    for partner_label, rows in grouped:
        # KeepTogether 强制整张发货单作为一个不可分割块——要么完整放进 frame，
        # 要么整个跳到下一个 frame（上半放不下就跳下半，下半放不下就跳下一页上半）。
        # 这样不会出现"客户 A 的明细横跨两页"的丑陋情况。
        story.append(KeepTogether(_build_partner_note(
            company_name=company_name,
            partner_label=partner_label,
            rows=rows,
            today_str=today_str,
            frame_width=frame_width,
        )))

    doc.build(story)
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# 单张发货单内容（不含外层 frame，调用方负责把它放进合适的 frame）
# ---------------------------------------------------------------------------
def _build_partner_note(*, company_name, partner_label, rows, today_str, frame_width):
    elements = []

    # 抬头：公司名 + 发货单标题
    elements.append(Paragraph(company_name, _COMPANY_STYLE))
    elements.append(Paragraph('发&nbsp;&nbsp;货&nbsp;&nbsp;单', _TITLE_STYLE))

    # 客户 + 日期 row
    meta_row = Table(
        [[
            Paragraph(f'<b>客户：</b>{_escape(partner_label)}', _META_STYLE),
            Paragraph(f'<b>日期：</b>{today_str}', _META_STYLE),
        ]],
        colWidths=[frame_width * 0.65, frame_width * 0.35],
    )
    meta_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(meta_row)
    elements.append(Spacer(1, 2 * mm))

    # 明细表
    elements.append(_build_items_table(rows, frame_width))

    # 签字栏
    elements.append(Spacer(1, 4 * mm))
    sign_row = Table(
        [[
            Paragraph('<b>客户签收：</b>__________________', _META_STYLE),
            Paragraph('<b>签收日期：</b>____________', _META_STYLE),
        ]],
        colWidths=[frame_width * 0.40, frame_width * 0.30, frame_width * 0.30],
    )
    sign_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(sign_row)

    elements.append(Spacer(1, 1 * mm))
    elements.append(Paragraph(
        '此单为送货签收凭证，请客户核对数量后签字保留一联。',
        _FOOTER_STYLE,
    ))

    return elements


def _build_items_table(rows, frame_width):
    """渲染明细表——表头 + N 行明细 + 合计行。"""
    # 列宽分配：合同号 / 型号 / 规格备注 / 数量 / 单位 / 运单号
    col_ratios = [0.20, 0.22, 0.30, 0.10, 0.08, 0.17]
    col_widths = [frame_width * r for r in col_ratios]

    header = [
        Paragraph('订单号', _CELL_CENTER_STYLE),
        Paragraph('型号', _CELL_CENTER_STYLE),
        Paragraph('规格备注', _CELL_CENTER_STYLE),
        Paragraph('数量', _CELL_CENTER_STYLE),
        Paragraph('单位', _CELL_CENTER_STYLE),
        Paragraph('运单号', _CELL_CENTER_STYLE),
    ]

    body_rows = []
    total_qty = 0
    for log in rows:
        item = getattr(log, 'sales_item', None)
        order = getattr(item, 'order', None) if item is not None else None
        # 2026-06-19：导出时只显示客户单号；客户没给就留空（业务约定，详见 §9.4）
        partner_order_no = (getattr(order, 'partner_order_no', '') or '').strip()
        order_no = partner_order_no  # 不再 fallback 到 order.order_no
        model_name = getattr(item, 'custom_product_name', '') or ''
        detail = (getattr(item, 'detail_description', '') or '').strip()
        qty = log.quantity_shipped
        tracking = log.tracking_no or ''
        total_qty += qty

        body_rows.append([
            Paragraph(_escape(order_no) or '—', _CELL_CENTER_STYLE),
            Paragraph(_escape(model_name) or '—', _CELL_STYLE),
            Paragraph(_escape(detail) or '—', _CELL_STYLE),
            Paragraph(_fmt_qty(qty), _CELL_RIGHT_STYLE),
            Paragraph('只', _CELL_CENTER_STYLE),
            Paragraph(_escape(tracking) or '—', _CELL_CENTER_STYLE),
        ])

    total_row = [
        Paragraph('', _CELL_STYLE),
        Paragraph('', _CELL_STYLE),
        Paragraph('<b>合计</b>', _CELL_RIGHT_STYLE),
        Paragraph(f'<b>{_fmt_qty(total_qty)}</b>', _CELL_RIGHT_STYLE),
        Paragraph('', _CELL_STYLE),
        Paragraph('', _CELL_STYLE),
    ]

    data = [header] + body_rows + [total_row]
    table = Table(data, colWidths=col_widths, repeatRows=1)

    table.setStyle(TableStyle([
        # 表格线
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#94a3b8')),
        # 表头底色
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        # 合计行底色
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f8fafc')),
        # 全表 padding
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
def _group_by_partner(logs: Iterable[ShippingLog]):
    """[(partner_label, [log, log, ...]), ...]，按客户名排序。"""
    buckets: dict[tuple, tuple[str, list]] = {}
    for log in logs:
        partner = None
        sales_item = getattr(log, 'sales_item', None)
        if sales_item is not None:
            order = getattr(sales_item, 'order', None)
            if order is not None:
                partner = getattr(order, 'partner', None)
        if partner is not None:
            key = (partner.id,)
            label = partner.name
        else:
            key = (-log.id,)
            label = f'未知客户 #{log.id}'
        if key not in buckets:
            buckets[key] = (label, [])
        buckets[key][1].append(log)
    return [(label, logs_) for label, logs_ in
            sorted(buckets.values(), key=lambda v: v[0])]


def _fmt_qty(value) -> str:
    """整数显示整数，避免 "10.00"。"""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return str(value)
    if v == int(v):
        return str(int(v))
    return f'{v:g}'


def _escape(text: str) -> str:
    """Paragraph 用的 XML-safe 转义，避免 < > & 误解为标签。"""
    if not text:
        return ''
    return (
        text.replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
    )


def _empty_pdf() -> bytes:
    """没数据时返回单页提示 PDF。"""
    buffer = io.BytesIO()
    doc = BaseDocTemplate(buffer, pagesize=A4, title='发货单')
    frame = Frame(20 * mm, 20 * mm, A4[0] - 40 * mm, A4[1] - 40 * mm)
    doc.addPageTemplates([PageTemplate(id='empty', frames=[frame])])
    doc.build([Paragraph('无可导出的发货流水', _COMPANY_STYLE)])
    return buffer.getvalue()
