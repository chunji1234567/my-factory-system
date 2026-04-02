"""Seed richer demo data for partners, products, purchases, sales, and finance."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Sequence

from django.utils import timezone

from core.models import Category, Partner, Product
from business.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    ReceivingLog,
    SalesOrder,
    SalesOrderItem,
    ShippingLog,
    FinancialTransaction,
    StockAdjustment,
)


@dataclass(frozen=True)
class CategorySpec:
    name: str
    category_type: str


@dataclass(frozen=True)
class PartnerSpec:
    name: str
    partner_type: str


@dataclass(frozen=True)
class ProductSpec:
    internal_code: str
    category: str
    model_name: str
    unit: str
    stock_quantity: Decimal
    min_stock: Decimal


@dataclass(frozen=True)
class PurchaseItemSpec:
    product: str
    price: Decimal
    quantity: Decimal
    receipts: Sequence[Decimal]


@dataclass(frozen=True)
class PurchaseOrderSpec:
    order_no: str
    partner: str
    operator: str
    items: Sequence[PurchaseItemSpec]


@dataclass(frozen=True)
class SalesItemSpec:
    product: str
    custom_name: str
    price: Decimal
    quantity: Decimal
    shipments: Sequence[Decimal]


@dataclass(frozen=True)
class SalesOrderSpec:
    order_no: str
    partner: str
    operator: str
    items: Sequence[SalesItemSpec]


@dataclass(frozen=True)
class FinanceSpec:
    partner: str
    amount: Decimal
    note: str
    tx_type: FinancialTransaction.TransactionType


@dataclass(frozen=True)
class AdjustmentSpec:
    product: str
    adjustment_type: str
    quantity: Decimal
    note: str
    operator: str


CATEGORIES: Sequence[CategorySpec] = (
    CategorySpec('原材料-ABS', 'RAW_MATERIAL'),
    CategorySpec('原材料-PC', 'RAW_MATERIAL'),
    CategorySpec('自产外壳', 'SELF_MADE'),
    CategorySpec('成品整机', 'FINISHED'),
)

PARTNERS: Sequence[PartnerSpec] = (
    PartnerSpec('塑料供应商集团', 'SUPPLIER'),
    PartnerSpec('贝塔化工', 'SUPPLIER'),
    PartnerSpec('海外客户B', 'CUSTOMER'),
    PartnerSpec('国内经销商', 'BOTH'),
    PartnerSpec('泰国客户A', 'CUSTOMER'),
)

PRODUCTS: Sequence[ProductSpec] = (
    ProductSpec('RM-ABS-T100', '原材料-ABS', '高流动 ABS T100', 'kg', Decimal('2200'), Decimal('200')),
    ProductSpec('RM-ABS-R300', '原材料-ABS', '阻燃 ABS R300', 'kg', Decimal('950'), Decimal('150')),
    ProductSpec('RM-PC-M203', '原材料-PC', '耐冲击 PC M203', 'kg', Decimal('600'), Decimal('100')),
    ProductSpec('SH-ELITE-BK-2025', '自产外壳', 'Elite 黑色外壳 2025', '件', Decimal('620'), Decimal('120')),
    ProductSpec('SH-ELITE-WH-2025', '自产外壳', 'Elite 白色外壳 2025', '件', Decimal('410'), Decimal('80')),
    ProductSpec('FD-SMART-01', '成品整机', 'Smart 控制柜 01', '台', Decimal('120'), Decimal('30')),
)

PURCHASE_ORDERS: Sequence[PurchaseOrderSpec] = (
    PurchaseOrderSpec(
        order_no='PO-DEMO-001',
        partner='塑料供应商集团',
        operator='仓库A',
        items=(
            PurchaseItemSpec('RM-ABS-T100', Decimal('15.50'), Decimal('1200'), (Decimal('500'), Decimal('700'))),
        ),
    ),
    PurchaseOrderSpec(
        order_no='PO-DEMO-002',
        partner='贝塔化工',
        operator='采购B',
        items=(
            PurchaseItemSpec('RM-ABS-R300', Decimal('18.80'), Decimal('800'), (Decimal('300'), Decimal('300'), Decimal('200'))),
            PurchaseItemSpec('RM-PC-M203', Decimal('22.40'), Decimal('500'), (Decimal('250'), Decimal('250'))),
        ),
    ),
)

SALES_ORDERS: Sequence[SalesOrderSpec] = (
    SalesOrderSpec(
        order_no='SO-DEMO-001',
        partner='海外客户B',
        operator='业务丁',
        items=(
            SalesItemSpec(
                product='SH-ELITE-BK-2025',
                custom_name='Elite 黑色外壳套件',
                price=Decimal('28.80'),
                quantity=Decimal('500'),
                shipments=(Decimal('200'), Decimal('300')),
            ),
        ),
    ),
    SalesOrderSpec(
        order_no='SO-DEMO-002',
        partner='国内经销商',
        operator='业务丁',
        items=(
            SalesItemSpec(
                product='SH-ELITE-WH-2025',
                custom_name='Elite 白色外壳套件',
                price=Decimal('27.50'),
                quantity=Decimal('350'),
                shipments=(Decimal('180'),),
            ),
            SalesItemSpec(
                product='FD-SMART-01',
                custom_name='Smart 控制柜一体机',
                price=Decimal('3200'),
                quantity=Decimal('40'),
                shipments=(Decimal('20'), Decimal('20')),
            ),
        ),
    ),
)

FINANCE_TRANSACTIONS: Sequence[FinanceSpec] = (
    FinanceSpec('海外客户B', Decimal('-18000'), '首付款', FinancialTransaction.TransactionType.PAYMENT),
    FinanceSpec('海外客户B', Decimal('6000'), '回款', FinancialTransaction.TransactionType.RECEIPT),
    FinanceSpec('国内经销商', Decimal('-9000'), '预付款', FinancialTransaction.TransactionType.PAYMENT),
    FinanceSpec('塑料供应商集团', Decimal('25000'), '支付货款', FinancialTransaction.TransactionType.PAYMENT),
)

STOCK_ADJUSTMENTS: Sequence[AdjustmentSpec] = (
    AdjustmentSpec('SH-ELITE-BK-2025', 'MANUAL_IN', Decimal('80'), '盘盈', '仓库调整'),
    AdjustmentSpec('RM-PC-M203', 'MANUAL_OUT', Decimal('50'), '损耗', '仓库调整'),
)


def _get_category_map() -> dict[str, Category]:
    mapping: dict[str, Category] = {}
    for spec in CATEGORIES:
        obj, _ = Category.objects.get_or_create(name=spec.name, defaults={'category_type': spec.category_type})
        mapping[spec.name] = obj
    return mapping


def _get_partner_map() -> dict[str, Partner]:
    mapping: dict[str, Partner] = {}
    for spec in PARTNERS:
        obj, _ = Partner.objects.get_or_create(name=spec.name, defaults={'partner_type': spec.partner_type})
        mapping[spec.name] = obj
    return mapping


def _get_product_map(categories: dict[str, Category]) -> dict[str, Product]:
    mapping: dict[str, Product] = {}
    for spec in PRODUCTS:
        obj, _ = Product.objects.get_or_create(
            internal_code=spec.internal_code,
            defaults={
                'category': categories[spec.category],
                'model_name': spec.model_name,
                'unit': spec.unit,
                'stock_quantity': spec.stock_quantity,
                'min_stock': spec.min_stock,
            },
        )
        mapping[spec.internal_code] = obj
    return mapping


def _seed_purchase_orders(partners: dict[str, Partner], products: dict[str, Product]) -> None:
    for order_spec in PURCHASE_ORDERS:
        order, _ = PurchaseOrder.objects.get_or_create(
            order_no=order_spec.order_no,
            defaults={'partner': partners[order_spec.partner], 'operator': order_spec.operator},
        )
        for item_spec in order_spec.items:
            item, _ = PurchaseOrderItem.objects.get_or_create(
                order=order,
                product=products[item_spec.product],
                defaults={'price': item_spec.price, 'quantity': item_spec.quantity},
            )
            if not item.receipts.exists():
                for qty in item_spec.receipts:
                    ReceivingLog.objects.create(
                        purchase_item=item,
                        quantity_received=qty,
                        operator=order_spec.operator,
                        received_at=timezone.now(),
                    )


def _seed_sales_orders(partners: dict[str, Partner], products: dict[str, Product]) -> None:
    for order_spec in SALES_ORDERS:
        order, _ = SalesOrder.objects.get_or_create(
            order_no=order_spec.order_no,
            defaults={'partner': partners[order_spec.partner], 'operator': order_spec.operator},
        )
        for item_spec in order_spec.items:
            item, _ = SalesOrderItem.objects.get_or_create(
                order=order,
                product=products[item_spec.product],
                defaults={
                    'custom_product_name': item_spec.custom_name,
                    'price': item_spec.price,
                    'quantity': item_spec.quantity,
                },
            )
            if not item.shippings.exists():
                for qty in item_spec.shipments:
                    ShippingLog.objects.create(
                        sales_item=item,
                        quantity_shipped=qty,
                        operator=order_spec.operator,
                        shipped_at=timezone.now(),
                    )


def _seed_finance_records(partners: dict[str, Partner]) -> None:
    for tx in FINANCE_TRANSACTIONS:
        FinancialTransaction.objects.get_or_create(
            partner=partners[tx.partner],
            amount=tx.amount,
            transaction_type=tx.tx_type,
            operator='财务A',
            defaults={'note': tx.note},
        )


def _seed_stock_adjustments(products: dict[str, Product]) -> None:
    for spec in STOCK_ADJUSTMENTS:
        StockAdjustment.objects.get_or_create(
            product=products[spec.product],
            adjustment_type=spec.adjustment_type,
            quantity=spec.quantity,
            note=spec.note,
            operator=spec.operator,
        )


def main() -> None:
    categories = _get_category_map()
    partners = _get_partner_map()
    products = _get_product_map(categories)
    _seed_purchase_orders(partners, products)
    _seed_sales_orders(partners, products)
    _seed_finance_records(partners)
    _seed_stock_adjustments(products)
    print('Demo data created/updated successfully.')


if __name__ == '__main__':
    main()
