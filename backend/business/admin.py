from django.contrib import admin
from django.utils.html import format_html
from .models import (
    SalesOrder, SalesOrderItem, ShippingLog, OrderEvent,
    PurchaseOrder, PurchaseOrderItem, ReceivingLog,
    StockAdjustment, CustomerPreferredProduct, PartnerLedgerEntry,
    ProductionOrder, ProductionOrderLine,
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
    # BOM-2.0：一条销售明细 = 外壳(product) + PCB 方案(pcb_plan) + 线材(cable)
    fields = ('product', 'pcb_plan', 'cable', 'custom_product_name', 'detail_description', 'price', 'quantity', 'display_progress')

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
    """库存调整：append-only 事件，**禁止编辑与删除**。

    业务约束：`StockAdjustment.save()` 仅在 ``is_new=True`` 时调整库存——
    意味着改字段或删记录都**不会回滚库存**。允许 admin 编辑/删除会让
    用户在不知情下让 DB 数字与实际库存永久错位。

    若要修正一笔录错的调整，请新增一条**反向类型**的 StockAdjustment 进行
    冲销（如 +1000 录错→ 新加一条 -1000 抵消）。
    详见 docs/PRD.md §3.2 与 §9.4 changelog 2026-05-11。
    """
    list_display = ('product', 'adjustment_type', 'quantity', 'operator', 'created_at')
    list_filter = ('adjustment_type', 'operator')
    search_fields = ('product__internal_code', 'product__model_name')
    # 所有字段都改成只读——admin 进详情页只能查看不能改。
    readonly_fields = ('product', 'adjustment_type', 'quantity', 'note', 'operator', 'created_at')

    def has_change_permission(self, request, obj=None):
        # 列表权限保留（可点进去查看），但编辑按钮不会出现，保存按钮也不出。
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CustomerPreferredProduct)
class CustomerPreferredProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'partner', 'created_at')
    list_filter = ('partner',)
    search_fields = ('name', 'partner__name')


@admin.register(PartnerLedgerEntry)
class PartnerLedgerEntryAdmin(admin.ModelAdmin):
    list_display = ('partner', 'entry_type', 'amount', 'debit_amount', 'credit_amount', 'note', 'created_at')
    list_filter = ('entry_type', 'partner')
    search_fields = ('partner__name', 'note')
    readonly_fields = ('created_at',)


# --- 排产（BOM 自动扣料）---

class ProductionOrderLineInline(admin.TabularInline):
    model = ProductionOrderLine
    extra = 1
    fields = ('sales_item', 'shell', 'pcb_plan', 'cable', 'quantity', 'note')


@admin.register(ProductionOrder)
class ProductionOrderAdmin(admin.ModelAdmin):
    """排产单 admin。

    PLANNED 状态可正常编辑；EXECUTED 状态下**所有字段只读**——
    与 ``rules/backend-rules.md §1.5`` 的"事件型 model"约定一致。
    若要"撤销"已执行的排产，业务上要求录反向 StockAdjustment(MANUAL_IN)
    把料退回（详见 docs/PRD.md §4 排产流程）。
    """
    list_display = ('order_no', 'plan_date', 'status', 'operator', 'created_at', 'executed_at')
    list_filter = ('status', 'plan_date')
    search_fields = ('order_no', 'note')
    readonly_fields = ('created_at', 'executed_at')
    inlines = [ProductionOrderLineInline]

    def get_readonly_fields(self, request, obj=None):
        ro = list(self.readonly_fields)
        if obj is not None and obj.status != 'PLANNED':
            # EXECUTED / CANCELLED 后整单只读
            ro.extend(['order_no', 'plan_date', 'status', 'note', 'operator'])
        return ro

    def has_delete_permission(self, request, obj=None):
        # 排产单是 append-only：不允许删（业务上用 cancel 或保留历史）
        return False
