from django.contrib import admin
from .models import (
    SalesOrder, SalesOrderItem, ShippingLog, OrderEvent,
    PurchaseOrder, PurchaseOrderItem, ReceivingLog,
    StockAdjustment, CustomerPreferredProduct, PartnerLedgerEntry,
    ProductionRecord,
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


# --- 排产记录（BOM-2.1：append-only 事件） ---

@admin.register(ProductionRecord)
class ProductionRecordAdmin(admin.ModelAdmin):
    """排产记录 admin（BOM-2.1，2026-05-27）。

    严格 **append-only**——与 ``rules/backend-rules.md §1.5`` 一致：
    - 现有字段全部只读，禁止编辑
    - 禁止删除（要"撤销"录反向 ``StockAdjustment(MANUAL_IN)``）
    - **允许创建**——admin 内部场景（如"跨订单挪用已生产成品"边缘场景）
      可以勾选 ``skip_consumption=True`` 写一条不扣料的记录。详见
      docs/PRD.md §9.3。
    """
    list_display = ('id', 'sales_item', 'quantity', 'skip_consumption', 'operator', 'executed_at')
    list_filter = ('skip_consumption', 'executed_at')
    search_fields = ('sales_item__custom_product_name', 'operator', 'note')
    readonly_fields = ('executed_at',)

    def get_readonly_fields(self, request, obj=None):
        if obj is None:
            return self.readonly_fields
        # 已存在的记录所有字段只读
        return tuple(f.name for f in self.model._meta.get_fields() if hasattr(f, 'name'))

    def has_delete_permission(self, request, obj=None):
        return False
