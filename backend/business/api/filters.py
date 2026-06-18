import django_filters

from business.models import (
    PurchaseOrder,
    SalesOrder,
    ReceivingLog,
    ShippingLog,
    StockAdjustment,
    FinancialTransaction,
    ProductionRecord,
)


class PurchaseOrderFilter(django_filters.FilterSet):
    created_from = django_filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_to = django_filters.DateFilter(field_name='created_at', lookup_expr='lte')
    order_no = django_filters.CharFilter(field_name='order_no', lookup_expr='icontains')

    class Meta:
        model = PurchaseOrder
        fields = ['status', 'partner', 'order_no']


class SalesOrderFilter(django_filters.FilterSet):
    created_from = django_filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_to = django_filters.DateFilter(field_name='created_at', lookup_expr='lte')
    order_no = django_filters.CharFilter(field_name='order_no', lookup_expr='icontains')
    partner_name = django_filters.CharFilter(field_name='partner__name', lookup_expr='icontains')

    class Meta:
        model = SalesOrder
        fields = ['status', 'partner', 'order_no', 'partner_name']


class ReceivingLogFilter(django_filters.FilterSet):
    purchase_order = django_filters.NumberFilter(field_name='purchase_item__order')
    received_from = django_filters.DateFilter(field_name='received_at', lookup_expr='gte')
    received_to = django_filters.DateFilter(field_name='received_at', lookup_expr='lte')
    operator = django_filters.CharFilter(field_name='operator', lookup_expr='icontains')

    class Meta:
        model = ReceivingLog
        fields = ['purchase_order', 'operator']


class ShippingLogFilter(django_filters.FilterSet):
    sales_order = django_filters.NumberFilter(field_name='sales_item__order')
    shipped_from = django_filters.DateFilter(field_name='shipped_at', lookup_expr='gte')
    shipped_to = django_filters.DateFilter(field_name='shipped_at', lookup_expr='lte')
    operator = django_filters.CharFilter(field_name='operator', lookup_expr='icontains')
    partner_name = django_filters.CharFilter(field_name='sales_item__order__partner__name', lookup_expr='icontains')
    partner = django_filters.NumberFilter(field_name='sales_item__order__partner')

    class Meta:
        model = ShippingLog
        fields = ['sales_order', 'operator', 'partner_name', 'partner']


class StockAdjustmentFilter(django_filters.FilterSet):
    created_from = django_filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_to = django_filters.DateFilter(field_name='created_at', lookup_expr='lte')
    note = django_filters.CharFilter(field_name='note', lookup_expr='icontains')

    class Meta:
        model = StockAdjustment
        fields = ['product', 'adjustment_type', 'operator']


class FinancialTransactionFilter(django_filters.FilterSet):
    created_from = django_filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_to = django_filters.DateFilter(field_name='created_at', lookup_expr='lte')
    note = django_filters.CharFilter(field_name='note', lookup_expr='icontains')

    class Meta:
        model = FinancialTransaction
        fields = ['partner', 'transaction_type']


class ProductionRecordFilter(django_filters.FilterSet):
    """排产记录过滤（BOM-2.1）。

    - sales_item / sales_order / partner: 按引用关系筛
    - executed_from / executed_to: 按生产时间范围
    - operator: 按操作员
    """

    sales_order = django_filters.NumberFilter(field_name='sales_item__order_id')
    partner = django_filters.NumberFilter(field_name='sales_item__order__partner_id')
    executed_from = django_filters.DateFilter(field_name='executed_at', lookup_expr='date__gte')
    executed_to = django_filters.DateFilter(field_name='executed_at', lookup_expr='date__lte')
    operator = django_filters.CharFilter(field_name='operator', lookup_expr='icontains')

    class Meta:
        model = ProductionRecord
        fields = ['sales_item', 'sales_order', 'partner', 'executed_from', 'executed_to', 'operator']
