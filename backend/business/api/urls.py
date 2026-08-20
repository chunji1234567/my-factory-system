from rest_framework.routers import DefaultRouter
from django.urls import path, include

from .views import (
    PurchaseOrderViewSet,
    SalesOrderViewSet,
    ReceivingLogViewSet,
    ShippingLogViewSet,
    StockAdjustmentViewSet,
    FinancialTransactionViewSet,
    FinancePartnerSummaryView,
    FinancePartnerDetailView,
    FinancePartnerLedgerExportView,
    CustomerPreferredProductViewSet,
    ProductionRecordViewSet,
)
from .analytics_views import (
    SalesPurchaseTrendView,
    MaterialConsumptionView,
    MaterialConsumptionExportView,
    ProductionThroughputView,
    PlanSalesView,
    MaterialDemandView,
)

router = DefaultRouter()
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchase-order')
router.register(r'sales-orders', SalesOrderViewSet, basename='sales-order')
router.register(r'customer-preferred-products', CustomerPreferredProductViewSet, basename='customer-preferred-product')
router.register(r'stock-adjustments', StockAdjustmentViewSet, basename='stock-adjustment')
router.register(r'receiving-logs', ReceivingLogViewSet, basename='receiving-log')
router.register(r'shipping-logs', ShippingLogViewSet, basename='shipping-log')
router.register(r'production-records', ProductionRecordViewSet, basename='production-record')
router.register(r'finance/transactions', FinancialTransactionViewSet, basename='finance-transaction')

urlpatterns = [
    path('', include(router.urls)),
    path('finance/partners/', FinancePartnerSummaryView.as_view(), name='finance-partner-summary'),
    path('finance/partners/<int:partner_id>/', FinancePartnerDetailView.as_view(), name='finance-partner-detail'),
    path('finance/partners/<int:partner_id>/ledger-export/', FinancePartnerLedgerExportView.as_view(), name='finance-partner-ledger-export'),
    # 2026-06-20 经营分析（manager only）——详见 business/api/analytics_views.py
    path('analytics/trend/', SalesPurchaseTrendView.as_view(), name='analytics-trend'),
    path('analytics/material-consumption/', MaterialConsumptionView.as_view(), name='analytics-material-consumption'),
    path('analytics/material-consumption/export/', MaterialConsumptionExportView.as_view(), name='analytics-material-consumption-export'),
    path('analytics/production-throughput/', ProductionThroughputView.as_view(), name='analytics-production-throughput'),
    # 2026-08-21 订单需求侧视图
    path('analytics/plan-sales/', PlanSalesView.as_view(), name='analytics-plan-sales'),
    path('analytics/material-demand/', MaterialDemandView.as_view(), name='analytics-material-demand'),
]
