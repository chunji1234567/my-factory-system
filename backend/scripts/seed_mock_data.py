"""Seed demo partners, products, and order data for quick DRF inspection."""

from decimal import Decimal

from core.models import Category, Product, Partner
from business.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    ReceivingLog,
    SalesOrder,
    SalesOrderItem,
    ShippingLog,
    FinancialTransaction,
)


raw_cat, _ = Category.objects.get_or_create(name="原材料-ABS", category_type="RAW_MATERIAL")
shell_cat, _ = Category.objects.get_or_create(name="自产外壳", category_type="SELF_MADE")
finished_cat, _ = Category.objects.get_or_create(name="成品整机", category_type="FINISHED")

supplier, _ = Partner.objects.get_or_create(name="塑料供应商集团", defaults={"partner_type": "SUPPLIER"})
customer, _ = Partner.objects.get_or_create(name="海外客户B", defaults={"partner_type": "CUSTOMER"})
both_partner, _ = Partner.objects.get_or_create(name="国内经销商", defaults={"partner_type": "BOTH"})

abs_resin, _ = Product.objects.get_or_create(
    internal_code="RM-ABS-T100",
    defaults={
        "category": raw_cat,
        "model_name": "高流动 ABS T100",
        "unit": "kg",
        "stock_quantity": 2000,
        "min_stock": 200,
    },
)
shell_black, _ = Product.objects.get_or_create(
    internal_code="SH-ELITE-BK-2025",
    defaults={
        "category": shell_cat,
        "model_name": "Elite 黑色外壳",
        "unit": "个",
        "stock_quantity": 600,
        "min_stock": 100,
    },
)
shell_blue, _ = Product.objects.get_or_create(
    internal_code="SH-ELITE-BL-2025",
    defaults={
        "category": shell_cat,
        "model_name": "Elite 蓝色外壳",
        "unit": "个",
        "stock_quantity": 420,
        "min_stock": 80,
    },
)

po, _ = PurchaseOrder.objects.get_or_create(
    order_no="PO-DEMO-001",
    defaults={"partner": supplier, "operator": "系统"},
)
po_item, _ = PurchaseOrderItem.objects.get_or_create(
    order=po,
    product=abs_resin,
    defaults={"price": Decimal("15.50"), "quantity": Decimal("1000")},
)
if not po_item.receipts.exists():
    ReceivingLog.objects.create(purchase_item=po_item, quantity_received=Decimal("400"), operator="仓库A")
    ReceivingLog.objects.create(purchase_item=po_item, quantity_received=Decimal("600"), operator="仓库A")

sales_order, _ = SalesOrder.objects.get_or_create(
    order_no="SO-DEMO-001",
    defaults={"partner": customer, "operator": "系统"},
)
sales_item, _ = SalesOrderItem.objects.get_or_create(
    order=sales_order,
    custom_product_name="Elite 外壳黑色 2025",
    defaults={
        "product": shell_black,
        "price": Decimal("28.80"),
        "quantity": Decimal("500"),
    },
)
if not sales_item.shippings.exists():
    ShippingLog.objects.create(
        sales_item=sales_item,
        quantity_shipped=Decimal("200"),
        operator="发货一组",
    )
    ShippingLog.objects.create(
        sales_item=sales_item,
        quantity_shipped=Decimal("300"),
        operator="发货一组",
        tracking_no="SF123456789CN",
    )

FinancialTransaction.objects.get_or_create(
    partner=customer,
    amount=Decimal("20000"),
    transaction_type=FinancialTransaction.TransactionType.RECEIPT,
    operator="财务A",
    defaults={"note": "首付款"},
)
FinancialTransaction.objects.get_or_create(
    partner=customer,
    amount=Decimal("-8000"),
    transaction_type=FinancialTransaction.TransactionType.PAYMENT,
    operator="财务A",
    defaults={"note": "返利抵扣"},
)

print("Mock data created/updated.")
