from django.contrib import admin
from django.utils.html import format_html
from .models import (
    SalesOrder, SalesOrderItem, ShippingLog, OrderEvent,
    PurchaseOrder, PurchaseOrderItem, ReceivingLog,
    StockAdjustment, CustomerPreferredProduct, PartnerLedgerEntry,
)

# --- 内联 (Inlines) 配置 ---

class OrderEventInline(admin.TabularInline):
    model = OrderEvent
    extra = 1
    fields = ('event_type', 'content', 'image', 'operator', 'created_at')
    readonly_fields = ('created_at',)

class SalesOrderItemInline(admin.TabularInline):
    model = SalesOrderItem
    extra = 1
    # 增加 display_progress 显示当前发货进度
    readonly_fields = ('display_progress',)
    fields = ('product', 'custom_product_name', 'detail_description', 'price', 'quantity', 'display_progress')

    def display_progress(self, obj):
        if obj.id:
            return f"已发: {obj.shipped_quantity} / 总量: {obj.quantity}"
        return "-"
    display_progress.short_description = "发货进度"

class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 1

# --- 主表 (Main Models) 配置 ---

@admin.register(SalesOrder)
class SalesOrderAdmin(admin.ModelAdmin):
    list_display = ('order_no', 'partner', 'status', 'total_amount', 'created_at')
    list_filter = ('status', 'partner')
    search_fields = ('order_no', 'partner__name')
    # 合并所有的 Inline，让订单页成为中控台
    inlines = [SalesOrderItemInline, OrderEventInline]

@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ('order_no', 'partner', 'status', 'total_amount', 'created_at')
    list_filter = ('status', 'partner')
    inlines = [PurchaseOrderItemInline]

# --- 日志 (Logs) 独立注册 ---
# 这样方便仓管和发货员在大表里直接查流水

@admin.register(ShippingLog)
class ShippingLogAdmin(admin.ModelAdmin):
    list_display = ('sales_item', 'quantity_shipped', 'tracking_no', 'operator', 'shipped_at')
    list_filter = ('shipped_at', 'operator')

@admin.register(ReceivingLog)
class ReceivingLogAdmin(admin.ModelAdmin):
    list_display = ('purchase_item', 'quantity_received', 'operator', 'received_at')
    list_filter = ('received_at', 'operator')


@admin.register(StockAdjustment)
class StockAdjustmentAdmin(admin.ModelAdmin):
    list_display = ('product', 'adjustment_type', 'quantity', 'operator', 'created_at')
    list_filter = ('adjustment_type', 'operator')
    search_fields = ('product__internal_code', 'product__model_name')
    readonly_fields = ('created_at',)


@admin.register(CustomerPreferredProduct)
class CustomerPreferredProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'partner', 'created_at')
    list_filter = ('partner',)
    search_fields = ('name', 'partner__name')


@admin.register(PartnerLedgerEntry)
class PartnerLedgerEntryAdmin(admin.ModelAdmin):
    list_display = ('partner', 'entry_type', 'amount', 'note', 'created_at')
    list_filter = ('entry_type', 'partner')
    search_fields = ('partner__name', 'note')
    readonly_fields = ('created_at',)
